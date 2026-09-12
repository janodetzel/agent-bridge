/**
 * The browser side of an Expo dev tools plugin connection, adapted for Node from
 * the installed `expo` stack. See SOURCE.md for the versions and source files.
 *
 * To the app this looks exactly like the plugin's web UI: it opens the same
 * broadcast endpoint, sends the same handshake, and packs messages with the same
 * frame format.
 */
import WebSocket, { type RawData } from "ws";

import { MessageFramePacker } from "./MessageFramePacker";

/** Copied from @expo/devtools/build/ProtocolVersion.js. */
export const EXPO_PROTOCOL_VERSION = 1;

/** Copied from DevToolsPluginClient.connectAsync. */
const BROADCAST_ENDPOINT = "expo-dev-plugins/broadcast";

type MessageKey = { pluginName: string; method: string };

type HandshakeMessage = {
	protocolVersion: number;
	pluginName: string;
	method: "handshake" | "terminateBrowserClient";
	browserClientId: string;
	__isHandshakeMessages?: boolean;
};

export type ConnectionOptions = {
	/** `host:port` of the Metro dev server. */
	devServer: string;
	pluginName: string;
	useWss?: boolean;
	/** How long to wait for the socket to open. */
	connectTimeoutMs?: number;
	/** Called when the app drops this client, which it does when a second one connects. */
	onTerminated?: (reason: string) => void;
};

export class TerminatedError extends Error {}

export class BrowserPluginConnection {
	/** The app keys its browser clients by this. Expo uses a timestamp; so do we. */
	readonly browserClientId = Date.now().toString();

	private readonly packer = new MessageFramePacker<MessageKey>();
	private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

	private constructor(
		private readonly ws: WebSocket,
		private readonly options: ConnectionOptions,
	) {
		this.ws.on("message", this.handleMessage);
	}

	static async connect(options: ConnectionOptions): Promise<BrowserPluginConnection> {
		const protocol = options.useWss ? "wss" : "ws";
		const url = `${protocol}://${options.devServer}/${BROADCAST_ENDPOINT}`;
		const timeoutMs = options.connectTimeoutMs ?? 3_000;

		const ws = new WebSocket(url);
		ws.binaryType = "arraybuffer";

		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => {
				ws.terminate();
				reject(new Error(`no connection to ${url} within ${timeoutMs} ms`));
			}, timeoutMs);

			const settle = (fn: () => void) => {
				clearTimeout(timer);
				ws.off("open", onOpen);
				ws.off("error", onError);
				fn();
			};
			const onOpen = () => settle(resolve);
			const onError = (e: Error) => settle(() => reject(e));

			ws.once("open", onOpen);
			ws.once("error", onError);
		});

		const connection = new BrowserPluginConnection(ws, options);
		connection.startHandshake();
		return connection;
	}

	/** Copied from DevToolsPluginClientImplBrowser.startHandshake. */
	private startHandshake(): void {
		this.sendHandshakeMessage({
			protocolVersion: EXPO_PROTOCOL_VERSION,
			pluginName: this.options.pluginName,
			method: "handshake",
			browserClientId: this.browserClientId,
		});
	}

	private sendHandshakeMessage(params: HandshakeMessage): void {
		this.ws.send(JSON.stringify({ ...params, __isHandshakeMessages: true }));
	}

	sendMessage(method: string, params: unknown): void {
		const messageKey = { pluginName: this.options.pluginName, method };
		const packed = this.packer.pack({ messageKey, payload: params as object });
		if (packed instanceof Promise) {
			void packed.then((data) => this.ws.send(data));
			return;
		}
		this.ws.send(packed);
	}

	addMessageListener(method: string, listener: (payload: unknown) => void): { remove(): void } {
		const forMethod = this.listeners.get(method) ?? new Set();
		forMethod.add(listener);
		this.listeners.set(method, forMethod);
		return {
			remove: () => {
				this.listeners.get(method)?.delete(listener);
			},
		};
	}

	close(): void {
		this.ws.off("message", this.handleMessage);
		this.ws.close();
	}

	private handleMessage = (raw: RawData, isBinary: boolean): void => {
		const data: string | ArrayBuffer = isBinary ? toArrayBuffer(raw) : raw.toString();

		if (typeof data === "string" && this.handleHandshakeMessage(data)) {
			return;
		}

		const { messageKey, payload } = this.packer.unpack(data);
		if (messageKey?.pluginName && messageKey.pluginName !== this.options.pluginName) {
			return;
		}
		for (const listener of this.listeners.get(messageKey.method) ?? []) {
			listener(payload);
		}
	};

	/** Returns true when the message was a handshake message and is fully handled. */
	private handleHandshakeMessage(data: string): boolean {
		let parsed: HandshakeMessage;
		try {
			parsed = JSON.parse(data) as HandshakeMessage;
		} catch {
			return false;
		}
		if (parsed?.__isHandshakeMessages !== true) {
			return false;
		}
		if (parsed.pluginName && parsed.pluginName !== this.options.pluginName) {
			return true;
		}
		if (
			parsed.method === "terminateBrowserClient" &&
			parsed.browserClientId === this.browserClientId
		) {
			this.options.onTerminated?.(
				"the app dropped this client: another web UI or CLI connected to the same plugin, " +
					"or the app speaks a different Expo dev tools protocol version",
			);
		}
		return true;
	}
}

function toArrayBuffer(raw: RawData): ArrayBuffer {
	if (raw instanceof ArrayBuffer) return raw;
	if (Array.isArray(raw)) return Buffer.concat(raw).buffer as ArrayBuffer;
	return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}
