# About the agent-bridge architecture

This document describes an Expo app whose business logic an AI agent can drive through a CLI. The agent calls commands such as `todos.add`, `settings.setUnits`, and `nav.navigate` against the app running in a simulator. Each command runs the same code, on the same instances, as a tap in the UI.

The app uses three state holders:

- Zustand vanilla stores hold client state, such as settings and drafts.
- Apollo's `InMemoryCache` holds server state.
- React Navigation holds navigation state.

A dev tools plugin called `agent-bridge` connects the CLI to the app through Metro. `docs/package-architecture.md` describes that package; this document describes the app around it.

## How the pieces fit

```
agent ─▶ agent-bridge CLI ─┐
                           ├─▶ Metro (/expo-dev-plugins/broadcast) ─▶ app in simulator
web console ───────────────┘                                          │
                                                                      ▼
                                                              command registry
                                                    ┌─────────────────┼──────────────────┐
                                                    ▼                 ▼                  ▼
                                             Zustand stores     Apollo operations    navigationRef
                                                    │                 │                  │
                                                    └──── same instances the UI uses ────┘
```

The CLI and the web console are the same kind of client to the app, and the app keeps only one of them at a time. See "Limits" at the end.

## Three rules the design depends on

Everything else in this document is a consequence of these rules. If one of them breaks, the agent verifies something the user never sees.

1. **Commands use the same instances as the UI.** Create the Zustand stores, the `ApolloClient`, and the `navigationRef` as module singletons outside React. An `ApolloClient` created inside a component with `useMemo` is unreachable for the bridge.
2. **Commands call the same functions as the UI.** A command never contains its own business logic. It validates arguments, calls a store action or an operation function, and returns the result. If the UI and a command reach the same goal through different code, the agent tests the wrong path.
3. **Every async action returns a promise that resolves when the work is done, and rejects when it fails.** A single fire-and-forget call breaks verification, because the command reports success before the save runs. `@typescript-eslint/no-floating-promises` catches most violations.

## Repo layout

The repo is a pnpm workspace with one package and one app.

```
packages/
	agent-bridge/    The dev tools plugin: core protocol, app hook, adapters, CLI, web console.
apps/
	mobile/
		src/
			app/         App.tsx, instances.ts, agent.ts, api.ts
			features/
				todos/     api.ts, commands.ts, TodosScreen.tsx
				settings/  store.ts, commands.ts, SettingsScreen.tsx
			navigation/  routes.ts, RootNavigator.tsx
```

A feature holds its logic and its UI side by side. `src/app/instances.ts` is the only file that creates instances, which is what rule 1 reduces to in practice.

An earlier draft of this document put the features in their own package, `packages/features`, with dependency-cruiser forbidding React there. That split is the next step if this becomes a product; it is not what an example app needs. What remains of it is a lint rule on file names, described under "What keeps this honest".

## Client state: Zustand vanilla stores

A store is a factory that takes its dependencies. The app creates one instance, and views and commands both use it.

```ts
// src/features/settings/store.ts
import { createStore } from "zustand/vanilla";

export type SettingsState = { units: "km" | "mi"; notifications: boolean };

export type SettingsActions = {
	load(): Promise<void>;
	setUnits(units: SettingsState["units"]): Promise<void>;
	setNotifications(notifications: boolean): Promise<void>;
};

export type SettingsDeps = {
	storage: { get(): Promise<SettingsState | null>; set(s: SettingsState): Promise<void> };
};

export const createSettingsStore = (deps: SettingsDeps) =>
	createStore<SettingsState & SettingsActions>()((set, get) => ({
		units: "km",
		notifications: true,

		async load() {
			const saved = await deps.storage.get();
			if (saved) set(saved);
		},

		async setUnits(units) {
			await update(set, get, deps, { units });
		},

		async setNotifications(notifications) {
			await update(set, get, deps, { notifications });
		},
	}));

export type SettingsStore = ReturnType<typeof createSettingsStore>;
```

The shared `update` helper sets the new value, saves, and on failure rolls back and rethrows. Two conventions replace the discipline that a reducer architecture would enforce:

