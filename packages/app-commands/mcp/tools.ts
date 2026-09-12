/**
 * Turns the command list the app reports into MCP tools.
 *
 * The app's JSON Schema becomes the tool's input schema as it stands. The app owns
 * validation - it holds the Zod schema and answers INVALID_ARGS with the issues - so
 * a second opinion here would only be a staler one.
 */

import type { CommandInfo } from "../src/core/protocol";

export type ToolDefinition = {
	name: string;
	description: string;
	inputSchema: Record<string, unknown> & { type: "object" };
};

export type ToolMap = {
	tools: ToolDefinition[];
	/** MCP tool name to the `<namespace>.<name>` the app knows it by. */
	commandOf: ReadonlyMap<string, string>;
};

/** A tool name may hold letters, digits, `_` and `-`. Every command name has a dot. */
const ILLEGAL = /[^a-zA-Z0-9_-]/g;

export const EMPTY_TOOL_MAP: ToolMap = { tools: [], commandOf: new Map() };

export function buildTools(commands: CommandInfo[], reserved: ReadonlySet<string>): ToolMap {
	const commandOf = new Map<string, string>();
	const tools: ToolDefinition[] = [];

	for (const info of commands) {
		// A command name is a record key, so two of them can sanitize to one tool name.
		// Renaming the second is worth the lines: the alternative routes a call to the
		// wrong command without saying so.
		const name = uniqueName(info.name.replace(ILLEGAL, "_"), reserved, commandOf);
		commandOf.set(name, info.name);
		tools.push({
			name,
			description: `${info.description} (app-commands command: ${info.name})`,
			inputSchema: inputSchemaOf(info.args),
		});
	}

	return { tools, commandOf };
}

/** True when the two lists would look different to a client, schemas included. */
export function differs(a: ToolMap, b: ToolMap): boolean {
	return JSON.stringify(a.tools) !== JSON.stringify(b.tools);
}

function uniqueName(
	base: string,
	reserved: ReadonlySet<string>,
	taken: ReadonlyMap<string, string>,
): string {
	const free = (name: string) => !reserved.has(name) && !taken.has(name);
	if (free(base)) return base;
	for (let i = 2; ; i++) {
		const candidate = `${base}_${i}`;
		if (free(candidate)) return candidate;
	}
}

function inputSchemaOf(args: object): ToolDefinition["inputSchema"] {
	// $schema is noise in an agent's context, and the type is guaranteed by the
	// command API taking a z.object.
	const rest = { ...(args as Record<string, unknown>) };
	delete rest.$schema;
	return { ...rest, type: "object" };
}
