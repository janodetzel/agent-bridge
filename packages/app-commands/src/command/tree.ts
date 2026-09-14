import type { Registry } from "../core/command";
import { isCallableCommand } from "./builder";
import { isPlainObject } from "./input";

/**
 * Features, keyed by namespace. A feature is a plain object of commands, and may
 * hold other features: `{ profile: { settings: settingsFeature } }`.
 */
export type CommandTree = { readonly [namespace: string]: object };

const SEGMENT = /^[a-z][a-zA-Z0-9]*$/;

/**
 * Collects every command in a tree of features into a registry, named by its
 * path: `featureCommands({ todos })` gives `todos.add`, and a feature nested in
 * another adds a segment, `profile.settings.setUnits`. Merging two features into
 * one namespace is a spread, `{ ...a, ...b }`.
 *
 * Each `command()` goes into the registry as it is. Other plain objects are
 * walked; everything else is skipped, so a store or a client hung on a feature is
 * never entered.
 */
export function featureCommands(tree: CommandTree): Registry {
	const registry: Registry = {};
	const walking = new Set<object>();

	const visit = (node: object, path: string[]) => {
		if (walking.has(node)) {
			throw new Error(`"${path.join(".")}" contains itself; a feature tree cannot be cyclic`);
		}
		walking.add(node);

		for (const [key, value] of Object.entries(node)) {
			const command = isCallableCommand(value);
			if (!command && !isPlainObject(value)) continue;

			const name = [...path, key].join(".");
			if (!SEGMENT.test(key)) {
				throw new Error(
					`invalid name "${name}": each segment must match ${SEGMENT.source}, for example "favorites"`,
				);
			}

			if (!command) {
				visit(value, [...path, key]);
			} else if (path.length === 0) {
				throw new Error(
					`"${key}" is a command without a namespace; pass it inside a feature, for example { demo: { ${key} } }`,
				);
			} else {
				registry[name] = value;
			}
		}

		walking.delete(node);
	};

	visit(tree, []);
	return registry;
}
