/**
 * What agent-bridge knows about a command: four things, and nothing about where
 * they came from.
 *
 * This module imports nothing - not zod, not a UI library, not the feature
 * layer. That is the property that lets the bridge run against an app built on
 * Redux, XState, MobX, or plain service classes. An adapter supplies the four
 * fields; how it got them is its own business.
 */

export type ParseResult = { ok: true; value: unknown } | { ok: false; issues: unknown[] };

export type Command = {
	/** Written for the agent: what the command does, what it returns, when it does nothing. */
	description: string;
	/** JSON Schema of the arguments, for the CLI flags and the web UI form. */
	jsonSchema: object;
	/**
	 * Returns parsed arguments or the issues that stopped them. agent-bridge
	 * never validates: keeping `parse` a function rather than a schema object is
	 * what keeps every validation library out of this package's dependencies, so
	 * a Valibot or ArkType app is not forced to install zod. One built on a
	 * Standard Schema `~standard.validate` is a few lines.
	 */
	parse: (input: unknown) => ParseResult;
	run: (args: unknown) => Promise<unknown>;
};

/** Commands keyed as `<namespace>.<name>`. */
export type Registry = Record<string, Command>;

/**
 * Merges the slices the adapters return into one registry, throwing on a
 * duplicate key so two adapters cannot quietly shadow each other.
 */
export function buildRegistry(...slices: Registry[]): Registry {
	const registry: Registry = {};

	for (const slice of slices) {
		for (const [name, command] of Object.entries(slice)) {
			if (Object.hasOwn(registry, name)) {
				throw new Error(`duplicate command "${name}"`);
			}
			registry[name] = command;
		}
	}

	return registry;
}

/**
 * A registry is a plain object, so `registry[name]` would answer for `toString`
 * and `constructor` too. Every lookup goes through here.
 */
export function lookup(registry: Registry, name: string): Command | undefined {
	return Object.hasOwn(registry, name) ? registry[name] : undefined;
}
