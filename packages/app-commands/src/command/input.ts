import type { ParseResult } from "../core/command";
import type {
	InferSchemaInput,
	InferSchemaOutput,
	StandardSchemaIssue,
	StandardSchemaResult,
	StandardSchemaV1,
} from "./standard-schema";

/** An object whose values are schemas: `{ title: z.string(), done: z.boolean() }`. */
export type InputShape = { readonly [key: string]: StandardSchemaV1 };

/** Returns the parsed value, or throws to reject it. May return a promise. */
export type InputValidator = (value: unknown) => unknown;

/** What `.input()` accepts. */
export type InputSpec = StandardSchemaV1 | InputShape | InputValidator;

/** The type a caller passes. */
export type InferInput<S extends InputSpec> = S extends StandardSchemaV1
	? InferSchemaInput<S>
	: S extends InputValidator
		? Awaited<ReturnType<S>>
		: S extends InputShape
			? OptionalUndefined<{ [K in keyof S]: InferSchemaInput<S[K]> }>
			: never;

/** The type the handler receives, after defaults and transforms. */
export type InferOutput<S extends InputSpec> = S extends StandardSchemaV1
	? InferSchemaOutput<S>
	: S extends InputValidator
		? Awaited<ReturnType<S>>
		: S extends InputShape
			? OptionalUndefined<{ [K in keyof S]: InferSchemaOutput<S[K]> }>
			: never;

type UndefinedKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];

/** `{ a: string; b: string | undefined }` becomes `{ a: string; b?: string | undefined }`. */
type OptionalUndefined<T> = Simplify<
	{ [K in Exclude<keyof T, UndefinedKeys<T>>]: T[K] } & { [K in UndefinedKeys<T>]?: T[K] }
>;

type Simplify<T> = { [K in keyof T]: T[K] } & {};

/**
 * The two fields core needs. `jsonSchema` is a function so it is only computed
 * when something lists the commands: a release build creates every command at
 * startup and never lists one.
 */
export type CompiledInput = {
	jsonSchema: () => object;
	parse: (input: unknown) => ParseResult | Promise<ParseResult>;
};

/** A command with no `.input()`: an empty argument object, or nothing at all. */
export const NO_INPUT: CompiledInput = {
	jsonSchema: () => ({ type: "object", properties: {} }),
	parse: (input) =>
		input === undefined || isPlainObject(input)
			? { ok: true, value: undefined }
			: { ok: false, issues: [{ message: "expected no arguments, or an empty object" }] },
};

export function compileInput(spec: InputSpec): CompiledInput {
	// Checked first: an ArkType schema is a function that also carries `~standard`.
	if (isStandardSchema(spec)) return fromStandardSchema(spec);
	if (typeof spec === "function") return fromValidator(spec);
	if (isPlainObject(spec)) return fromShape(spec);
	throw new TypeError(
		"command().input() takes a Standard Schema, an object of Standard Schemas, or a validator function",
	);
}

function fromStandardSchema(schema: StandardSchemaV1): CompiledInput {
	return {
		jsonSchema: memo(() => jsonSchemaOf(schema)),
		parse: (input) => mapMaybePromise(schema["~standard"].validate(input), toParseResult),
	};
}

function fromValidator(validate: InputValidator): CompiledInput {
	return {
		// A function describes nothing. `{}` lists the command with no flags, and
		// the CLI still takes `--args '<json>'`.
		jsonSchema: () => ({}),
		parse: (input) => {
			const rejected = (e: unknown): ParseResult => ({
				ok: false,
				issues: [{ message: e instanceof Error ? e.message : String(e) }],
			});
			try {
				const value = validate(input);
				return isPromiseLike(value)
					? Promise.resolve(value).then((v): ParseResult => ({ ok: true, value: v }), rejected)
					: { ok: true, value };
			} catch (e) {
				return rejected(e);
			}
		},
	};
}

