# agent-bridge

A pnpm workspace holding two packages and a todo-list example app that uses both:

- `packages/agent-bridge` - an Expo dev tools plugin. Transport, protocol, CLI, MCP
  server, web UI, and the adapters. It knows four things per command and nothing
  about how the app is built.
- `packages/feature-kit` - an architecture pattern. `defineFeature`, and the ESLint
  plugin that enforces the principles. It never imports agent-bridge.
- `apps/mobile` - the example, built on both.

`docs/architecture-principles-and-registry.md` is the source of truth. It supersedes
parts of `docs/agent-bridge-architecture.md` and `docs/package-architecture.md`, and
says which parts. Read it before changing a layer boundary or the protocol.

The example app keeps logic and UI together in `src/features/<feature>/`, and
`src/app/instances.ts` is the only file that creates instances and wires features
to each other.

## Skills

`skills/` holds the longer instructions, one folder per task, reachable as Claude
Code skills through `.claude/skills`:

| Skill                      | Use it when                                                      |
| -------------------------- | ---------------------------------------------------------------- |
| `driving-the-app`          | Verifying behavior at runtime with `pnpm agent-bridge`           |
| `workspace-setup`          | Installing, building, running the app, debugging the environment |
| `building-a-feature`       | Adding a screen, a store, a mutation, or an entry point          |
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
2. **Commands call the same functions as the UI.** A command is never a second
   implementation. The feature method _is_ the command: the screen calls
   `todos.add({ title })` and so does the bridge.
3. **Every entry point returns a promise that settles when the work is done.** A
   fire-and-forget call makes a command report success before the save runs.
   `@typescript-eslint/no-floating-promises` is an error across the workspace.

## Layer boundaries

This is the design's load-bearing wall. `pnpm depcruise` enforces it; when a rule
blocks you, move the code, do not widen the rule.

- `packages/agent-bridge/src/core` imports **nothing** - not zod, not a UI library,
  not feature-kit. It knows `Command` and `Registry` and how to answer a request.
- `packages/agent-bridge/src/adapters/<lib>` imports only `<lib>`, zod, and core.
  zod is shared because core has no validation library, so every adapter describes
  its arguments in zod and converts them in `adapters/zod.ts`.
- `packages/feature-kit` never imports `agent-bridge`. The dependency runs the other
  way: `agent-bridge/src/adapters/feature-kit` adapts it, like Apollo. depcruise
  catches a relative import; an import by package name is banned by ESLint, because
  it resolves into `build/`, which depcruise excludes.

In the app the boundaries are feature-kit's ESLint rules, matching on file names and
resolved paths: `no-ui-in-logic`, `no-cross-feature-import`, `no-set-outside-store`,
`no-ambient-io`, `require-rethrow`. A _logic file_ is `api.ts`, `store.ts`, `spec.ts`
or `index.ts` directly inside a feature folder. The match is by name, so a
`helpers.ts` slips through: put logic a command needs in one of the four, or widen
`logicFiles` in the rule's options.

## Conventions

- A feature is `spec.ts` (names, schemas, descriptions) plus `index.ts` (a
  `createX(deps)` factory calling `defineFeature(...).create(handlers)`). The
  handler signatures come from the spec, so the two cannot drift.
- Descriptions are part of the API, not documentation. Say what the command does
  _not_ do. Never generate one from a method name.
- Screens and the registry import their instances from `src/app/instances.ts`, which
  creates the stores and the features and wires them. A feature never imports another
  feature; pass a getter or a delegate there instead, never a snapshot.
- A store is a factory that takes its dependencies: `createSettingsStore({ storage })`.
  That is all that is left of dependency injection, and it is what lets a test pass
  in-memory storage.
- Only a `store.ts` file calls `set`. An optimistic update rolls back and rethrows
  on failure; the rethrow is what makes the command fail, and `require-rethrow`
  checks it.
- A mutation goes through the operation function in `api.ts`, which owns its cache
  update. `useMutation` with its own `update` puts that logic where a command cannot
  reach it. Reads stay with `useQuery`.
- A feature that writes timestamps takes a `clock` dependency instead of calling
  `Date.now`, so a command and a test see the same time.
- A command returns picked fields, not a whole store state: the state object carries
  its actions, and functions do not survive JSON.
- `src/app/commands.ts` is the only place the two layers meet: `buildRegistry` merges
  the slices that `featureCommands`, `apolloCommands` and `navigationCommands`
  return. Build it at module scope.
- `App.tsx` calls `useAgentBridge(commandRegistry)`. No Metro config and no special
  import path. `agent-bridge` is a no-op in production, which drops the hook and
  with it the only thing that connects the app to Metro. The schemas, the
  descriptions and `handleRequest` do ship, unreachable, so it is bundle size rather
  than exposure. Do not write a secret into a command description.
- Keep the strings the release check greps for out of user-facing copy, or the check
  turns into noise people learn to ignore.
- New feature with business logic? It gets a `spec.ts`, so it is reachable by
  definition. If features ship without one, the agent loses its reach one feature
  at a time.
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
6. When you add a feature with business logic, declare its entry points in the
   feature's `spec.ts`.
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
