# agent-bridge: architecture principles and the registry contract

This document holds the current design. It supersedes two things in the earlier documents:

- `agent-bridge-architecture.md`: the sections on command definition and the registry. The app architecture, the Apollo and navigation patterns, and the CI rules in that document still hold.
- `package-architecture.md`: the `CommandGroup` type, `defineCommands`, `buildRegistry`, the `Command` type, and the placement of the adapters inside the plugin package. Replace them with the contract in this document, and move the adapter task from the plugin package to `app-kit`. Everything else in that brief, including the wire protocol, the CLI behavior, the error codes, and the task order, still holds. The `handleRequest` steps in that brief that parse Zod schemas now call `Command.parse` instead.

Read this document before implementing either of the others.

## What the design is for

An AI agent runs typed commands against the app in a simulator through a CLI. The business logic is written once. The UI calls it as plain functions, and the CLI calls the same functions through an Expo dev tools plugin. No command is registered by hand, and the CLI discovers what exists at runtime.

Two separable things are described here. `agent-bridge` is a transport and a CLI, and it knows nothing about how the app is built. The feature conventions, `defineFeature` and the adapters, are one way to produce commands for it. The section on layering below draws that line, and it is the one boundary in this design that must not blur.

## Principles

The design keeps three of TCA's five principles and drops two on purpose.

**Kept: state is owned in one place.** Server state lives in the Apollo cache. Client state lives in Zustand stores created outside React. The UI subscribes to the same instances the commands call. Nothing important lives in component state.

**Kept: changes happen through named entry points with data-shaped arguments.** Every entry point is an async method whose single argument is a plain object validated by a Zod schema. A named, serializable entry point is what makes a command possible. Direct `set()` calls at call sites are banned by lint.

**Kept: the outside world arrives through injected dependencies.** Stores and features are factories that take their dependencies. Nothing reads the network, storage, the clock, or randomness implicitly.

**Dropped: pure state transitions.** Store actions mutate state and perform I/O in the same async function.

**Dropped: effects as values returned by a reducer.** There is no effect runtime. An async function that returns a promise replaces it.

Dropping those two removes the custom runtime and most of the boilerplate. It costs the exhaustive test guarantee that no unexpected state change happened. For a feature that genuinely needs that guarantee, such as a multi-step flow with branching and cancellation, use XState for that feature alone and expose its `send` through a handler. Do not reintroduce reducers across the app.

Because principle 4 is gone, one rule carries the weight of correctness:

> **Every entry point returns a promise that resolves only when its work is finished, and rejects when it fails.**

A single fire-and-forget call makes a command report success before the save runs, and the agent's next read is a race. Keep `@typescript-eslint/no-floating-promises` as an error. Await delegates too.

## Two further rules

**Commands use the same instances as the UI.** One file creates the Apollo client, the stores, and the navigation ref. Both the UI and the agent registry read from it. If a command constructs its own client, it verifies a path no user takes.

**Commands call the same functions as the UI.** A command is never a second implementation. The feature method _is_ the command.

## Layering

`agent-bridge` is a transport and a CLI. The feature conventions are a separate layer that produces commands for it. Keeping them apart is what makes the bridge reusable in an app built on Redux, XState, MobX, or plain service classes.

```
app         features, instances, the glue that builds a Registry
	│
app-kit     defineFeature, META, collectCommands, the Apollo/navigation/store adapters
	│         (imports agent-bridge types only as types)
agent-bridge  Registry, handleRequest, protocol, useAgentBridge, CLI
```

### What agent-bridge knows

Four things per command, and nothing about where they came from.

```ts
// agent-bridge/core
export type Command = {
	description: string;
	/** JSON Schema of the arguments, for the CLI flags and the web UI form. */
	jsonSchema: object;
	/** Returns parsed args or issues. agent-bridge never validates itself. */
	parse: (input: unknown) => { ok: true; value: unknown } | { ok: false; issues: unknown[] };
	run: (args: unknown) => Promise<unknown>;
};

export type Registry = Record<string, Command>; // keys are full command names
```

`parse` is a function rather than a schema object on purpose. It keeps every validation library out of the bridge's dependencies, so a Valibot or ArkType user is not forced to install Zod, and a `parse` built on a Standard Schema `~standard.validate` is a few lines.

`handleRequest` calls `parse`, then `run`, then serializes. It has no notion of a feature, a namespace, or a spec.

### The rule that keeps the layers apart

> **Nothing under `agent-bridge/` may import zod, `@apollo/client`, `@react-navigation/*`, zustand, or anything from the feature layer.**

Enforce it with a dependency-cruiser rule, not a review convention. While that rule holds, moving the layers into separate published packages is a mechanical change whenever you want it. Once it breaks, no number of packages will restore the separation.

### How many packages to build now

Two, in one repo:

