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

Not available yet: the CLI is task 4 and 5 of `docs/package-architecture.md`.
Once `pnpm agent-bridge` exists, this section takes the content of "How the agent
uses it" from `docs/agent-bridge-architecture.md`, with command names in the
`<namespace>.<name>` form.