- Only store files call `set`. This one is a convention, not a lint rule.
- An optimistic update rolls back and rethrows on failure. The rethrow is what makes the command fail.

Views read with `useStore(settingsStore, (s) => s.units)` and call `settingsStore.getState().setUnits("mi")`, the same method the command calls.

Inject a `clock` dependency where a store writes timestamps. A store that calls `Date.now()` directly produces different results on every test run, and a lint rule rejects it in a feature's logic files.

## Server state: Apollo operation functions

Apollo's cache is the store for server data. Do not copy server data into Zustand.

The cache-update logic lives in one operation function per mutation. The operation function takes the client as an argument and has no React imports. The UI and the command both call it. If the UI instead uses `useMutation(ADD_TODO, { update })` with its own `update`, the UI and the command update the cache in two different ways.

```ts
// src/features/todos/api.ts
import type { ApolloClient, Reference } from "@apollo/client";

export async function addTodo(client: ApolloClient, title: string): Promise<Todo> {
	const { data, error } = await client.mutate({
		mutation: ADD_TODO,
		variables: { title },
		update(cache, { data }) {
			const added = data?.addTodo;
			if (!added) return;
			cache.modify({
				fields: {
					todos(existing: readonly Reference[] = []): readonly Reference[] {
						const ref = cache.writeFragment({ data: added, fragment: TODO_FIELDS });
						return ref ? [...existing, ref] : existing;
					},
				},
			});
		},
	});
	if (error) throw error;
	return data.addTodo;
}

export async function getTodos(client: ApolloClient, source: "cache" | "network"): Promise<Todo[]> {
	const { data } = await client.query({
		query: TODOS,
		fetchPolicy: source === "cache" ? "cache-only" : "network-only",
	});
	return data?.todos ?? [];
}
```

The explicit `error` check matters. With `errorPolicy: "none"`, the default, a GraphQL error rejects. With `errorPolicy: "all"`, it resolves and puts the error in the result. The check makes the function fail under either policy, and a command is only as honest as the promise it awaits.

Apollo Client 4 changed where React lives: the root `@apollo/client` entry point is React-free, and the hooks are under `@apollo/client/react`. An earlier draft of this document said to import `@apollo/client/core` in logic files, which was the version 3 answer. The rule now is that a feature's logic files import from the root entry and never from `@apollo/client/react`.

In a screen:

```tsx
const { data } = useQuery(TODOS);
const onAdd = () => addTodo(apolloClient, title);
```

Reads in the UI stay with `useQuery`, because that hook subscribes the screen to the cache. Mutations go through the operation function.

## Navigation: a ref, and an adapter

Create the ref once, in `instances.ts`, and pass it to the container.

```ts
// src/app/instances.ts
export const navigationRef = createNavigationContainerRef<RootStackParamList>();
```

```tsx
<NavigationContainer ref={navigationRef}>{/* navigators */}</NavigationContainer>
```

The navigation commands come from `agent-bridge/react-navigation` rather than being written per app. The adapter waits until the target route is focused and fails when it does not arrive: in a dev build, `navigate()` with a route that no navigator handles logs a warning and does not throw, so the wait is the only failure signal there is.

Route names must exist at runtime, which types do not, so the app passes a `z.enum`:

```ts
// src/navigation/routes.ts
export const RouteName = z.enum(["Home", "Settings"]);

type Assert<T extends true> = T;
export type RoutesMatchTheNavigator = Assert<
	[z.infer<typeof RouteName>] extends [keyof RootStackParamList]
		? [keyof RootStackParamList] extends [z.infer<typeof RouteName>]
			? true
			: false
		: false
>;
```

The type test fails to compile when the enum and the param list drift apart.

Navigation stays out of the features. `addTodo` returns a result, and the screen decides whether to navigate. If an operation function navigated, a CLI call would change screens in the simulator as a side effect.

## Commands

A command has a description, a Zod schema for its arguments, and an async `run`. A group gives a set of commands a namespace.

