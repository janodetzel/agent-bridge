import type { z } from "zod";

/**
 * The key a feature's namespace and spec hang off.
 *
 * A symbol, not a string: a string key such as `__meta` or `spec` can collide
 * with a command name, which would break the feature silently. A symbol cannot
 * collide, does not appear in `Object.keys`, and is skipped by `JSON.stringify`,
 * so a state dump never serializes it.
 */
export const META: unique symbol = Symbol("feature-kit.meta");

/** What a feature declares: one entry per entry point, keyed by its name. */
export type Spec = Record<string, { args: z.ZodTypeAny; description: string }>;

/**
 * The signatures the spec implies. A missing handler, an extra handler, or an
 * argument field the handler does not destructure is a compile error, so the
 * schema and the code cannot drift.
 */
export type Handlers<S extends Spec> = {
	[K in keyof S]: (args: z.infer<S[K]["args"]>) => Promise<unknown>;
};

export type FeatureMeta<S extends Spec = Spec> = { namespace: string; spec: S };

/**
 * A handlers object carrying its own namespace and spec. This is what a feature
 * factory returns, and the type the UI calls through, so a caller of
 * `todos.add({ title })` gets its argument checked.
 */
export type Feature<S extends Spec = Spec> = Handlers<S> & { [META]: FeatureMeta<S> };

/**
 * A feature whose spec is not known statically: the brand, and nothing else.
 *
 * `Feature` cannot double as that erased type. Its handlers take the arguments
 * their own schemas infer, and a function taking `{ title: string }` is not
 * assignable to one taking `unknown`, so an array of concrete features has no
 * `Feature` they all fit. A consumer walks the spec and looks handlers up by
 * name at runtime anyway, so the brand is all it needs to insist on.
 */
export type AnyFeature = { readonly [META]: FeatureMeta };

/** A namespace is the first half of a `<namespace>.<name>` entry point. */
const NAMESPACE_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Declares a feature's entry points, then takes the object that implements them.
 *
 * ```ts
 * export const createFavorites = (deps: FavoritesDeps) =>
 * 	defineFeature("favorites", favoritesSpec).create({
 * 		async add({ itemId }) { ... },
 * 	});
 * ```
 *
 * The two steps exist so the spec is inferred before the handlers are checked
 * against it. Written as one call, TypeScript would infer both at once and the
 * handler arguments would come out as `any`.
 */
export function defineFeature<S extends Spec>(namespace: string, spec: S) {
	if (!NAMESPACE_PATTERN.test(namespace)) {
		throw new Error(
			`invalid namespace "${namespace}": expected ${NAMESPACE_PATTERN.source}, for example "favorites"`,
		);
	}

	return {
		create<H extends Handlers<S>>(handlers: H): H & { [META]: FeatureMeta<S> } {
			return Object.assign(handlers, { [META]: { namespace, spec } as FeatureMeta<S> });
		},
	};
}
