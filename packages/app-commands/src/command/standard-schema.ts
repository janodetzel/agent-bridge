/**
 * The Standard Schema interface (https://standardschema.dev), copied rather than
 * installed. The spec asks for exactly that: it is a type-only contract, so a
 * copy keeps this layer importing nothing while zod, Valibot and ArkType schemas
 * all satisfy it structurally.
 *
 * Only the parts `command()` reads are here. The JSON Schema extension
 * (`~standard.jsonSchema`) is read defensively in `input.ts`, because a library
 * may implement validation without it.
 */

export type StandardSchemaV1<Input = unknown, Output = Input> = {
	readonly "~standard": StandardSchemaProps<Input, Output>;
};

export type StandardSchemaProps<Input = unknown, Output = Input> = {
	readonly version: 1;
	readonly vendor: string;
	readonly validate: (
		value: unknown,
	) => StandardSchemaResult<Output> | Promise<StandardSchemaResult<Output>>;
	readonly types?: { readonly input: Input; readonly output: Output } | undefined;
};

export type StandardSchemaResult<Output> =
	| { readonly value: Output; readonly issues?: undefined }
	| { readonly issues: ReadonlyArray<StandardSchemaIssue> };

export type StandardSchemaIssue = {
	readonly message: string;
	readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }> | undefined;
};

export type InferSchemaInput<S extends StandardSchemaV1> = NonNullable<
	S["~standard"]["types"]
>["input"];

export type InferSchemaOutput<S extends StandardSchemaV1> = NonNullable<
	S["~standard"]["types"]
>["output"];
