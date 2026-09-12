# agent-bridge

A pnpm workspace for an Expo app whose business logic an agent can drive from a
CLI. Commands run inside the app, on the same store instances, Apollo cache, and
navigation ref the UI uses, so a command verifies the path a user actually takes.

The design lives in `docs/`:

- `docs/architecture-principles-and-registry.md` — the current design: the
  principles, the layering, and the registry contract. Read this one first.
- `docs/agent-bridge-architecture.md` and `docs/package-architecture.md` — earlier
  documents, partly superseded. Each says which parts still hold.

## Layout

```
packages/
	agent-bridge/  Transport and CLI: the Command and Registry types, the protocol,
	               the app hook, the MCP server, the web UI, and the adapters.
	feature-kit/   An architecture pattern: defineFeature, and the lint rules that
	               keep features callable from outside React.
apps/
	example-app/   A todo list built on both.
```

The two packages are separable on purpose. `agent-bridge/src/core` imports nothing
at all, so the bridge runs against an app built on Redux, XState, MobX or plain
service classes; `feature-kit` never imports `agent-bridge`, so the pattern is
usable without it. `agent-bridge/feature-kit` is the adapter that joins them, and
it is one of four — the others bind Apollo, React Navigation and Zustand.

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

| Command                                     | What it does                                 |
| ------------------------------------------- | -------------------------------------------- |
| `pnpm build`                                | Builds the workspace packages                |
| `pnpm test`                                 | Runs the Vitest suites                       |
| `pnpm typecheck`                            | Runs `tsc --noEmit` in every package         |
| `pnpm lint`                                 | ESLint over the workspace                    |
| `pnpm depcruise`                            | Enforces the layer rules                     |
| `pnpm --filter example-app start`                | Starts Metro and the app                     |
| `pnpm --filter example-app check:release-bundle` | Fails if the bridge reaches a release bundle |

## Driving the app

With Metro and a simulator running:

```
$ pnpm agent-bridge commands
$ pnpm agent-bridge todos.add --title "Buy milk"
$ pnpm agent-bridge todos.list --source cache
$ pnpm agent-bridge settings.setUnits --units mi
$ pnpm agent-bridge nav.navigate --screen Settings
```

The same commands reach an MCP client as typed tools. `.mcp.json` registers the
`agent-bridge` server, which turns every command into one tool - `todos.add` becomes
`todos_add` - plus `commands` to refresh the list and `run` to call one by name.

`packages/agent-bridge/README.md` covers the CLI, the exit codes, the adapters, and
the console. `packages/feature-kit/README.md` covers the pattern and its lint rules.
`CLAUDE.md` says how an agent should use all of it.