function fromShape(shape: InputShape): CompiledInput {
	const entries = Object.entries(shape).map(([key, schema]) => {
		if (!isStandardSchema(schema)) {
			throw new TypeError(`command().input(): "${key}" is not a Standard Schema`);
		}
		return [key, schema] as const;
	});

	return {
		jsonSchema: memo(() => {
			const properties: Record<string, object> = {};
			const required: string[] = [];
			for (const [key, schema] of entries) {
				// Each property schema is a document of its own; only the root names a draft.
				const property: Record<string, unknown> = { ...jsonSchemaOf(schema) };
				delete property.$schema;
				properties[key] = property;
				if (!acceptsUndefined(schema)) required.push(key);
			}
			return required.length > 0
				? { type: "object", properties, required }
				: { type: "object", properties };
		}),

		parse: (input) => {
			if (!isPlainObject(input)) {
				return { ok: false, issues: [{ message: "expected an object of arguments" }] };
			}

			const results = entries.map(([key, schema]) =>
				schema["~standard"].validate(Object.hasOwn(input, key) ? input[key] : undefined),
			);

			// Unknown keys are dropped, the way an object schema strips them.
			const combine = (settled: StandardSchemaResult<unknown>[]): ParseResult => {
				const issues: StandardSchemaIssue[] = [];
				const value: Record<string, unknown> = {};
				settled.forEach((result, i) => {
					const key = entries[i]![0];
					if (result.issues) {
						issues.push(
							...result.issues.map((issue) => ({ ...issue, path: [key, ...(issue.path ?? [])] })),
						);
					} else if (result.value !== undefined || Object.hasOwn(input, key)) {
						value[key] = result.value;
					}
				});
				return issues.length > 0 ? { ok: false, issues } : { ok: true, value };
			};

			return results.some(isPromiseLike)
				? Promise.all(results).then(combine)
				: combine(results as StandardSchemaResult<unknown>[]);
		},
	};
}

type JsonSchemaExtension = {
	jsonSchema?: {
		input?: (options: { target: string; libraryOptions?: Record<string, unknown> }) => unknown;
	};
};

/**
 * Reads the Standard JSON Schema extension. `io` is the input side, so an
 * argument with a default stays optional, which is what a caller sends.
 * `unrepresentable: "any"` is zod's option for turning a type JSON Schema cannot
 * express into `{}` rather than throwing; other libraries ignore it.
 */
function jsonSchemaOf(schema: StandardSchemaV1): object {
	const standard = schema["~standard"] as JsonSchemaExtension;
	if (typeof standard.jsonSchema?.input !== "function") return {};
	try {
		const out = standard.jsonSchema.input({
			target: "draft-2020-12",
			libraryOptions: { unrepresentable: "any" },
		});
		return typeof out === "object" && out !== null ? out : {};
	} catch {
		return {};
	}
}

/** Whether a shape key may be left out. Only a synchronous answer counts. */
function acceptsUndefined(schema: StandardSchemaV1): boolean {
	const result = schema["~standard"].validate(undefined);
	if (isPromiseLike(result)) {
		Promise.resolve(result).catch(() => {});
		return false;
	}
	return !result.issues;
}

function toParseResult(result: StandardSchemaResult<unknown>): ParseResult {
	return result.issues
		? { ok: false, issues: [...result.issues] }
		: { ok: true, value: result.value };
}

function mapMaybePromise<T, R>(value: T | Promise<T>, fn: (value: T) => R): R | Promise<R> {
	return isPromiseLike(value) ? Promise.resolve(value).then(fn) : fn(value);
}

function memo<T>(compute: () => T): () => T {
	let cached: { value: T } | undefined;
	return () => (cached ??= { value: compute() }).value;
}

function isStandardSchema(value: unknown): value is StandardSchemaV1 {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		"~standard" in value
	);
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		(typeof value === "object" || typeof value === "function") &&
		value !== null &&
		typeof (value as { then?: unknown }).then === "function"
	);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (typeof value !== "object" || value === null) return false;
	const proto = Object.getPrototypeOf(value);
	return proto === Object.prototype || proto === null;
}
