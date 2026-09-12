import { randomUUID } from "node:crypto";

import {
	PLUGIN_NAME,
	PROTOCOL_VERSION,
	REQUEST_MESSAGE,
	RESPONSE_MESSAGE,
	type CommandInfo,
	type Request,
	type Response,
} from "../src/core/protocol";
import { BrowserPluginConnection } from "./wire/connection";

/** Reaching the app failed. The CLI turns this into exit code 2. */
export class ConnectionError extends Error {}

/** The app answered, and it answered a failure. The CLI reports its code verbatim. */
export class ResponseError extends Error {
	constructor(readonly response: Extract<Response, { ok: false }>) {
		super(`${response.code}: ${response.error}`);
	}
}

export type ClientOptions = {
	host?: string;
	port?: number;
	/** How long to wait for the socket, and for the app's answer to `commands`. */
	handshakeTimeoutMs?: number;
};

const DEFAULT_HOST = "localhost";
const DEFAULT_PORT = 8081;
const DEFAULT_HANDSHAKE_TIMEOUT_MS = 3_000;
/** Headroom over the command's own timeout before the CLI stops waiting. */
const REPLY_GRACE_MS = 5_000;

/** A request without the envelope the client fills in. */
type RequestBody =
	{ cmd: "commands" } | { cmd: "run"; command: string; args?: unknown; timeoutMs?: number };

type Pending = {
	resolve: (response: Response) => void;
	reject: (error: Error) => void;
	timer: NodeJS.Timeout;
};

export class AppCommandsClient {
	/** One per process. Every other client's responses are dropped. */
	readonly clientId = randomUUID();

	private readonly pending = new Map<string, Pending>();
	private terminated: ConnectionError | null = null;

	private constructor(
		private readonly connection: BrowserPluginConnection,
		private readonly handshakeTimeoutMs: number,
	) {
		this.connection.addMessageListener(RESPONSE_MESSAGE, (payload) => {
			const response = payload as Response;
			// Metro forwards every message to every client, including the web UI.
			if (!response || response.clientId !== this.clientId) return;

			const pending = this.pending.get(response.id);
			if (!pending) return;
			this.pending.delete(response.id);
			clearTimeout(pending.timer);
			pending.resolve(response);
		});
	}

	static async connect(options: ClientOptions = {}): Promise<AppCommandsClient> {
		const host = options.host ?? DEFAULT_HOST;
		const port = options.port ?? DEFAULT_PORT;
		const handshakeTimeoutMs = options.handshakeTimeoutMs ?? DEFAULT_HANDSHAKE_TIMEOUT_MS;

		let client: AppCommandsClient;
		try {
			const connection = await BrowserPluginConnection.connect({
				devServer: `${host}:${port}`,
				pluginName: PLUGIN_NAME,
				connectTimeoutMs: handshakeTimeoutMs,
				onTerminated: (reason) => client?.onTerminated(reason),
			});
			client = new AppCommandsClient(connection, handshakeTimeoutMs);
		} catch (e) {
			throw new ConnectionError(
				`cannot reach Metro at ${host}:${port}: ${e instanceof Error ? e.message : String(e)}`,
			);
		}
		return client;
	}

	/** Asks the app what it can do. A silent app means it is not running the bridge. */
	async commands(): Promise<CommandInfo[]> {
		const response = await this.send(
			{ cmd: "commands" },
			this.handshakeTimeoutMs,
			"the app did not answer. Is Metro running with the app connected, and does the app call useAppCommands?",
		);
		if (!response.ok) {
			throw new ResponseError(response);
		}
		return response.result as CommandInfo[];
	}

	async run(command: string, args: unknown, timeoutMs?: number): Promise<Response> {
		const replyTimeoutMs = (timeoutMs ?? 10_000) + REPLY_GRACE_MS;
		return this.send(
			{ cmd: "run", command, args, ...(timeoutMs === undefined ? {} : { timeoutMs }) },
			replyTimeoutMs,
			`the app did not answer "${command}" within ${replyTimeoutMs} ms`,
		);
	}

	close(): void {
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			this.pending.delete(id);
			pending.reject(new ConnectionError("the connection closed before the app answered"));
		}
		this.connection.close();
	}

	private send(body: RequestBody, timeoutMs: number, timeoutMessage: string): Promise<Response> {
		if (this.terminated) return Promise.reject(this.terminated);

		const id = randomUUID();
		const request: Request = {
			id,
			clientId: this.clientId,
			protocolVersion: PROTOCOL_VERSION,
			...body,
		};

		return new Promise<Response>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new ConnectionError(timeoutMessage));
			}, timeoutMs);

			this.pending.set(id, { resolve, reject, timer });
			this.connection.sendMessage(REQUEST_MESSAGE, request);
		});
	}

	private onTerminated(reason: string): void {
		this.terminated = new ConnectionError(reason);
		for (const [id, pending] of this.pending) {
			clearTimeout(pending.timer);
			this.pending.delete(id);
			pending.reject(this.terminated);
		}
	}
}
