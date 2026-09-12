/**
 * Turns the JSON Schema the app reports into form fields, and the filled-in form
 * back into an arguments object. The CLI does the same job for flags; both keep
 * validation itself with the app, which owns the Zod schema.
 */

export type JsonSchema = {
	type?: string | string[];
	properties?: Record<string, JsonSchema>;
	required?: string[];
	enum?: unknown[];
	anyOf?: JsonSchema[];
	oneOf?: JsonSchema[];
	description?: string;
};

export type Field =
	| { name: string; required: boolean; kind: "enum"; values: string[] }
	| {
			name: string;
			required: boolean;
			kind: "string" | "number" | "integer" | "boolean" | "object" | "array";
			values?: undefined;
	  };

export function fieldsOf(schema: object): Field[] {
	const { properties = {}, required = [] } = schema as JsonSchema;

	return Object.entries(properties).map(([name, property]) => {
		const isRequired = required.includes(name);
		const values = enumValues(property);
		if (values) return { name, required: isRequired, kind: "enum", values };
		return { name, required: isRequired, kind: kindOf(property) };
	});
}

export function buildArgs(fields: Field[], values: Record<string, string | boolean>): unknown {
	const args: Record<string, unknown> = {};

	for (const field of fields) {
		const value = values[field.name];
		if (value === undefined || value === "") continue;

		switch (field.kind) {
			case "boolean":
				args[field.name] = Boolean(value);
				break;
			case "number":
			case "integer": {
				const parsed = Number(value);
				if (!Number.isFinite(parsed)) throw new Error(`${field.name} must be a number`);
				args[field.name] = parsed;
				break;
			}
			case "object":
			case "array":
				try {
					args[field.name] = JSON.parse(String(value));
				} catch (e) {
					throw new Error(
						`${field.name} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`,
					);
				}
				break;
			default:
				args[field.name] = value;
		}
	}

	return args;
}

function kindOf(
	property: JsonSchema,
): "string" | "number" | "integer" | "boolean" | "object" | "array" {
	const branches = property.anyOf ?? property.oneOf;
	const concrete = branches?.find((b) => kindOf(b) !== "object" || b.type === "object");
	const type = Array.isArray(property.type)
		? property.type.find((t) => t !== "null")
		: (property.type ?? (concrete ? kindOf(concrete) : undefined));

	switch (type) {
		case "number":
		case "integer":
		case "boolean":
		case "object":
		case "array":
			return type;
		default:
			return "string";
	}
}

function enumValues(property: JsonSchema): string[] | null {
	const branches = property.anyOf ?? property.oneOf;
	const source = property.enum ?? branches?.flatMap((b) => b.enum ?? []);
	if (!source || source.length === 0) return null;
	const strings = source.filter((v): v is string => typeof v === "string");
	return strings.length === source.length ? strings : null;
}
