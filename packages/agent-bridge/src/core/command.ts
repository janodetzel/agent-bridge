import type { z } from "zod";

export type Command<A extends z.ZodTypeAny = z.ZodTypeAny, R = unknown> = {
	/** Written for the agent: what the command does, what it returns, when it does nothing. */
	description: string;
	args: A;
	run: (args: z.infer<A>) => Promise<R>;
};

export type CommandGroup = {
	namespace: string;
	commands: Record<string, Command>;
};

/** Command names in the form `<namespace>.<name>`. */
export type Registry = ReadonlyMap<string, Command>;

const NAMESPACE_PATTERN = /^[a-z][a-zA-Z0-9]*$/;

/** Identity at runtime. It exists so a command literal keeps its argument types. */
export function command<A extends z.ZodTypeAny, R>(c: Command<A, R>): Command<A, R> {
	return c;
}

export function defineCommands(namespace: string, commands: Record<string, Command>): CommandGroup {
	if (!NAMESPACE_PATTERN.test(namespace)) {
		throw new Error(
			`invalid namespace "${namespace}": expected ${NAMESPACE_PATTERN.source}, for example "favorites"`,
		);
	}
	return { namespace, commands };
}

export function buildRegistry(groups: CommandGroup[]): Registry {
	const registry = new Map<string, Command>();
	for (const group of groups) {
		for (const [name, cmd] of Object.entries(group.commands)) {
			const key = `${group.namespace}.${name}`;
			if (registry.has(key)) {
				throw new Error(`duplicate command "${key}"`);
			}
			registry.set(key, cmd);
		}
	}
	return registry;
}