- **`agent-bridge`**: core, the `useAgentBridge` hook, the CLI. Publishable in principle. Do not publish yet.
- **`app-kit`**: `defineFeature`, `META`, `collectCommands`, and the adapters. It imports `agent-bridge`'s `Registry` and `Command` types with `import type` only, so there is no runtime dependency.

A third package holding the feature conventions with no agent-bridge reference at all is the technically cleaner decomposition, and it is only worth the version coordination once a second consumer exists, such as a Storybook panel or an MCP server exposing the same commands. Until then, the type-only import costs nothing and can be inlined later.

### The glue

The app converts features into a `Registry`. This is the only place the two layers meet, and it is about ten lines.

```ts
// src/app/agent.ts
import { z } from "zod";
import { collectCommands } from "app-kit";
import type { Registry } from "agent-bridge/core";

const toRegistry = (features: AgentFeature[]): Registry =>
	Object.fromEntries(
		collectCommands(features).map((c) => [
			c.name,
			{
				description: c.description,
				jsonSchema: z.toJSONSchema(c.schema),
				parse: (input: unknown) => {
					const r = c.schema.safeParse(input);
					return r.success
						? { ok: true as const, value: r.data }
						: { ok: false as const, issues: r.error.issues };
				},
				run: c.run,
			},
		]),
	);

export const agentRegistry = toRegistry([
	favorites,
	settings,
	navigationCommands(navigationRef, { routes: RouteName }),
]);
```

```tsx
// src/app/App.tsx
useAgentBridge(agentRegistry);
```

Build the registry at module scope. A registry built inside a component rebuilds on every render and re-subscribes the listener.

## Feature definition

This section describes the `app-kit` layer. An app may replace all of it and still use `agent-bridge`, as long as it produces a `Registry`.

A feature has two parts. A spec declares the command names, their argument schemas, and their descriptions. A handlers object implements them. The handler signatures are derived from the spec, so the schema and the code cannot drift.

```ts
// app-kit
import type { z } from "zod";

export const META = Symbol("agent-bridge.meta");

export type Spec = Record<string, { args: z.ZodTypeAny; description: string }>;

export type Handlers<S extends Spec> = {
	[K in keyof S]: (args: z.infer<S[K]["args"]>) => Promise<unknown>;
};

export type FeatureMeta<S extends Spec = Spec> = { namespace: string; spec: S };

export type AgentFeature<S extends Spec = Spec> = Handlers<S> & { [META]: FeatureMeta<S> };

// namespace must match /^[a-z][a-zA-Z0-9]*$/. Throws otherwise.
export function defineFeature<S extends Spec>(namespace: string, spec: S) {
	assertNamespace(namespace);
	return {
		create<H extends Handlers<S>>(handlers: H): H & { [META]: FeatureMeta<S> } {
			return Object.assign(handlers, { [META]: { namespace, spec } as FeatureMeta<S> });
		},
	};
}
```

`META` is a symbol, not a string key. A string such as `__agent` or `spec` can collide with a command name, which would break the feature silently. A symbol cannot collide, does not appear in `Object.keys`, and is skipped by `JSON.stringify`, so a state dump never serializes it.

`Handlers<S>` makes the type system do the enforcement. A missing handler, an extra handler, or an argument field the handler does not destructure is a compile error.

Usage:

```ts
// src/features/favorites/spec.ts
export const favoritesSpec = {
	add: {
		args: z.object({ itemId: z.string().min(1) }),
		description:
			"Adds an item through the API and updates the cache like the UI does. No-op if already a favorite.",
	},
	remove: {
		args: z.object({ itemId: z.string().min(1) }),
		description: "Removes an item. Fails if the item is not a favorite.",
	},
	refresh: {
		args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
		description:
			"Reloads favorites. cache returns what the UI shows now, network returns what the server has.",
	},
} as const satisfies Spec;
```

```ts
// src/features/favorites/index.ts
export const createFavorites = (deps: FavoritesDeps) =>
	defineFeature("favorites", favoritesSpec).create({
		async add({ itemId }) {
			await addFavoriteMutation(deps.apollo, itemId);
			return getFavorites(deps.apollo, "cache");
		},
		async remove({ itemId }) {
			await removeFavoriteMutation(deps.apollo, itemId);
			return getFavorites(deps.apollo, "cache");
		},
		async refresh({ source }) {
			return getFavorites(deps.apollo, source);
		},
	});

export type Favorites = ReturnType<typeof createFavorites>;
```

The UI calls `favorites.add({ itemId })`. The bridge calls the same method. There is one implementation.

Descriptions are part of the API, not documentation. Write them for the agent, and say what the command does not do. "No-op if already a favorite" saves the agent a wrong conclusion. Never generate a description from a method name.

## Collecting commands

Commands are collected from the features themselves. There is no separate group object and no manual registration. The output is a neutral list that still carries the Zod schema, so the glue decides what to do with it.

