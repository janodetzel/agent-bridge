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
	features/      Stores, operation functions, and command factories. No React.
apps/
	mobile/        The Expo app that registers the commands.
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

## State of the build

Tasks 1 to 3 of `docs/package-architecture.md` are done: the plugin is scaffolded
with `create-dev-plugin`, the core protocol and handler are implemented and
tested, and the app hook connects a registry to Metro. `apps/mobile` is wired up
with Apollo, Zustand, React Navigation, and a `demo` command group.

Tasks 4 to 9 are open: the CLI and its copied Expo wire format, the React
Navigation, Apollo, and Zustand adapters, the command console, and the simulator
smoke test. Until the CLI exists there is no way to call a command from a
terminal.
