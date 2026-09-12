---
name: building-a-feature
description: Add or change a feature with @janodetzel/feature-kit so the UI and an agent call the same business logic. Use when adding a screen, a store, a mutation, or an entry point, when moving state out of a component, when a lint rule from feature-kit fails, or when a feature has logic but no spec.
---

# Building a feature

A feature is agent-addressable when every action a user can take is also a named command with typed arguments. The screen and the command call the same function on the same instances. A second implementation is worse than none, because the agent then verifies a path no user takes.

## The shape

One folder per feature, logic and UI side by side:

```
src/features/<feature>/
	spec.ts       entry points: names, argument schemas, descriptions
	index.ts      createX(deps) calling defineFeature(...).create(handlers)
	store.ts      createXStore(deps), for client state
	api.ts        one operation function per server mutation
	<Feature>Screen.tsx
```

`spec.ts` and `index.ts` are required. Add `store.ts`, `api.ts`, or both, depending on where the state lives. The lint rules treat `spec.ts`, `index.ts`, `store.ts`, and `api.ts` as logic files by name. Logic in any other file, such as `helpers.ts`, is not checked. Put it in one of the four, or widen the rules' `logicFiles` option.

## Steps

1. **Write the spec.** One entry per capability, each with a zod schema and a description:

   ```ts
   export const favoritesSpec = {
   	add: {
   		args: z.object({ itemId: z.string().min(1) }),
   		description:
   			"Adds an item to the favorites and returns the list. No-op if the item is already a favorite.",
   	},
   } as const satisfies Spec;
   ```

   Keep `as const`. Without it, `satisfies` widens each description to `string` and the text disappears from hovers and type errors.

   The description is the only thing an agent knows about the command. Say what it does, what it returns, and what it does _not_ do. Never generate it from the method name.

2. **Keep state outside the component tree.** A command runs when no component is mounted, so anything it reads or changes cannot live in `useState`.
   - Client state goes in a store created by a factory that takes its dependencies: `createFavoritesStore({ storage })`. Only `store.ts` calls `set`.
   - Server state stays in the query cache. Each mutation gets one operation function in `api.ts` that owns its cache update. Reads can stay with the query hook.
   - Storage, the network, the clock, and randomness arrive as dependencies. Take a `clock` instead of calling `Date.now()`.

3. **Implement the handlers.** The handler types come from the spec, so a missing handler, an extra handler, or an undeclared argument is a compile error:

   ```ts
   export const createFavorites = (deps: FavoritesDeps) =>
   	defineFeature("favorites", favoritesSpec).create({
   		async add({ itemId }) {
   			await deps.store.getState().add(itemId);
   			return deps.store.getState().ids;
   		},
   	});
   ```

   Every handler returns a promise that resolves when the work is finished and rejects when it fails. Await every call inside it, delegates included. A fire-and-forget call makes the command report success before the save runs.

   Return picked, JSON-safe fields, never a whole store state. Store state carries functions, and `Map`, `Set`, `NaN`, and cycles fail the command.

   The namespace is camelCase. `defineFeature` throws on anything else.

4. **Create the instance in the composition root.** One file creates the API client, the stores, the navigation reference, and the features, and passes each feature its dependencies. The UI and the command registry both import from that file. Never create a client or a store inside a component.

   A feature never imports another feature. If it needs something from a sibling, the composition root passes it a getter or a delegate, never a snapshot value.

5. **Call the feature from the screen.** The screen calls `favorites.add({ itemId })`, the same method the command calls. Move any rule in a UI handler into the feature: a `catch` that treats a conflict as success, or a guard that skips a duplicate.

6. **Register it.** Add the feature to the `featureCommands(...)` call in the registry. That emits one command per spec entry. Nothing else is registered by hand.

7. **Test and verify.** Build the feature with in-memory dependencies and call its handlers in a unit test, no simulator needed. Run `checkRegistry` from `@janodetzel/app-commands/conformance` against the registry. Then verify the behavior in the running app with the `driving-the-app` skill.

## What the checks catch

When a rule blocks you, move the code. Do not disable or widen the rule.

| Rule                                                  | Catches                                                                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@typescript-eslint/no-floating-promises`             | A promise nobody awaits. Not part of feature-kit: enable it as an error.                                                                                                                           |
| `feature-kit/no-ui-in-logic`                          | React, React Native, Expo, or React Navigation imported into a logic file                                                                                                                          |
| `feature-kit/no-set-outside-store`                    | `set` or `setState` outside `store.ts`                                                                                                                                                             |
| `feature-kit/require-rethrow`                         | A `catch` in `store.ts` that does not rethrow                                                                                                                                                      |
| `feature-kit/no-ambient-io`                           | `Date.now`, `Date.parse`, or `Math.random` in a logic file                                                                                                                                         |
| `feature-kit/no-cross-feature-import`                 | One feature importing another                                                                                                                                                                      |
| `no-sibling-feature-import` (feature-kit's depcruise) | The same, as a package edge, so a deep relative import cannot slip past                                                                                                                            |
| `checkRegistry`                                       | A duplicate or malformed name, a description no longer than the name, a schema that is not an object, a `parse` that accepts anything, and a non-JSON-safe result for commands listed in `samples` |

## Mistakes the checks miss

- A button that does something no command can do. No tool can detect it. Check that every user action has a spec entry.
- A mutation hook with its own cache update inside a component. A command cannot reach that update.
- Mutation errors returned in the result, not thrown, for example with an `errorPolicy` of `"all"`. Check the error and throw, or the command reports success on a failed write.
- A `catch` that swallows the error outside `store.ts`, for example in `api.ts` or a handler. `require-rethrow` checks store files only.
- `new Date()` without arguments in a logic file. `no-ambient-io` does not catch it, so take the time from the `clock` dependency.

## Checklist

- [ ] Every user action in the feature has a spec entry with a description that says what it does not do
- [ ] The screen calls the feature method, not a parallel implementation
- [ ] State a command needs lives in a store or the query cache, not in a component
- [ ] Instances and features are created only in the composition root
- [ ] Every handler awaits its work and rejects on failure
- [ ] Handlers return picked, JSON-safe fields
- [ ] Time, randomness, storage, and network arrive as dependencies
- [ ] The feature is passed to `featureCommands`
- [ ] Typecheck, lint, tests, and dependency-cruiser pass
- [ ] The behavior is verified in the running app with `driving-the-app`
