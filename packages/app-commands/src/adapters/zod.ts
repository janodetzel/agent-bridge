import { z } from "zod";

import type { Command, Registry } from "../core/command";

/**
 * The one place a zod schema becomes the two neutral fields core understands.
 *
 * Core has no validation library, so every adapter would otherwise repeat this -
 * and the two options below are exactly the kind of detail that drifts between
 * copies.
 */
export function fromZod(schema: z.ZodTypeAny): Pick<Command, "jsonSchema" | "parse"> {
	return {
		// `io: "input"` keeps an argument with a `.default()` optional, which is what
		// a caller sends. `unrepresentable: "any"` keeps one exotic argument type
		// from taking down the whole listing.
		jsonSchema: z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }),
		parse: (input) => {
			const result = schema.safeParse(input);
			return result.success
				? { ok: true, value: result.data }
				: { ok: false, issues: result.error.issues };
		},
	};
}

/**
 * Builds a namespaced slice from schemas, descriptions, and handlers.
 *
 * The signature infers a schema per entry and then checks that entry's handler
 * against it, so a handler that destructures a field its own schema does not
 * declare is a compile error - the same guarantee `defineFeature` gives a
 * feature, for the adapters that have no feature to declare.
 */
export function zodCommands<S extends Record<string, z.ZodTypeAny>>(
	namespace: string,
	commands: {
		[K in keyof S]: {
			args: S[K];
			description: string;
			run: (args: z.infer<S[K]>) => Promise<unknown>;
		};
	},
): Registry {
	return Object.fromEntries(
		Object.entries(commands).map(([name, { args, description, run }]) => [
			`${namespace}.${name}`,
			{ ...fromZod(args), description, run: (a: unknown) => run(a) },
		]),
	);
}
