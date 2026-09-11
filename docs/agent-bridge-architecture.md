# About the agent-bridge architecture

This document describes an Expo app whose business logic an AI agent can drive through a CLI. The agent calls commands such as `getFavorites`, `addFavorite`, and `navigate` against the app running in a simulator. Each command runs the same code, on the same instances, as a tap in the UI.

The app uses three state holders:

- Zustand vanilla stores hold client state, such as settings and drafts.
- Apollo's `InMemoryCache` holds server state.
- React Navigation holds navigation state.

A dev tools plugin called `agent-bridge` connects the CLI to the app through Metro.

## How the pieces fit

```
agent ─▶ agent-bridge CLI ─▶ Metro (/expo-dev-plugins/broadcast) ─▶ app in simulator
                                                                     │
                                                                     ▼
                                                             command registry
                                                   ┌─────────────────┼──────────────────┐
                                                   ▼                 ▼                  ▼
                                            Zustand stores     Apollo operations    navigationRef
                                                   │                 │                  │
                                                   └──── same instances the UI uses ────┘
```

## Three rules the design depends on

Everything else in this document is a consequence of these rules. If one of them breaks, the agent verifies something the user never sees.

1. **Commands use the same instances as the UI.** Create the Zustand stores, the `ApolloClient`, and the `navigationRef` as module singletons outside React. An `ApolloClient` created inside a component with `useMemo` is unreachable for the bridge.
2. **Commands call the same functions as the UI.** A command never contains its own business logic. It validates arguments, calls a store action or an operation function, and returns the result. If the UI and a command reach the same goal through different code, the agent tests the wrong path.
3. **Every async action returns a promise that resolves when the work is done, and rejects when it fails.** A single fire-and-forget call breaks verification, because the command reports success before the save runs. `@typescript-eslint/no-floating-promises` catches most violations.

## Package layout

The repo is a pnpm workspace.

```
packages/
	features/        Stores, operation functions, GraphQL documents, command factories.
	agent-protocol/  The command type, request and response types, the request handler.
	agent-bridge/    The Expo dev tools plugin (app hook) and the CLI.
apps/
	mobile/
		src/
			deps/        Concrete dependencies: ApolloClient, repositories, clock.
			navigation/  Navigators and navigationRef.
			agent/       Navigation commands, debug commands, the registry.
			screens/     Views.
```

`packages/features` never imports `react`, `react-native`, `expo-*`, or `@react-navigation/*`. It may import `@apollo/client/core`, which has no React dependency. Enforce the rule with dependency-cruiser in CI.

## Client state: Zustand vanilla stores

A store is a factory that takes its dependencies. The app creates one instance, and views and commands both use it.

```ts
// packages/features/src/settings/store.ts
import { createStore } from "zustand/vanilla";

export type SettingsState = { units: "km" | "mi"; notifications: boolean };

export type SettingsActions = {
	load(): Promise<void>;
	setUnits(units: SettingsState["units"]): Promise<void>;
};

export interface SettingsDeps {
	storage: { get(): Promise<SettingsState | null>; set(s: SettingsState): Promise<void> };
}

export const createSettingsStore = (deps: SettingsDeps) =>
	createStore<SettingsState & SettingsActions>()((set, get) => ({
		units: "km",
		notifications: true,

		async load() {
			const saved = await deps.storage.get();
			if (saved) set(saved);
		},

		async setUnits(units) {
			const previous = get().units;
			set({ units });
			try {
				await deps.storage.set({ units, notifications: get().notifications });
			} catch (e) {
				set({ units: previous });
				throw e;
			}
		},
	}));

export type SettingsStore = ReturnType<typeof createSettingsStore>;
```

Two conventions replace the discipline that a reducer architecture would enforce:

- Only store files call `set`. A lint rule on `set(` outside `**/store.ts` enforces this.
- An optimistic update rolls back and rethrows on failure. The rethrow is what makes the command fail.

Views read with `useStore(settingsStore, (s) => s.units)` and call `settingsStore.getState().setUnits("mi")`, the same method the command calls.

Inject a `clock` dependency where a store writes timestamps. A store that calls `Date.now()` directly produces different results on every test run.

## Server state: Apollo operation functions

Apollo's cache is the store for server data. Do not copy server data into Zustand.

The cache-update logic lives in one operation function per mutation. The operation function takes the client as an argument and has no React imports. The UI and the command both call it. If the UI instead uses `useMutation(ADD_FAVORITE, { update })` with its own `update`, the UI and the command update the cache in two different ways.