```ts
// src/features/todos/commands.ts
import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

export const todosCommands = (client: ApolloClient) =>
	defineCommands("todos", {
		list: command({
			description:
				"Returns the todos. source=cache is what the screen shows right now, source=network is what the server has.",
			args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
			run: ({ source }) => getTodos(client, source),
		}),

		add: command({
			description: "Adds a todo through the API and updates the cache the way the screen does.",
			args: z.object({ title: z.string().min(1) }),
			run: async ({ title }) => {
				await addTodo(client, title);
				return getTodos(client, "cache");
			},
		}),
	});
```

Commands are addressed as `<namespace>.<name>`. `buildRegistry` throws on a duplicate key and names it, so two groups cannot quietly shadow each other.

Write the description for the agent. Say what the command does, what it returns, and when it does nothing.

`settings.get` picks fields instead of returning `store.getState()`. The state object includes the action functions, which do not survive `JSON.stringify` - the handler rejects such a result with `NOT_SERIALIZABLE` and the path of the offending value.

### Detecting cache bugs with `source`

`todos.list --source cache` and `todos.list --source network` should return the same list after a mutation. If they differ, the `update` function in the operation function is wrong. The UI looks correct until the next refetch, so this class of bug is otherwise hard to see.

Read `cache` first and `network` second. A `network-only` query writes its result to the cache, which hides the bug from every later `cache` read.

## Registration

One file builds the groups:

```ts
// src/app/agent.ts
export const agentGroups = [
	todosCommands(apolloClient),
	settingsCommands(settingsStore),
	apolloCommands(apolloClient),
	navigationCommands(navigationRef, { routes: RouteName }),
];
```

Two of those groups come from the app's features and two from the package's adapters: `apolloCommands` adds `apollo.cache` and `apollo.refetch` for looking into the cache directly, which is worth having when `--source cache` and `--source network` disagree and you need to see why.

`App.tsx` loads that file behind `__DEV__` and hands the result to the hook:

```tsx
const agentGroups: CommandGroup[] = __DEV__ ? require("./agent").agentGroups : [];

export default function App() {
	useAgentBridge(agentGroups);
	return (
		<ApolloProvider client={apolloClient}>
			<NavigationContainer ref={navigationRef}>
				<RootNavigator />
			</NavigationContainer>
		</ApolloProvider>
	);
}
```

Both halves of that guard are needed. `agent-bridge` already exports a no-op in production, which drops the hook and the handler; without the `__DEV__` require, a plain import would still pull every command and every description into a release bundle. A release export of this app was checked and contained neither.

The array lives at module scope. Built inside the component, it would be a new array on every render, rebuilding the registry and reconnecting the bridge each time; the hook warns once in development when it sees that.

## The protocol, in one paragraph

The CLI asks the app for `commands` and gets every command with its description and the JSON Schema of its arguments; it then sends `run` with the command name and arguments. A response is `{ ok: true, result, durationMs }` or `{ ok: false, error, code, issues? }`, where `code` is one of `UNKNOWN_COMMAND`, `INVALID_ARGS`, `COMMAND_FAILED`, `TIMEOUT`, `NOT_SERIALIZABLE`, or `PROTOCOL_MISMATCH`. `issues` holds the Zod errors, so the agent can fix a bad call without guessing. Exit code 0 means the command ran, 1 means it failed or the call was wrong, and 2 means the app could not be reached. `docs/package-architecture.md` has the details.

## What keeps this honest

Conventions decay. These are the checks that hold the rules up, and each one exists because it caught something.

| Check                                                                                                          | What it protects                                                              |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| dependency-cruiser: `src/core` imports no UI library; each adapter imports only its own                        | Keeps the core usable in the app, the CLI, and tests                          |
| dependency-cruiser: no unresolvable imports                                                                    | The layer rules match resolved paths, so a typo'd import would slip past them |
| ESLint: `src/features/*/{api,store,commands}.ts` may not import React, React Native, Expo, or React Navigation | Rule 2: logic a command calls must run outside React                          |
| ESLint: no `Date.now` or `Math.random` in those same files                                                     | A command and a test must see the same values                                 |
| `@typescript-eslint/no-floating-promises`, workspace-wide                                                      | Rule 3                                                                        |
| A type test on `RouteName` against `RootStackParamList`                                                        | The runtime enum and the navigator cannot drift                               |
| `test/production-bundle.test.ts`                                                                               | The package entry point stays a no-op in production                           |
| `pnpm --filter mobile check:release-bundle`                                                                    | The app ships neither the bridge nor its command descriptions                 |
| `buildRegistry` throwing on a duplicate key, exercised in tests                                                | Two groups cannot shadow each other                                           |

