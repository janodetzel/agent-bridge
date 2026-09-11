# agent-bridge

A pnpm workspace for an Expo app whose business logic an agent can drive from a
CLI. Commands run inside the app, on the same store instances, Apollo cache, and
navigation ref the UI uses, so a command verifies the path a user actually takes.

The design lives in `docs/`:

- `docs/agent-bridge-architecture.md` — the app architecture and the three rules it
  depends on.
- `docs/package-architecture.md` — the build plan for `packages/agent-bridge`, in
  nine tasks.

## Layout

```
packages/
	agent-bridge/  The Expo dev tools plugin: core protocol, app hook, CLI, web UI.
apps/
	mobile/        A todo list that registers its commands with the bridge.
```

`apps/mobile` is deliberately small. Logic and UI sit together in a feature folder,
and one file creates every instance:

```
src/
	app/
		App.tsx
		instances.ts    the only file that creates instances
		agent.ts        the command groups
		api.ts          a stand-in backend, so the example runs offline
	features/
		todos/          api.ts, commands.ts, TodosScreen.tsx
		settings/       store.ts, commands.ts, SettingsScreen.tsx
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
| `pnpm --filter mobile start`                | Starts Metro and the app                     |
| `pnpm --filter mobile check:release-bundle` | Fails if the bridge reaches a release bundle |

## Driving the app

With Metro and a simulator running:

```
$ pnpm agent-bridge commands
$ pnpm agent-bridge todos.add --title "Buy milk"
$ pnpm agent-bridge todos.list --source cache
$ pnpm agent-bridge settings.setUnits --units mi
$ pnpm agent-bridge nav.navigate --screen Settings
```

`packages/agent-bridge/README.md` covers the CLI, the exit codes, the adapters, and
the console. `CLAUDE.md` says how an agent should use it.

## State of the build

All nine tasks of `docs/package-architecture.md` are done. The plugin is scaffolded
with `create-dev-plugin`; the core, the app hook, the CLI with Expo's wire format,
the three adapters, and the web console are implemented and tested; and the smoke
test ran against the iOS simulator and the Android emulator, both of which also
pass the release-bundle check.
