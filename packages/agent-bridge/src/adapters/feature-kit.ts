import { META, type AnyFeature } from "feature-kit";

import type { Registry } from "../core/command";
import { fromZod } from "./zod";

/**
 * Binds feature-kit to the bridge. It is an adapter like the others: it reads
 * one library's objects and emits Commands. feature-kit knows nothing about
 * agent-bridge, which is what lets either side be replaced.
 *
 * The spec is the enumeration. This iterates spec keys and looks each one up on
 * the feature object, so a method that is not in the spec is never reachable as
 * a command.
 */
export function featureCommands(...features: AnyFeature[]): Registry {
	const registry: Registry = {};

	for (const feature of features) {
		const { namespace, spec } = feature[META];

		for (const [name, { args, description }] of Object.entries(spec)) {
			const key = `${namespace}.${name}`;
			if (Object.hasOwn(registry, key)) {
				throw new Error(`duplicate command "${key}"`);
			}

			// The compile-time check in `defineFeature().create()` already covers a
			// TypeScript caller. This is for JavaScript, and for a feature object
			// assembled at runtime.
			const handler = (feature as Record<string, unknown>)[name];
			if (typeof handler !== "function") {
				throw new Error(`missing handler for "${key}"`);
			}

			const run = handler as (args: unknown) => Promise<unknown>;
			registry[key] = { ...fromZod(args), description, run: (a) => run(a) };
		}
	}

	return registry;
}
