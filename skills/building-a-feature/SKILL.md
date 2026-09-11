---
name: building-a-feature
description: Add or change a feature in apps/mobile so an agent can drive it from the CLI. Use when adding a screen, a store, a GraphQL mutation, or a command, when wiring new state into the app, or when a feature exists but has no command. Covers the folder shape, the four rules that keep commands honest, registration, and the tests to write.
---

# Building a feature

A feature holds its logic and its UI side by side:

```
src/features/<feature>/
	api.ts          operation functions over Apollo, one per mutation, each owning its cache update
	store.ts        createXStore(deps) for client state
	commands.ts     the command group
	<Feature>Screen.tsx
```

Not every feature needs all four. `todos` has `api.ts`; `settings` has `store.ts`.

## The four rules

Break one of these and a command verifies something a user never sees.

1. **One instance.** `src/app/instances.ts` is the only file that creates the
   client, the stores, and the navigation ref. The screen and the command both
   import from there. A client built inside a component with `useMemo` is
   unreachable for the bridge.
2. **One code path.** A command validates its arguments, calls the function the
   screen calls, and returns the result. It holds no logic of its own. If the screen
   reaches the same goal another way, the agent tests the wrong path.
3. **Promises settle when the work is done.** Every store action and operation
   function resolves only after the save or the request finished, and rejects when
   it failed. A fire-and-forget call makes a command report success before the work
   runs. `@typescript-eslint/no-floating-promises` catches most of it.
4. **Results survive JSON.** Return picked fields, never a whole store state: the
   state object carries its actions, and functions do not survive `JSON.stringify`.
   `Date` becomes an ISO string; `Map`, `Set`, `NaN`, and cycles fail the command.

## Client state: a store factory

```ts
export const createSettingsStore = (deps: SettingsDeps) =>
	createStore<SettingsState & SettingsActions>()((set, get) => ({ … }));
```

The factory takes its dependencies as parameters. That is the whole of dependency
injection here, and it is what lets a test pass in-memory storage. Only `store.ts`
calls `set`. An optimistic update rolls back and rethrows on failure — the rethrow
is what makes the command fail.

Take a `clock` dependency instead of calling `Date.now`, or a test and a command see
different times.

## Server state: an operation function

Apollo's cache is the store for server data; never copy server data into Zustand.
One function per mutation in `api.ts`, each owning its `update`. Both the screen and
the command call it:

```tsx
const onAdd = () => addTodo(apolloClient, title); // screen
run: async ({ title }) => {
	await addTodo(client, title);
	return getTodos(client, "cache");
};
```

Reads stay with `useQuery`, because that hook subscribes the screen to the cache.
Mutations go through the operation function; `useMutation` with its own `update`
puts the cache logic inside a component, where a command cannot reach it.

Check `error` on the mutation result and throw. With `errorPolicy: "all"` the errors
arrive in the result instead of being thrown, and a command that ignores them
reports success on a failed mutation.

## The command group

```ts
export const todosCommands = (client: ApolloClient) =>
	defineCommands("todos", {
		list: command({
			description:
				"Returns the todos. source=cache is what the screen shows now, source=network is what the server has.",
			args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
			run: ({ source }) => getTodos(client, source),
		}),
	});
```

Write the description for the agent: what it does, what it returns, when it does
nothing. It is all the agent gets. Namespaces are camelCase; names are unique per
namespace or `buildRegistry` throws.

Expose a `source: "cache" | "network"` argument on every read of server data. That
pair is what makes a broken cache update visible.

## Registering it

Add the group to `src/app/agent.ts`:

```ts
export const agentGroups = [todosCommands(apolloClient), settingsCommands(settingsStore), …];
```

`App.tsx` loads that file behind `__DEV__`, which is what keeps commands and their
descriptions out of release builds. Leave that guard alone. A new screen also needs
an entry in `src/navigation/routes.ts` — both in `RootStackParamList` and in the
`RouteName` enum, which a type test keeps in sync.

## The boundary

`api.ts`, `store.ts`, and `commands.ts` may not import React, React Native, Expo, or
React Navigation; a lint rule on those three file names enforces it. The rule matches
those names only, so a `helpers.ts` in a feature folder slips through — put logic a
command needs in one of the three, or widen the pattern in `eslint.config.mjs`.

## Tests

`handleRequest` needs only a registry, so commands are testable without a simulator:
build the store with in-memory storage, build an `ApolloClient` against the stand-in
schema in `src/app/api.ts`, and call the commands the way the CLI does. See
`apps/mobile/test/commands.test.ts`.

Worth a test every time: cache and network agree after a mutation; a failing save
rolls the store back and fails the command; an invalid argument is rejected.

## Checklist

- [ ] Instances come from `src/app/instances.ts`
- [ ] The screen and the command call the same function
- [ ] Every async path resolves when the work is done, and rejects when it fails
- [ ] The command returns picked, JSON-safe fields
- [ ] Reads of server data take `source`
- [ ] The group is in `src/app/agent.ts`
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise`
- [ ] Verified in the simulator with `pnpm agent-bridge`