Two notes on the lint rule. It matches three file names, so a `helpers.ts` in a feature folder slips through: put logic a command needs in one of the three, or widen the pattern. And when you change a dependency-cruiser rule, plant a violation and watch it fail before trusting a green run - the rules match resolved paths under `node_modules`, and an earlier version of them silently matched nothing.

## Tests use the same functions

Commands are testable without a simulator, because `handleRequest` takes only a registry.

- Build Zustand stores with in-memory storage and a fixed clock.
- Build an `ApolloClient` against the app's stand-in schema, or with `MockLink`. The operation functions need no `MockedProvider`, because they have no React imports.
- Build a registry from these instances and call `handleRequest` directly.

`apps/mobile/test/commands.test.ts` does exactly this: it adds a todo and then compares `todos.list` from cache and from the server, which catches a broken `update` before the agent does, and it asserts that a failing save rolls the store back and fails the command.

## Decisions and trade-offs

**Zustand plus operation functions instead of a TCA-style reducer architecture.** The CLI needs one store the UI subscribes to, awaitable mutations, injected dependencies, and serializable results. Zustand, Apollo, and plain async functions provide all four with about a third of the code of a custom reducer runtime. The cost is weaker guarantees. Nothing forces a change through a named action, tests assert only what you write down, and you handle cancellation with `AbortController` yourself. For a feature with real flow logic, such as a multi-step process with cancellation and races, use XState for that feature alone - and make its commands wait for the resulting state rather than returning as soon as the event is sent.

**Mutations go through operation functions, not `useMutation`.** `useMutation` ties the cache-update logic to a component, where the command cannot reach it. The cost is that screens handle loading and error state for mutations themselves, with local state or a small `useOperation` hook. Reads stay with `useQuery`.

**Features live in the app, not in their own package.** The example app is meant to show commands, not architecture. One app, no provider, and screens that import their instances directly. The cost is that a screen test cannot be handed a different store - you mock `../app/instances` instead - and that the logic boundary is a lint rule on file names rather than a package boundary. Both are acceptable here and both are the first things to change if this grows.

**Navigation stays out of business logic.** Operation functions and store actions return results. Screens decide where to navigate. This keeps features free of React Navigation and keeps CLI calls from changing screens as a side effect.

**Navigation commands do not verify business logic.** They put the app on a specific screen so a UI check has something to look at. The data commands verify the logic.

**The inspection adapters are read-only.** `agent-bridge/zustand` exposes `store.get` and nothing that writes. A command that called `setState` would put the app in a state no tap can produce, and the agent would verify something users never see. To change state, expose the store action as a command in the feature.

**Screen readiness is not solved yet.** `nav.navigate` waits until the route is focused, not until the screen's queries have loaded. If agents start to fail on this, add a dev-only `useAgentReady("Todos", !loading)` hook that `navigate` waits on. Do not build it before an agent actually fails on it.

## Limits

**One browser-side client at a time.** The app keeps a single client per plugin and terminates the previous one when another connects, so the CLI and the web console cannot both be attached. This is Expo's behavior, not something this design chose; the CLI reports it and exits 2 rather than working around it.

**Every connected app answers.** Metro's endpoint forwards a request to every connected client, including a second device. With a simulator and an emulator on the same Metro, a command runs on both and the CLI takes the first answer. Keep one device connected while an agent works.

**The bridge is a remote control for the app.** It accepts any valid command from anything that can reach Metro. Keep it out of release builds with the checks above. Keep Metro bound to localhost on shared networks. Do not point a dev build with the bridge at production backend data.

## How the agent uses it

`CLAUDE.md` carries the short version, and `skills/driving-the-app` the long one: start Metro and the simulator, ask the app for `commands`, reload after a code change, compare cache and network after a mutation, use `nav.navigate` to set up a screen but never screenshots to verify data, and add a command for every feature with business logic. If features ship without commands, the agent loses its reach one feature at a time.
