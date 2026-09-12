---
name: building-a-feature
description: Add or change a feature in apps/mobile so an agent can drive it from the CLI. Use when adding a screen, a store, a GraphQL mutation, or an entry point, when wiring new state into the app, or when a feature exists but has no spec. Covers the folder shape, the four rules that keep commands honest, registration, and the tests to write.
---

# Building a feature

A feature holds its logic and its UI side by side:

```
src/features/<feature>/
	spec.ts         the entry points: names, argument schemas, descriptions
	index.ts        createX(deps) -> defineFeature(...).create(handlers)
	api.ts          operation functions over Apollo, one per mutation, each owning its cache update
	store.ts        createXStore(deps) for client state
	gql.ts          queries, mutations, fragments
	<Feature>Screen.tsx
```

`spec.ts` and `index.ts` are the feature. The rest depends on where its state lives:
`todos` has `api.ts` and `gql.ts`; `settings` has `store.ts`; `news` has both.

## The four rules

Break one of these and a command verifies something a user never sees.

1. **One instance.** `src/app/instances.ts` is the only file that creates the
   client, the stores, and the navigation ref. The screen and the command both
   import from there. A client built inside a component with `useMemo` is
   unreachable for the bridge.
2. **One code path.** The feature method _is_ the command. The screen calls
   `todos.add({ title })` and so does the bridge, so there is nothing to keep in
   sync. If the screen reaches the same goal another way, the agent tests the
   wrong path.
3. **Promises settle when the work is done.** Every entry point resolves only after
   the save or the request finished, and rejects when it failed. A fire-and-forget
   call makes a command report success before the work runs.
   `@typescript-eslint/no-floating-promises` catches most of it.
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
calls `set` — `feature-kit/no-set-outside-store` enforces it. An optimistic update
rolls back and rethrows on failure; the rethrow is what makes the command fail, and
`feature-kit/require-rethrow` fails the build without it.

Take a `clock` dependency instead of calling `Date.now`, or a test and a command see
different times. `feature-kit/no-ambient-io` catches that one.

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

## The spec and the handlers

`spec.ts` declares what exists:

```ts
export const todosSpec = {
	list: {
		args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
		description:
			"Returns the todos. source=cache is what the screen shows now, source=network is what the server has. Read cache first: a network read writes to the cache and hides a broken cache update.",
	},
} satisfies Spec;
```

`index.ts` implements it:

```ts
export const createTodos = (deps: TodosDeps) =>
	defineFeature("todos", todosSpec).create({
		async list({ source }) {
			return getTodos(deps.apollo, source);
		},
	});

export type Todos = ReturnType<typeof createTodos>;
```

The handler signatures come from the spec, so a missing handler, an extra one, or a
field the handler destructures that the schema does not declare is a compile error.

Write the description for the agent: what it does, what it returns, and what it does
_not_ do. It is all the agent gets, and "no-op if already dismissed" saves a wrong
conclusion. Never generate one from the method name.

Namespaces are camelCase, and `defineFeature` throws on anything else.

Expose a `source: "cache" | "network"` argument on every read of server data. That
pair is what makes a broken cache update visible.

## Registering it

Create the feature in `src/app/instances.ts`, next to the instances it needs:

```ts
export const todos = createTodos({ apollo: apolloClient });
```

Then add it to the `featureCommands(...)` call in `src/app/commands.ts`:

```ts
export const commandRegistry = buildRegistry(
	featureCommands(todos, news, settings),
	apolloCommands(apolloClient),
	navigationCommands(navigationRef as NavigationRef, { routes: RouteName }),
);
```

`App.tsx` passes that to `useAgentBridge`, and nothing else is needed.

A new screen also needs an entry in `src/navigation/routes.ts` — both in
`RootStackParamList` and in the `RouteName` enum, which a type test keeps in sync.

## The boundary

`api.ts`, `store.ts`, `spec.ts` and `index.ts` may not import React, React Native,
Expo, or React Navigation; `feature-kit/no-ui-in-logic` enforces it. The rule matches
those four names only, so a `helpers.ts` in a feature folder slips through — put logic
a command needs in one of the four, or widen `logicFiles` in the rule's options.

A feature never imports another feature; `feature-kit/no-cross-feature-import` enforces
that. Wire them together in `src/app/instances.ts`, passing a getter or a delegate —
never a snapshot value, or the port goes stale.

## Tests

`handleRequest` needs only a registry, so commands are testable without a simulator:
build the store with in-memory storage, build an `ApolloClient` against the stand-in
schema in `src/app/api.ts`, wrap the feature with `featureCommands`, and call it the
way the CLI does. See `apps/mobile/test/features.test.ts`.

Worth a test every time: cache and network agree after a mutation; a failing save
rolls the store back and fails the command; an invalid argument is rejected.

## Checklist

- [ ] Instances come from `src/app/instances.ts`
- [ ] The screen calls the feature method, not a parallel implementation
- [ ] Every async path resolves when the work is done, and rejects when it fails
- [ ] The command returns picked, JSON-safe fields
- [ ] Reads of server data take `source`
- [ ] The feature is in `src/app/commands.ts`
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise`
- [ ] Verified in the simulator with `pnpm agent-bridge`
