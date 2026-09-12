/**
 * The command contract and the request handler. Nothing here names a UI
 * framework, a state library, or a validation library - that is principle 10,
 * and `.dependency-cruiser.cjs` enforces it.
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