```ts
// app-kit
export type CollectedCommand = {
	name: string; // "<namespace>.<key>"
	description: string;
	schema: z.ZodTypeAny;
	run: (args: unknown) => Promise<unknown>;
};

export function collectCommands(features: AgentFeature[]): CollectedCommand[] {
	const seen = new Set<string>();
	const out: CollectedCommand[] = [];
	for (const feature of features) {
		const { namespace, spec } = feature[META];
		for (const [key, { args, description }] of Object.entries(spec)) {
			const name = `${namespace}.${key}`;
			if (seen.has(name)) throw new Error(`duplicate command ${name}`);
			const handler = (feature as Record<string, unknown>)[key];
			if (typeof handler !== "function") throw new Error(`missing handler for ${name}`);
			seen.add(name);
			out.push({
				name,
				description,
				schema: args,
				run: (a) => (handler as (x: unknown) => Promise<unknown>)(a),
			});
		}
	}
	return out;
}
```

The spec is the enumeration. `collectCommands` iterates spec keys and looks each one up on the feature object, so a method that is not in the spec is never reachable as a command. The runtime `typeof` check exists for JavaScript callers and for a feature object assembled dynamically, where the compile-time check does not apply.

The app passes the collected list to `toRegistry` from the glue section above, and the result to `useAgentBridge`.

## Adapters

The adapters live in `app-kit`, not in `agent-bridge`, because they depend on specific libraries. Each returns an `AgentFeature` built with `defineFeature`, so it collects the same way as a hand-written feature. Their namespaces default to `nav`, `apollo`, and `store`, and each factory takes a `namespace` option for an app that needs a different name.

```ts
export function navigationCommands(
	ref: NavigationContainerRefWithCurrent<any>,
	opts: { routes: z.ZodEnum<any>; namespace?: string; focusTimeoutMs?: number },
): AgentFeature;
```

## Composition

Features are factories. They receive narrow ports, not whole stores, and they announce events through delegate callbacks. All wiring happens in the one file that creates instances.

```ts
const favorites = createFavorites({ apollo, units: () => settingsStore.getState().units });
const auth = createAuth({ api, onSignedOut: () => favorites.clearLocal({}) });
```

Pass a getter function, never a snapshot value, or the port goes stale. Await every delegate, or the command result lies. Never wire features with cross-store `subscribe` chains: their order is undefined and the agent cannot see them in a result.

A feature never imports another feature. Enforce it with a lint rule that forbids imports between `src/features/<a>/` and `src/features/<b>/`.

A multi-step flow is its own feature that takes the others as dependencies and contains only sequencing.

## React integration

- **Read state** with `useQuery` for server data and `useStore(store, selector)` for client state. Always pass a selector.
- **Call actions** directly: `favorites.add({ itemId })`. No dispatch wrapper.
- **Props** carry plain data and callbacks. Presentational components never receive a feature or a store.
- **Component state** keeps ephemeral UI state. Move a draft into a store only when the agent must manipulate it, and decide that per feature.

The bridge must not read props, `useState` values, or hook internals, even though agent-device can reach them through CDP. Those are implementation details, so assertions on them break on refactors that change nothing functional. When an agent reaches for a prop to check data, a feature command is missing.

## Checks to enforce

1. dependency-cruiser forbids every import of zod, `@apollo/client`, `@react-navigation/*`, zustand, and `app-kit` from `agent-bridge/**`. This is the layering rule, and it is the check that matters most.
2. dependency-cruiser forbids runtime imports of `agent-bridge` from `app-kit/**`. Only `import type` is allowed.
3. A test builds a `Registry` by hand, without `app-kit`, and runs `handleRequest` against it. If that test needs anything from the feature layer, the bridge is not agnostic.
4. A test asserts `collectCommands` throws on a duplicate name and on a missing handler, naming the command in both cases.
5. A test asserts `defineFeature` rejects an invalid namespace.
6. A test asserts that a feature whose spec contains a key named `spec` or `namespace` still collects and runs, which is the regression test for the symbol.
7. `@typescript-eslint/no-floating-promises` is an error in every file that holds business logic.
8. Lint forbids `set(` outside store files, and forbids imports between sibling feature folders.
9. Lint forbids `react`, `react-native`, and `expo-*` imports in feature logic files.
10. A release bundle contains neither `agent-bridge` nor `useDevToolsPluginClient`.

## Open questions carried over

These are still unanswered and must be verified against the installed Expo version, not assumed:

1. The exact browser-side handshake the installed Expo version sends.
2. Whether the app keeps several browser-side clients of one plugin connected at the same time, which decides whether the CLI and the web UI can run together.
3. Whether Metro in this repo resolves the package subpath exports without extra config.
4. Whether `z.toJSONSchema` covers every construct the specs use, for the CLI flag parser and the web UI form.