```ts
// packages/features/src/favorites/api.ts
import type { ApolloClient, NormalizedCacheObject } from "@apollo/client/core";
import { ADD_FAVORITE, REMOVE_FAVORITE, FAVORITES, FAVORITE_FIELDS } from "./documents";

type Client = ApolloClient<NormalizedCacheObject>;

export async function addFavorite(client: Client, itemId: string) {
	const { data, errors } = await client.mutate({
		mutation: ADD_FAVORITE,
		variables: { itemId },
		update(cache, { data }) {
			if (!data) return;
			cache.modify({
				fields: {
					favorites(existing = []) {
						const ref = cache.writeFragment({ data: data.addFavorite, fragment: FAVORITE_FIELDS });
						return [...existing, ref];
					},
				},
			});
		},
	});
	if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
	return data!.addFavorite;
}

export async function removeFavorite(client: Client, itemId: string) {
	const { errors } = await client.mutate({
		mutation: REMOVE_FAVORITE,
		variables: { itemId },
		update(cache) {
			cache.evict({ id: cache.identify({ __typename: "Favorite", itemId }) });
			cache.gc();
		},
	});
	if (errors?.length) throw new Error(errors.map((e) => e.message).join("; "));
}

export async function getFavorites(client: Client, source: "cache" | "network") {
	const { data } = await client.query({
		query: FAVORITES,
		fetchPolicy: source === "cache" ? "cache-only" : "network-only",
	});
	return data?.favorites ?? [];
}
```

The explicit `errors` check matters. With `errorPolicy: "none"`, the default, `mutate` throws on GraphQL errors. With `errorPolicy: "all"`, it resolves and puts the errors in `result.errors`. The check makes the function throw under either policy.

In a screen:

```tsx
const client = useApolloClient();
const { data } = useQuery(FAVORITES);
const onAdd = () => addFavorite(client, itemId);
```

Reads in the UI stay with `useQuery`, because that hook subscribes the screen to the cache. Mutations go through the operation function.

## Navigation: a ref, and commands in the app layer

Create the ref once and pass it to the container.

```ts
// apps/mobile/src/navigation/ref.ts
import { createNavigationContainerRef } from "@react-navigation/native";

export const navigationRef = createNavigationContainerRef<RootStackParamList>();
```

```tsx
<NavigationContainer ref={navigationRef}>{/* navigators */}</NavigationContainer>
```

Navigation commands live in `apps/mobile/src/agent/`, because features must not import React Navigation. The same reason keeps navigation out of operation functions. `addFavorite` returns a result, and the screen decides whether to navigate. If an operation function navigated, a CLI call would change screens in the simulator as a side effect.

## Commands

A command has a description, a Zod schema for its arguments, and an async `run` function.

```ts
// packages/agent-protocol/src/command.ts
import type { z } from "zod";

export type Command<Args extends z.ZodTypeAny = z.ZodTypeAny, R = unknown> = {
	description: string;
	args: Args;
	run: (args: z.infer<Args>) => Promise<R>;
};

export const command = <Args extends z.ZodTypeAny, R>(c: Command<Args, R>) => c;

export type Registry = Record<string, Command>;
```

Write the description for the agent. Say what the command does, what it returns, and when it does nothing.

### Feature commands

Features export command factories. A factory takes the instances it needs and returns commands.

```ts
// packages/features/src/favorites/commands.ts
import { z } from "zod";
import { command } from "@app/agent-protocol";
import { addFavorite, removeFavorite, getFavorites } from "./api";

export const favoritesCommands = ({ client }: { client: Client }) => ({
	getFavorites: command({
		description:
			"Returns favorites. source=cache returns what the UI shows now. source=network returns what the server has.",
		args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
		run: ({ source }) => getFavorites(client, source),
	}),

	addFavorite: command({
		description: "Adds an item through the API and updates the cache the same way the UI does.",
		args: z.object({ itemId: z.string().min(1) }),
		run: async ({ itemId }) => {
			await addFavorite(client, itemId);
			return getFavorites(client, "cache");
		},
	}),

	removeFavorite: command({
		description: "Removes an item through the API and evicts it from the cache.",
		args: z.object({ itemId: z.string().min(1) }),
		run: async ({ itemId }) => {
			await removeFavorite(client, itemId);
			return getFavorites(client, "cache");
		},
	}),
});
```

