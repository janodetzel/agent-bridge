# app-commands

A pnpm workspace for an Expo app whose business logic an agent can drive from a
CLI. Commands run inside the app, on the same store instances, Apollo cache, and
navigation ref the UI uses, so a command verifies the path a user actually takes.

The design lives in `docs/`:

- `docs/principles.md` — **the source of truth.** Eleven principles for an
  agent-addressable app, each with a mechanical check. Read this one first;
  nothing else restates it.
- `docs/architecture-principles-and-registry.md`,
  `docs/agent-bridge-architecture.md` and `docs/package-architecture.md` — earlier
  documents, superseded by `principles.md` and still using the old package names.

## Layout

```
packages/
	app-commands/  @janodetzel/app-commands — transport and CLI: the Command and
	               Registry types, the protocol, the Expo hook behind /expo, the MCP
	               server, the web UI, the conformance suite, and the adapters.
	feature-kit/   @janodetzel/feature-kit — an architecture pattern: defineFeature,
	               plus the ESLint and dependency-cruiser configs that keep features
	               callable from outside React.
apps/
	example-app/   A todo list built on both.
```

The two packages are separable on purpose — that is principle 10.
`app-commands/src/core` imports nothing at all, so it runs against an app built on
Redux, XState, MobX or plain service classes; `feature-kit` may name
`@janodetzel/app-commands` only in an `import type`, so the pattern is usable
without it. `app-commands/feature-kit` is the adapter that joins them, and it is
one of five — the others bind Apollo, React Navigation, Zustand and zod.

`apps/example-app` is deliberately small. Logic and UI sit together in a feature folder,
and one file creates every instance:

```
src/
	app/
		App.tsx
		instances.ts    the only file that creates instances, and wires the features
		commands.ts     the registry: where the two layers meet
		api.ts          a stand-in backend, so the example runs offline
	features/
		todos/          spec.ts, index.ts, api.ts, gql.ts, TodosScreen.tsx
		settings/       spec.ts, index.ts, store.ts, SettingsScreen.tsx
		news/           spec.ts, index.ts, api.ts, store.ts, gql.ts, NewsScreen.tsx
	navigation/
		routes.ts, RootNavigator.tsx
```

## Commands

| Command                                          | What it does                                 |
| ------------------------------------------------ | -------------------------------------------- |
| `pnpm build`                                     | Builds the workspace packages                |
| `pnpm test`                                      | Runs the Vitest suites                       |
| `pnpm typecheck`                                 | Runs `tsc --noEmit` in every package         |
| `pnpm lint`                                      | ESLint over the workspace                    |
| `pnpm depcruise`                                 | Enforces the layer rules                     |
| `pnpm --filter example-app start`                | Starts Metro and the app                     |
| `pnpm --filter example-app check:release-bundle` | Fails if the bridge reaches a release bundle |

## Driving the app

With Metro and a simulator running:

```
$ pnpm cmd commands
$ pnpm cmd todos.add --title "Buy milk"
$ pnpm cmd todos.list --source cache
$ pnpm cmd settings.setUnits --units mi
$ pnpm cmd nav.navigate --screen Settings
```

The same commands reach an MCP client as typed tools. `.mcp.json` registers the
`app-commands` server, which turns every command into one tool - `todos.add` becomes
`todos_add` - plus `commands` to refresh the list and `run` to call one by name.

`packages/app-commands/README.md` covers the CLI, the exit codes, the adapters, and
the console. `packages/feature-kit/README.md` covers the pattern and its lint rules.
`CLAUDE.md` says how an agent should use all of it.
