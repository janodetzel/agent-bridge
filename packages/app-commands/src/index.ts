/**
 * The command contract and the request handler. Nothing here names a UI
 * framework, a state library, or a validation library - that is principle 10,
 * and `.dependency-cruiser.cjs` enforces it. `command()` builds commands from
 * any Standard Schema, and `featureCommands()` collects them into a registry.
 *
 * The Expo dev tools transport lives behind `@janodetzel/app-commands/expo`.
 */
export { buildRegistry, lookup } from "./core/command";
export type { Command, ParseResult, Registry } from "./core/command";
export { handleRequest } from "./core/handle";
export type { HandleOptions } from "./core/handle";
export { PLUGIN_NAME, PROTOCOL_VERSION, REQUEST_MESSAGE, RESPONSE_MESSAGE } from "./core/protocol";
export type {
	CommandInfo,
	CommandsRequest,
	ErrorCode,
	Request,
	Response,
	RunRequest,
} from "./core/protocol";
export { toJsonSafe } from "./core/serialize";
export type { JsonSafeResult } from "./core/serialize";
export { command, featureCommands, InputError } from "./command";
export type {
	CallableCommand,
	CommandBuilder,
	CommandTree,
	InferInput,
	InferOutput,
	InputShape,
	InputSpec,
	InputValidator,
	StandardSchemaIssue,
	StandardSchemaV1,
} from "./command";
