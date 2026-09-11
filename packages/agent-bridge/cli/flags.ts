/**
 * Turns the JSON Schema the app reports for a command into CLI flags.
 *
 * Only what the parser needs is validated here. The app owns validation: it holds
 * the Zod schema, and it answers INVALID_ARGS with the issues.
 */

export class UsageError extends Error {}

export type JsonSchema = {
	type?: string | string[];
	properties?: Record<string, JsonSchema>;
	required?: string[];
	enum?: unknown[];
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	description?: string;
	default?: unknown;
	additionalProperties?: unknown;
};

/** Parses the tokens after the command name into the arguments object to send. */
export function parseCommandArgs(schema: JsonSchema, tokens: string[]): unknown {
	const argsIndex = tokens.indexOf("--args");
	if (argsIndex !== -1) {
		const others = tokens.filter((t, i) => i !== argsIndex && i !== argsIndex + 1);
		if (others.length > 0) {
			throw new UsageError(
				`--args cannot be combined with other flags, got ${others.join(" ")}. Put everything in the JSON.`,
			);
		}
		const raw = tokens[argsIndex + 1];
		if (raw === undefined) throw new UsageError("--args needs a JSON value");
		try {
			return JSON.parse(raw);
		} catch (e) {
			throw new UsageError(
				`--args is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
	}

	const properties = schema.properties ?? {};
	const args: Record<string, unknown> = {};

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]!;
		if (!token.startsWith("--")) {
			throw new UsageError(`expected a flag, got "${token}"`);
		}

		const negated = token.startsWith("--no-");
		const name = negated ? token.slice("--no-".length) : token.slice(2);
		const property = properties[name];

		if (!property) {
			throw new UsageError(
				`unknown flag "${token}". ${describeFlags(schema) || "This command takes no arguments."}`,
			);
		}

		const kind = typeOf(property);

		if (kind === "boolean") {
			args[name] = !negated;
			continue;
		}
		if (negated) {
			throw new UsageError(`--no-${name} only works for a boolean argument`);
		}

		const value = tokens[++i];
		if (value === undefined) {
			throw new UsageError(`--${name} needs a value`);
		}
		args[name] = coerce(name, value, property, kind);
	}

	return args;
}

/** One line per flag, for a usage message. */
export function describeFlags(schema: JsonSchema): string {
	const properties = Object.entries(schema.properties ?? {});
	if (properties.length === 0) return "";

	const required = new Set(schema.required ?? []);
	return properties
		.map(([name, property]) => {
			const kind = typeOf(property);
			const values = enumValues(property);
			const placeholder = values ? values.join("|") : kind;
			const flag = kind === "boolean" ? `--${name} / --no-${name}` : `--${name} <${placeholder}>`;
			const suffix = required.has(name) ? " (required)" : "";
			return `${flag}${suffix}`;
		})
		.join("\n");
}

function coerce(name: string, value: string, property: JsonSchema, kind: string): unknown {
	const values = enumValues(property);
	if (values) {
		if (!values.includes(value)) {
			throw new UsageError(`--${name} must be one of ${values.join(", ")}, got "${value}"`);
		}
		return value;
	}

	switch (kind) {
		case "number":
		case "integer": {
			const parsed = Number(value);
			if (!Number.isFinite(parsed)) {
				throw new UsageError(`--${name} must be a number, got "${value}"`);
			}
			if (kind === "integer" && !Number.isInteger(parsed)) {
				throw new UsageError(`--${name} must be a whole number, got "${value}"`);
			}
			return parsed;
		}
		case "object":
		case "array":
			throw new UsageError(
				`--${name} is ${kind === "array" ? "a list" : "an object"}. Pass the whole argument object as JSON instead: --args '{"${name}": ...}'`,
			);
		default:
			return value;
	}
}

/** The first concrete type, looking through the nullable and union wrappers Zod emits. */
function typeOf(property: JsonSchema): string {
	const branches = property.anyOf ?? property.oneOf;
	if (branches) {
		const concrete = branches.find((b) => typeOf(b) !== "null");
		if (concrete) return typeOf(concrete);
	}
	if (Array.isArray(property.type)) {
		return property.type.find((t) => t !== "null") ?? "string";
	}
	if (property.type) return property.type;
	if (property.enum) return "string";
	return "string";
}

function enumValues(property: JsonSchema): string[] | null {
	const branches = property.anyOf ?? property.oneOf;
	const source = property.enum ?? branches?.flatMap((b) => b.enum ?? []);
	if (!source || source.length === 0) return null;
	const strings = source.filter((v): v is string => typeof v === "string");
	return strings.length === source.length ? strings : null;
}
