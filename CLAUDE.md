# agent-bridge

A pnpm workspace holding an Expo dev tools plugin (`packages/agent-bridge`) and
the app that uses it (`apps/mobile`). `docs/agent-bridge-architecture.md` and
`docs/package-architecture.md` are the source of truth for the design; read them
before changing a layer boundary or the protocol.

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
- `packages/features` imports no React, React Native, Expo, or React Navigation,
  and reaches Apollo only through its React-free entry points.

`pnpm depcruise` enforces all three. When a rule blocks you, move the code, do not
widen the rule.

## Conventions

- Only a `store.ts` file calls `set`. An optimistic update rolls back and rethrows
  on failure; the rethrow is what makes the command fail.
- `packages/features` takes a `clock` dependency instead of calling `Date.now`.
- A command returns picked fields, not a whole store state: the state object
  carries its actions, and functions do not survive JSON.
- `apps/mobile` loads its command registry behind `__DEV__`, in
  `src/agent/groups.ts`. `useAgentBridge` is a no-op in production, but a plain
  import of the registry would still ship every command and its description.
- Keep the strings the release check greps for out of user-facing copy, or the
  check turns into noise people learn to ignore.
- New feature with business logic? Add a command for it in the feature's
  `commands.ts`. If features ship without commands, the agent loses its reach one
  feature at a time.

## Verifying behavior in the simulator

The running app exposes its business logic through `pnpm agent-bridge`.

1. Start Metro and the simulator first. Exit code 2 means the app is not connected.
2. Run `pnpm agent-bridge commands` to see every command and its arguments.
3. After a code change, reload the app (press `r` in Metro) before you run commands.
4. After a mutation that touches server data, compare `getX --source cache` with
   `getX --source network`, in that order. A difference means the cache update is
   wrong. Read `cache` first: a `network-only` query writes its result to the cache
   and hides the bug from every later `cache` read.
5. Use `nav.navigate` to put the app on a screen for a UI check. Do not verify data
   with screenshots. Use the data commands.
6. When you add a feature with business logic, add a command for it in the
   feature's `commands.ts`.
7. Every store action and operation function must return a promise that resolves
   when the work is done. Never fire and forget.

Two things to keep in mind while working:

- Only one CLI or web console can be attached at a time. The app drops the older
  one, which then exits with code 2.
- Every connected device answers. With a simulator and an emulator both on Metro, a
  command runs on both. Keep one connected.
- On the Android emulator, run `adb reverse tcp:8081 tcp:8081` once first.
