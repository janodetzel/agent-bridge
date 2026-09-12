# feature-kit

A small architecture pattern for an app whose business logic something other than
a person has to be able to call — an agent, a test, a script.

It is one function and five lint rules. It knows nothing about agent-bridge; the
bridge adapts it, the same way it adapts Apollo.

## The pattern

A feature has two parts. A **spec** declares the entry points, their argument
schemas, and their descriptions. A **handlers** object implements them. The
handler signatures are derived from the spec, so the two cannot drift.

```ts
// features/favorites/spec.ts
export const favoritesSpec = {
	add: {
		args: z.object({ itemId: z.string().min(1) }),
		description:
			"Adds an item through the API and updates the cache like the UI does. No-op if already a favorite.",
	},
	remove: {
		args: z.object({ itemId: z.string().min(1) }),
		description: "Removes an item. Fails if the item is not a favorite.",
	},
} as const satisfies Spec;
```

`as const` keeps each description a literal type. `satisfies Spec` alone checks the
shape and then widens the text to `string`, which drops it from hovers and type
errors; with `as const` the description is visible wherever the spec's type is.

```ts
// features/favorites/index.ts
export const createFavorites = (deps: FavoritesDeps) =>
	defineFeature("favorites", favoritesSpec).create({
		async add({ itemId }) {
			await addFavoriteMutation(deps.apollo, itemId);
			return getFavorites(deps.apollo, "cache");
		},
		async remove({ itemId }) {
			await removeFavoriteMutation(deps.apollo, itemId);
			return getFavorites(deps.apollo, "cache");
		},
	});

export type Favorites = ReturnType<typeof createFavorites>;
```

The UI calls `favorites.add({ itemId })`. So does anything else. There is one
implementation, so a caller from outside verifies the path a user takes.

A missing handler, an extra handler, or an argument field the handler does not
destructure is a compile error.

Descriptions are part of the API, not documentation. Say what the entry point does
_not_ do — "No-op if already a favorite" saves a caller a wrong conclusion. Never
generate one from a method name.

## Why the namespace and spec hang off a symbol

`defineFeature` attaches them at `META`, a symbol. A string key such as `__meta`
or `spec` can collide with an entry-point name and break the feature silently. A
symbol cannot collide, does not appear in `Object.keys`, and is skipped by
`JSON.stringify`, so a state dump never serializes the schemas.

## The one rule that carries correctness

> **Every entry point returns a promise that resolves only when its work is
> finished, and rejects when it fails.**

There are no pure state transitions here and no effect runtime — a store action
mutates state and performs I/O in the same async function. A single
fire-and-forget call makes a caller believe a save succeeded before it ran, and
the next read is a race. Keep `@typescript-eslint/no-floating-promises` an error,
and await delegates too.

## The lint rules

The pattern is mostly constraints on how code is written, and a constraint nobody
checks is a comment. `feature-kit/eslint` is a flat-config plugin:

```js
import featureKit from "feature-kit/eslint";

export default [...featureKit.configs.recommended];
```

| Rule                      | What it catches                                                                                                                  |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `no-ui-in-logic`          | react, react-native, expo-\*, @react-navigation/\* imported into a logic file, which would make it uncallable from outside React |
| `no-cross-feature-import` | one feature importing another, instead of being wired together where the instances are created                                   |
| `no-set-outside-store`    | `set(…)` or `.setState(…)` outside a `store.ts`, which is a state change with no named entry point                               |
| `no-ambient-io`           | `Date.now` and `Math.random` in a logic file, so a caller and a test see the same values                                         |
| `require-rethrow`         | a `catch` in a store action that rolls back but does not rethrow, so the action resolves as if the write worked                  |

Each rule picks its own files from the path, so the recommended config needs no
glob that mirrors your layout. A _logic file_ is `api.ts`, `store.ts`, `spec.ts`
or `index.ts` directly inside `src/features/<name>/`. Both parts are options:

```js
"feature-kit/no-ui-in-logic": ["error", {
	featuresDir: "app/modules",
	logicFiles: ["api", "store", "spec", "index", "queries"],
}],
```

The name match means a `helpers.ts` in a feature folder slips through. Put logic a
caller needs in one of the four names, or widen `logicFiles`.

## What it deliberately does not do

No store implementation, no dependency-injection container, no effect runtime, no
base classes. Stores are plain factories that take their dependencies —
`createSettingsStore({ storage })` — which is what lets a test pass in-memory
storage. Composition is a function call in the file that creates the instances.

If a feature genuinely needs exhaustive state-transition guarantees, such as a
multi-step flow with branching and cancellation, use XState for that feature alone
and expose its `send` through a handler.

## Using it with agent-bridge

`agent-bridge/feature-kit` reads a feature's spec and emits one command per entry:

```ts
export const commandRegistry = buildRegistry(featureCommands(favorites, settings));
```

That dependency runs one way only. feature-kit never imports agent-bridge, which
is what lets either side be replaced.