```ts
// packages/features/src/settings/commands.ts
export const settingsCommands = (store: SettingsStore) => ({
	getSettings: command({
		description: "Returns the current settings.",
		args: z.object({}),
		run: async () => {
			const { units, notifications } = store.getState();
			return { units, notifications };
		},
	}),

	setUnits: command({
		description: "Sets the distance unit and saves it.",
		args: z.object({ units: z.enum(["km", "mi"]) }),
		run: async ({ units }) => {
			await store.getState().setUnits(units);
			return store.getState().units;
		},
	}),
});
```

`getSettings` picks fields instead of returning `store.getState()`. The state object includes the action functions, which do not survive `JSON.stringify`.

### Detecting cache bugs with `source`

`getFavorites --source cache` and `getFavorites --source network` should return the same list after a mutation. If they differ, the `update` function in the operation function is wrong. The UI looks correct until the next refetch, so this class of bug is otherwise hard to see.

Read `cache` first and `network` second. A `network-only` query writes its result to the cache, which hides the bug from every later `cache` read.

### Navigation commands

```ts
// apps/mobile/src/agent/navigation.commands.ts
import { z } from "zod";
import { command } from "@app/agent-protocol";
import type { navigationRef } from "../navigation/ref";

export const RouteName = z.enum(["Home", "ItemDetail", "Favorites", "Settings"]);

async function waitFor(check: () => boolean, timeoutMs: number) {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error(`condition not met after ${timeoutMs} ms`);
		await new Promise((r) => setTimeout(r, 50));
	}
}

export const navigationCommands = (ref: typeof navigationRef) => ({
	currentRoute: command({
		description: "Returns the focused route and its params.",
		args: z.object({}),
		run: async () => {
			const r = ref.getCurrentRoute();
			return r ? { name: r.name, params: r.params ?? null } : null;
		},
	}),

	navigate: command({
		description:
			"Navigates like a user tap. Fails if the target route does not become focused within 2 seconds.",
		args: z.object({ screen: RouteName, params: z.record(z.unknown()).optional() }),
		run: async ({ screen, params }) => {
			if (!ref.isReady()) throw new Error("navigation is not ready");
			ref.navigate(screen as never, params as never);
			await waitFor(() => ref.getCurrentRoute()?.name === screen, 2000);
			return { name: screen, params: ref.getCurrentRoute()?.params ?? null };
		},
	}),

	goBack: command({
		description: "Goes back one screen. Fails if there is no screen to go back to.",
		args: z.object({}),
		run: async () => {
			if (!ref.canGoBack()) throw new Error("cannot go back");
			ref.goBack();
			return ref.getCurrentRoute()?.name ?? null;
		},
	}),
});
```

`waitFor` is necessary. In a dev build, `navigate()` with a route that no navigator handles logs a warning and does not throw. Without the check, the command reports success while the app stays on the old screen.

`RouteName` repeats the keys of `RootStackParamList`, because types do not exist at runtime. A type test keeps them in sync:

```ts
type Assert<T extends true> = T;
type _routesMatch = Assert<
	[z.infer<typeof RouteName>] extends [keyof RootStackParamList]
		? [keyof RootStackParamList] extends [z.infer<typeof RouteName>]
			? true
			: false
		: false
>;
```

For nested navigators, use the nested form `navigate("Tabs", { screen: "Favorites" })` and extend the command with an optional `nested` argument when the first nested route appears.

### Debug commands

```ts
// apps/mobile/src/agent/debug.commands.ts
export const debugCommands = ({ client }: { client: Client }) => ({
	"debug.apolloCache": command({
		description:
			"Returns normalized cache entries whose key starts with the prefix, for example 'Favorite:'.",
		args: z.object({ prefix: z.string().min(1) }),
		run: async ({ prefix }) =>
			Object.fromEntries(
				Object.entries(client.cache.extract()).filter(([k]) => k.startsWith(prefix)),
			),
	}),
});
```

The `prefix` argument is required. A full cache dump of a real app is several megabytes and fills the agent's context with noise.

### The registry

Only `apps/mobile` knows the concrete instances, so the registry lives there.

