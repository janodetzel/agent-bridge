import { lookup, type Registry } from "./command";
import {
	PROTOCOL_VERSION,
	type CommandInfo,
	type ErrorCode,
	type Request,
	type Response,
} from "./protocol";
import { toJsonSafe } from "./serialize";

export type HandleOptions = {
	/** Used when a `run` request carries no `timeoutMs`. Defaults to 10 seconds. */
	defaultTimeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 10_000;
const TIMED_OUT = Symbol("timed out");

/**
 * Answers one request against a registry. It knows nothing about the transport,
 * so the app hook, the tests, and the fake app peer all share this code path.
 * It knows nothing about features or validation libraries either: it calls
 * `parse`, then `run`, then serializes.
 */
export async function handleRequest(
	registry: Registry,
	req: Request,
	opts: HandleOptions = {},
): Promise<Response> {
	const envelope = {
		id: req.id,
		clientId: req.clientId,
		protocolVersion: PROTOCOL_VERSION,
	};

	if (req.protocolVersion !== PROTOCOL_VERSION) {
		return fail(
			envelope,
			"PROTOCOL_MISMATCH",
			`protocol mismatch: the request speaks version ${req.protocolVersion}, the app speaks version ${PROTOCOL_VERSION}`,
		);
	}

	if (req.cmd === "commands") {
		return { ...envelope, ok: true, result: describe(registry) };
	}

	if (req.cmd !== "run") {
		return fail(envelope, "UNKNOWN_COMMAND", `unknown request "${(req as { cmd: string }).cmd}"`);
	}

	const cmd = lookup(registry, req.command);
	if (!cmd) {
		return fail(envelope, "UNKNOWN_COMMAND", `unknown command "${req.command}"`);
	}

	let parsed;
	try {
		parsed = cmd.parse(req.args ?? {});
	} catch (e) {
		// `parse` belongs to whoever built the command. A throwing one is a bug
		// there, and saying so beats reporting it as a transport failure.
		return fail(
			envelope,
			"COMMAND_FAILED",
			`the parse function for "${req.command}" threw: ${errorMessage(e)}`,
		);
	}

	if (!parsed.ok) {
		return fail(envelope, "INVALID_ARGS", `invalid arguments for "${req.command}"`, parsed.issues);
	}

	const timeoutMs = req.timeoutMs ?? opts.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
	const started = now();

	let outcome: unknown;
	try {
		outcome = await withTimeout(cmd.run(parsed.value), timeoutMs);
	} catch (e) {
		return fail(envelope, "COMMAND_FAILED", errorMessage(e));
	}

	const durationMs = Math.round(now() - started);

	if (outcome === TIMED_OUT) {
		return fail(envelope, "TIMEOUT", `"${req.command}" did not finish within ${timeoutMs} ms`);
	}

	const safe = toJsonSafe(outcome);
	if (!safe.ok) {
		return fail(
			envelope,
			"NOT_SERIALIZABLE",
			`"${req.command}" returned a value that is not JSON: ${safe.path}: ${safe.reason}`,
		);
	}

	return { ...envelope, ok: true, result: safe.value, durationMs };
}

function describe(registry: Registry): CommandInfo[] {
	return Object.entries(registry)
		.map(([name, cmd]) => ({ name, description: cmd.description, args: cmd.jsonSchema }))
		.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/**
 * Resolves with `TIMED_OUT` once `ms` passes. The pending promise is left to
 * settle on its own; a late rejection must not reach the app as an unhandled one.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
	promise.catch(() => {});
	let timer: ReturnType<typeof setTimeout>;
	const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
		timer = setTimeout(() => resolve(TIMED_OUT), ms);
	});
	return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function fail(
	envelope: { id: string; clientId: string; protocolVersion: number },
	code: ErrorCode,
	error: string,
	issues?: unknown[],
): Response {
	return issues
		? { ...envelope, ok: false, code, error, issues }
		: { ...envelope, ok: false, code, error };
}

function errorMessage(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}

function now(): number {
	return typeof performance !== "undefined" ? performance.now() : Date.now();
}
