/** Name of the Expo dev tools plugin. Both sides address messages with it. */
export const PLUGIN_NAME = "agent-bridge";

/** Bumped whenever the shape of a request or a response changes. */
export const PROTOCOL_VERSION = 1;

/** Message method the CLI and the web UI send on. */
export const REQUEST_MESSAGE = "request";

/** Message method the app answers on. */
export const RESPONSE_MESSAGE = "response";

type RequestBase = {
	/** Unique per request. A client resolves its pending call by this id. */
	id: string;
	/** Identifies the sending client. Every client drops responses addressed to another one. */
	clientId: string;
	protocolVersion: number;
};

export type CommandsRequest = RequestBase & { cmd: "commands" };

export type RunRequest = RequestBase & {
	cmd: "run";
	command: string;
	args?: unknown;
	timeoutMs?: number;
};

export type Request = CommandsRequest | RunRequest;

/** One command as the app describes it. `args` is the JSON Schema of its arguments. */
export type CommandInfo = { name: string; description: string; args: object };

export type ErrorCode =
	| "UNKNOWN_COMMAND"
	| "INVALID_ARGS"
	| "COMMAND_FAILED"
	| "TIMEOUT"
	| "NOT_SERIALIZABLE"
	| "PROTOCOL_MISMATCH";

export type Response = {
	id: string;
	clientId: string;
	protocolVersion: number;
} & (
	| { ok: true; result: unknown; durationMs?: number }
	| { ok: false; error: string; code: ErrorCode; issues?: unknown[] }
);