```ts
// apps/mobile/src/agent/registry.ts
import { apolloClient } from "../deps/apollo";
import { settingsStore } from "../deps/stores";
import { navigationRef } from "../navigation/ref";

export const commandGroups = {
	favorites: favoritesCommands({ client: apolloClient }),
	settings: settingsCommands(settingsStore),
	navigation: navigationCommands(navigationRef),
	debug: debugCommands({ client: apolloClient }),
};

export const commands: Registry = Object.assign({}, ...Object.values(commandGroups));
```

`Object.assign` overwrites a duplicate name without warning. A test compares the key count of `commands` with the sum of the key counts in `commandGroups` and fails on a mismatch.

## The protocol (`packages/agent-protocol`)

| Request    | Arguments                       | Returns                                                                 |
| ---------- | ------------------------------- | ----------------------------------------------------------------------- |
| `commands` | none                            | Every command with its description and the JSON Schema of its arguments |
| `run`      | `command`, `args`, `timeoutMs?` | `result` and `durationMs`                                               |

Every response is `{ id, ok: true, result }` or `{ id, ok: false, error, issues? }`. `issues` holds the Zod validation errors, so the agent can fix bad arguments without guessing.

```ts
// packages/agent-protocol/src/handle.ts
import { z } from "zod";

export async function handleRequest(commands: Registry, req: Request): Promise<Response> {
	if (req.cmd === "commands") {
		return ok(
			req.id,
			Object.entries(commands).map(([name, c]) => ({
				name,
				description: c.description,
				args: z.toJSONSchema(c.args),
			})),
		);
	}

	const cmd = commands[req.args.command];
	if (!cmd) return fail(req.id, `unknown command ${req.args.command}`);

	const parsed = cmd.args.safeParse(req.args.args ?? {});
	if (!parsed.success) return fail(req.id, "invalid arguments", parsed.error.issues);

	const started = performance.now();
	try {
		const result = await withTimeout(cmd.run(parsed.data), req.args.timeoutMs ?? 10_000);
		return ok(req.id, { result, durationMs: Math.round(performance.now() - started) });
	} catch (e) {
		return fail(req.id, e instanceof Error ? e.message : String(e));
	}
}
```

The handler does not know about Zustand, Apollo, or React Navigation. Rule 3 carries the whole weight of correctness here. The handler can only report what the promise reports.

## The plugin (`packages/agent-bridge`)

The plugin has no web UI. It has an app-side hook and a CLI.

```
packages/agent-bridge/
	src/
		index.ts             exports useAgentBridge, a no-op in production
		useAgentBridge.ts    listens for requests and calls handleRequest
	cli/
		index.ts             entry point for the agent-bridge binary
		client.ts            WebSocket client with request IDs and timeouts
		wire/                MessageFramePacker and handshake, copied from your expo version
	package.json           "bin": { "agent-bridge": "./dist/cli/index.js" }
```

### App side

```ts
// packages/agent-bridge/src/index.ts
export let useAgentBridge: (commands: Registry) => void = () => {};
if (process.env.NODE_ENV !== "production") {
	useAgentBridge = require("./useAgentBridge").useAgentBridge;
}
```

```ts
// packages/agent-bridge/src/useAgentBridge.ts
import { useEffect } from "react";
import { useDevToolsPluginClient } from "expo/devtools";
import { handleRequest } from "@app/agent-protocol";

export function useAgentBridge(commands: Registry) {
	const client = useDevToolsPluginClient("agent-bridge");
	useEffect(() => {
		if (!client) return;
		const sub = client.addMessageListener("request", async (req) => {
			client.sendMessage("response", await handleRequest(commands, req));
		});
		return () => sub.remove();
	}, [client, commands]);
}
```

```tsx
// apps/mobile/App.tsx
export default function App() {
	useAgentBridge(commands);
	return (
		<ApolloProvider client={apolloClient}>
			<NavigationContainer ref={navigationRef}>
				<RootNavigator />
			</NavigationContainer>
		</ApolloProvider>
	);
}
```

### CLI side

The CLI connects to `ws://localhost:8081/expo-dev-plugins/broadcast`. It performs the handshake as the browser side of the `agent-bridge` plugin and packs messages with Expo's frame format. Copy `MessageFramePacker` and the handshake logic from the `expo` package in your `node_modules` into `cli/wire/`. Do not write them from memory. This protocol is internal to Expo and has changed before.

The CLI does not hard-code any command. On each call it asks the app for the `commands` list and builds flags from the JSON Schema. A new command is available to the agent after a Metro reload, with no CLI rebuild.

