# agent-bridge

A pnpm workspace holding an Expo dev tools plugin (`packages/agent-bridge`) and a
todo-list example app that uses it (`apps/mobile`). `docs/agent-bridge-architecture.md`
and `docs/package-architecture.md` are the source of truth for the design; read them
before changing a layer boundary or the protocol.

The example app keeps logic and UI together in `src/features/<feature>/`, and
`src/app/instances.ts` is the only file that creates instances. The architecture doc
names the larger split - a provider, and features in their own package - as the next
step if this grows into a product, not the shape it has now.

## Skills

`skills/` holds the longer instructions, one folder per task, reachable as Claude
Code skills through `.claude/skills`:

| Skill                      | Use it when                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `driving-the-app`          | Verifying behavior at runtime with `pnpm agent-bridge`           |
| `workspace-setup`          | Installing, building, running the app, debugging the environment |
| `building-a-feature`       | Adding a screen, a store, a mutation, or a command               |
| `state-architecture`       | Deciding how a feature holds state                               |
| `maintaining-agent-bridge` | Changing the plugin: protocol, CLI, adapters, wire format        |

## Checks

Run these before you call a change done:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise
```

`pnpm --filter agent-bridge build:all` builds the plugin and exports the web UI.
`pnpm --filter mobile check:release-bundle` exports a production bundle and fails
if the bridge appears in it.

## Rules the design depends on

1. **Commands use the same instances as the UI.** Create the Zustand stores, the
   `ApolloClient`, and the `navigationRef` as module singletons outside React. A
   client created inside a component with `useMemo` is unreachable for the bridge.
2. **Commands call the same functions as the UI.** A command validates its
   arguments, calls a store action or an operation function, and returns the
   result. It holds no business logic of its own.
3. **Every async action returns a promise that settles when the work is done.** A
   fire-and-forget call makes a command report success before the save runs.
   `@typescript-eslint/no-floating-promises` is an error across the workspace.

## Layer boundaries

- `packages/agent-bridge/src/core` imports no UI or state library. It runs in the
  app, in the CLI, and in tests.
- `packages/agent-bridge/src/adapters/<lib>` imports only `<lib>` and core.

`pnpm depcruise` enforces both. When a rule blocks you, move the code, do not widen
the rule.

In the app, the same idea is a lint rule on file names: `src/features/*/api.ts`,
`store.ts`, and `commands.ts` may not import React, React Native, Expo, or React
Navigation, because a command has to be able to call them from outside React. The
rule matches those three names only, so a `helpers.ts` in a feature folder slips
through. Put logic a command needs in one of the three, or widen the pattern.

## Conventions

- Screens and commands import their instances from `src/app/instances.ts`. A client
  or a store created inside a component is unreachable for a command.
- A store is a factory that takes its dependencies: `createSettingsStore({ storage })`.
  That is all that is left of dependency injection, and it is what lets a test pass
  in-memory storage.
- Only a `store.ts` file calls `set`. An optimistic update rolls back and rethrows
  on failure; the rethrow is what makes the command fail.
- A mutation goes through the operation function in `api.ts`, which owns its cache
  update. `useMutation` with its own `update` puts that logic where a command cannot
  reach it. Reads stay with `useQuery`.
- A feature that writes timestamps takes a `clock` dependency instead of calling
  `Date.now`, so a command and a test see the same time.
- A command returns picked fields, not a whole store state: the state object carries
  its actions, and functions do not survive JSON.
- `useAgentBridge()` takes no groups. `metro.config.js` wraps its config with
  `withAgentBridge`, which swaps the package's empty groups module for
  `src/app/agent.ts` in a development bundle; a release bundle keeps the empty one.
  The hook is a no-op in production too, but without that swap the commands and their
  descriptions would still ship. Deferring the import at runtime does not work: the
  dependency edge is created by the import, not by the call.
- Keep the strings the release check greps for out of user-facing copy, or the check
  turns into noise people learn to ignore.
- New feature with business logic? Add a command for it in the feature's
  `commands.ts`. If features ship without commands, the agent loses its reach one
  feature at a time.
- A screen cannot be handed a different store in a test, because there is no
  provider. Mock `../app/instances` when you need that.

## Verifying behavior in the simulator

The running app exposes its business logic through `pnpm agent-bridge`.

1. Start Metro and the simulator first. Exit code 2 means the app is not connected.
2. Run `pnpm agent-bridge commands` to see every command and its arguments.
3. After a code change, reload the app (press `r` in Metro) before you run commands.
4. After a mutation that touches server data, compare `todos.list --source cache`
   with `todos.list --source network`, in that order. A difference means the cache
   update is wrong. Read `cache` first: a `network-only` query writes its result to
   the cache and hides the bug from every later `cache` read.
5. Use `nav.navigate` to put the app on a screen for a UI check. Do not verify data
   with screenshots. Use the data commands.
6. When you add a feature with business logic, add a command for it in the
   feature's `commands.ts`.
7. Every store action and operation function must return a promise that resolves
   when the work is done. Never fire and forget.

`.mcp.json` registers an `agent-bridge` MCP server that exposes the same commands as
tools, named with `_` in place of the dot (`todos.add` becomes `todos_add`). Prefer
those tools when they are in your tool list; call the `commands` tool after reloading
the app, because the tool list is a snapshot.

Two things to keep in mind while working:

- Only one CLI, web console, or MCP server can be attached at a time. The app drops
  the older one, which then exits with code 2.
- Every connected device answers. With a simulator and an emulator both on Metro, a
  command runs on both. Keep one connected.
- On the Android emulator, run `adb reverse tcp:8081 tcp:8081` once first.
