# app-commands

An AI agent that works on a mobile app has a slow way to check its work. It taps through screens, takes screenshots, and reads values out of pixels. Twenty taps to put a todo list into one state, and a screenshot that cannot tell a cached value from a saved one.

This project is about a different way to build the app. Every capability the app has can be reached by name, with typed arguments, from outside the user interface:

```
$ pnpm cmd todos.add --title "Buy milk"
$ pnpm cmd todos.list --source network
```

The command runs inside the running app. It calls the same function the **Add** button calls, on the same store, the same GraphQL cache, and the same navigation reference. So the agent sets up a state, exercises a behavior, and reads the result in one call, and it verifies the code path a user takes.

We call an app built this way _agent-addressable_. [`docs/principles.md`](docs/principles.md) describes how to build one in eleven principles, each with a mechanical check. That document is the source of truth. This README introduces the idea and the workspace.

## One function, two clients

The central idea is old. A screen is one client of the application. A command is another. Neither owns the behavior.

A feature declares its entry points once, with an argument schema and a description:

```ts
// features/todos/spec.ts
export const todosSpec = {
	add: {
		args: z.object({ title: z.string().min(1) }),
		description:
			"Adds a todo through the API, updates the cache the way the screen does, and returns the todos from the cache. A repeated title adds a second todo.",
	},
} as const satisfies Spec;
```

The implementation is typed from the spec, so the two cannot drift:

```ts
// features/todos/index.ts
export const createTodos = (deps: TodosDeps) =>
	defineFeature("todos", todosSpec).create({
		async add({ title }) {
			await addTodo(deps.apollo, title);
			return getTodos(deps.apollo, "cache");
		},
	});
```

The screen calls `todos.add({ title })`. The command `todos.add` calls the same method. There is no second implementation for the agent, so the agent cannot report success for behavior that users never see.

The rest of the principles protect that one property. An entry point returns a promise that settles when the work is done, or the command reports success before the save runs. State lives outside the component tree, or a command has nothing to read when no screen is mounted. One file creates every instance, or a command eventually talks to a different client than the UI.

## The eleven principles

Each principle in [`docs/principles.md`](docs/principles.md) says what to do, why it matters to an agent, and which check fails the build when code breaks it.

1. [The user interface is a client, not the application](docs/principles.md#1-the-user-interface-is-a-client-not-the-application)
2. [One definition per capability](docs/principles.md#2-one-definition-per-capability)
3. [Every entry point is awaitable and honest](docs/principles.md#3-every-entry-point-is-awaitable-and-honest)
4. [State is owned outside the component tree](docs/principles.md#4-state-is-owned-outside-the-component-tree)
5. [Instances are created in one place](docs/principles.md#5-instances-are-created-in-one-place)
6. [The world arrives through dependencies](docs/principles.md#6-the-world-arrives-through-dependencies)
7. [Features own a slice and never import a sibling](docs/principles.md#7-features-own-a-slice-and-never-import-a-sibling)
8. [Descriptions are API, not documentation](docs/principles.md#8-descriptions-are-api-not-documentation)
9. [Commands assert data; pixels are verified elsewhere](docs/principles.md#9-commands-assert-data-pixels-are-verified-elsewhere)
10. [The transport is replaceable](docs/principles.md#10-the-transport-is-replaceable)
11. [Every principle has a mechanical check](docs/principles.md#11-every-principle-has-a-mechanical-check)

The principles are constraints, not a framework. They name no state library, navigation library, or validation library. An app can follow all of them without the packages in this repo.

## What the packages add

The packages make the principles cheap to follow and expensive to break. They are separate on purpose, and the runtime dependency runs one way.

| Package                                             | What it is                                                                                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`@janodetzel/app-commands`](packages/app-commands) | The command contract, `handleRequest`, the wire protocol, the `appcmd` CLI, an MCP server, a web console, and adapters for feature-kit, Apollo, React Navigation, Zustand, and zod. The Expo transport is behind `/expo`. |
| [`@janodetzel/feature-kit`](packages/feature-kit)   | `defineFeature`, five ESLint rules, and a dependency-cruiser rule that keep a feature callable from outside React. It never imports app-commands at runtime.                                                              |

The core of app-commands knows four things about a command: a description, a JSON Schema, a `parse` function, and a `run` function. It imports nothing, so it works with an app built on Redux, XState, MobX, or plain service classes. feature-kit is one way to produce those four things, and `app-commands/adapters/feature-kit` joins the two.

The mechanical checks from principle 11 live in these packages. For example, `no-floating-promises` catches a fire-and-forget call, `no-ambient-io` catches `Date.now` in a logic file, `no-cross-feature-import` catches one feature reaching into another, and a conformance test fails on an empty description.

## The workspace

This is a pnpm workspace with the two packages and an example app that uses both:

```
packages/
	app-commands/    @janodetzel/app-commands
	feature-kit/     @janodetzel/feature-kit
apps/
	example-app/     an Expo todo list built on both packages
docs/
	principles.md    the eleven principles and their checks
```

The example app is small on purpose. It exists to show the principles in running code:

```
apps/example-app/src/
	app/
		instances.ts    the only file that creates stores, the Apollo client, and the navigation ref
		commands.ts     the registry, where features and adapters meet
		App.tsx         calls useAppCommands(commandRegistry)
		api.ts          a stand-in backend, so the example runs offline
	features/
		todos/          spec.ts, index.ts, api.ts, and the screens
		settings/       spec.ts, index.ts, store.ts, and the screen
		news/           spec.ts, index.ts, api.ts, store.ts, and the screen
```

## Run the example

To install and build the packages, run:

```
pnpm install
pnpm build
```

To start Metro and the app, run `pnpm --filter example-app start` and open the app in the iOS simulator. On the Android emulator, run `adb reverse tcp:8081 tcp:8081` once first.

With the app open, list its commands and call one:

```
$ pnpm cmd commands
$ pnpm cmd todos.add --title "Buy milk"
$ pnpm cmd todos.list --source cache
$ pnpm cmd nav.navigate --screen Settings
```

The CLI asks the app for its commands on every call, so a new command works after a Metro reload. Exit code 2 means the CLI could not reach the app.

An MCP client reaches the same commands as typed tools. [`.mcp.json`](.mcp.json) registers the `app-commands` server, which names each tool with `_` in place of the dot: `todos.add` becomes `todos_add`.

## Checks

Run all four before you call a change done:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise
```

| Command                                          | What it checks                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------- |
| `pnpm typecheck`                                 | `tsc --noEmit` in every package                                     |
| `pnpm lint`                                      | ESLint, including the feature-kit rules                             |
| `pnpm test`                                      | Builds the packages, then runs the Vitest suites                    |
| `pnpm depcruise`                                 | The layer boundaries between core, adapters, packages, and features |
| `pnpm --filter example-app check:release-bundle` | That no trace of the command transport reaches a release bundle     |

## Further reading

- [`docs/principles.md`](docs/principles.md) explains each principle and what it does not claim.
- [`packages/app-commands/README.md`](packages/app-commands/README.md) covers the command contract, the CLI and its exit codes, the MCP server, the adapters, and release builds.
- [`packages/feature-kit/README.md`](packages/feature-kit/README.md) covers `defineFeature` and the lint rules.
- [`CLAUDE.md`](CLAUDE.md) tells an agent how to work in this repo. The skills in `packages/app-commands/skills` and `packages/feature-kit/skills` hold the longer instructions.