```
$ agent-bridge commands
$ agent-bridge getFavorites --source network
$ agent-bridge addFavorite --itemId 42
$ agent-bridge navigate --screen Favorites
$ agent-bridge debug.apolloCache --prefix Favorite:
```

Output rules:

- stdout holds one JSON document per call. Nothing else.
- stderr holds human-readable diagnostics.
- Exit code 0 means success. Exit code 1 means the command failed or was rejected. Exit code 2 means the CLI could not reach the app.

On the Android emulator, run `adb reverse tcp:8081 tcp:8081` before the first call. The iOS simulator reaches `localhost` without extra setup.

## How the agent uses it

Add this section to `CLAUDE.md`:

```md
## Verifying behavior in the simulator

The running app exposes its business logic through `pnpm agent-bridge`.

1. Start Metro and the simulator first. Exit code 2 means the app is not connected.
2. Run `pnpm agent-bridge commands` to see every command and its arguments.
3. After a code change, reload the app (press `r` in Metro) before you run commands.
4. After a mutation that touches server data, compare `getX --source cache` with `getX --source network`, in that order. A difference means the cache update is wrong.
5. Use `navigate` to put the app on a screen for a UI check. Do not use screenshots to verify data. Use the data commands.
6. When you add a feature with business logic, add a command for it in the feature's `commands.ts`.
7. Every store action and operation function you write must return a promise that resolves when the work is done. Never fire and forget.
```

Step 6 keeps the approach alive. If features ship without commands, the agent loses access one feature at a time, and nobody notices until it cannot verify anything.

## Tests use the same functions

Commands are testable in Jest without a simulator, because `handleRequest` takes only a registry.

- Build Zustand stores with in-memory dependencies and a fixed clock.
- Build an `ApolloClient` with `SchemaLink` and a mock schema, or with `MockLink`. The operation functions need no `MockedProvider`, because they have no React imports.
- Build a registry from these instances and call `handleRequest` directly.

A test that runs `addFavorite` and then compares `getFavorites` from cache and from the mock server catches a broken `update` function before the agent does.

## Rules to enforce in CI

1. dependency-cruiser fails the build if `packages/features` imports `react`, `react-native`, `expo-*`, `@react-navigation/*`, or `@apollo/client` outside `@apollo/client/core`.
2. `@typescript-eslint/no-floating-promises` is an error in `packages/features`.
3. ESLint fails on `set(` outside store files and on `Date.now` or `Math.random` in `packages/features`.
4. A test checks that command names are unique across `commandGroups`.
5. A type test checks that `RouteName` matches `RootStackParamList`.
6. A test runs every command against test instances and checks that each result survives `JSON.stringify`.
7. After a release export, CI searches the bundle for the string `agent-bridge` and fails if it finds it.
8. After every Expo SDK upgrade, a smoke test runs `agent-bridge commands` against a simulator.

## Decisions and trade-offs

**Zustand plus operation functions instead of a TCA-style reducer architecture.** The CLI needs one store the UI subscribes to, awaitable mutations, injected dependencies, and serializable results. Zustand, Apollo, and plain async functions provide all four with about a third of the code of a custom reducer runtime. The cost is weaker guarantees. Nothing forces a change through a named action, tests assert only what you write down, and you handle cancellation with `AbortController` yourself. For a feature with real flow logic, such as a multi-step process with cancellation and races, use XState for that feature alone.

**Mutations go through operation functions, not `useMutation`.** `useMutation` ties the cache-update logic to a component, where the command cannot reach it. The cost is that screens handle loading and error state for mutations themselves, with local state or a small `useOperation` hook. Reads stay with `useQuery`.

**Navigation stays out of business logic.** Operation functions and store actions return results. Screens decide where to navigate. This keeps features free of React Navigation and keeps CLI calls from changing screens as a side effect.

**Navigation commands do not verify business logic.** They put the app on a specific screen so Maestro or agent-device can check the rendering. The data commands verify the logic.

**Screen readiness is not solved yet.** `navigate` waits until the route is focused, not until the screen's queries have loaded. If agents start to fail on this, add a dev-only `useAgentReady("Favorites", !loading)` hook that `navigate` waits on. Do not build it before an agent actually fails on it.

**The bridge is a remote control for the app.** It accepts any valid command from anything that can reach Metro. Keep it out of release builds with the CI check above. Keep Metro bound to localhost on shared networks. Do not point a dev build with the bridge at production backend data.
