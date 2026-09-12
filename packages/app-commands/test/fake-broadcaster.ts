/**
 * A local copy of Metro's `/expo-dev-plugins/broadcast` endpoint, plus a fake app
 * peer, so the CLI can be tested without a simulator.
 *
 * The broadcaster mirrors
 * @expo/cli/build/src/start/server/metro/DevToolsPluginWebsocketEndpoint.js: it
 * forwards every message to every *other* client and answers nothing itself.
 *
 * The app peer mirrors @expo/devtools DevToolsPluginClientImplApp: it filters by
 * plugin name and, like the real app, terminates a previous browser client when a
 * second one hands shakes.
 */
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { WebSocket, WebSocketServer, type RawData } from "ws";

import { MessageFramePacker } from "../cli/wire/MessageFramePacker";
import { EXPO_PROTOCOL_VERSION } from "../cli/wire/connection";
import type { Registry } from "../src/core/command";
import { handleRequest } from "../src/core/handle";
import { PLUGIN_NAME, REQUEST_MESSAGE, RESPONSE_MESSAGE, type Request } from "../src/core/protocol";

const ENDPOINT = "/expo-dev-plugins/broadcast";

export type FakeBroadcaster = { port: number; close(): Promise<void> };

export async function startFakeBroadcaster(): Promise<FakeBroadcaster> {
	const wss = new WebSocketServer({ port: 0 });

	wss.on("connection", (ws, request) => {
		if (request.url !== ENDPOINT) {
			ws.close();
			return;
		}
		ws.on("message", (message, isBinary) => {
			for (const client of wss.clients) {
				if (client !== ws && client.readyState === WebSocket.OPEN) {
					client.send(message, { binary: isBinary });
				}
			}
		});
	});

	await once(wss, "listening");

	return {
		port: (wss.address() as AddressInfo).port,
		close: () =>
			new Promise((resolve) => {
				for (const client of wss.clients) client.terminate();
				wss.close(() => resolve());
			}),
	};
}

export type FakeApp = { close(): void };

export type FakeAppOptions = {
	/**
	 * The real app drops a browser client when a second one connects. Turn this off
	 * to test what a single client does with responses meant for another.
	 */
	terminateDuplicateClients?: boolean;
	/**
	 * Added to the protocol version of every incoming request, which makes the
	 * handler answer PROTOCOL_MISMATCH. Simulates an app built against another
	 * version of the bridge.
	 */
	protocolVersionSkew?: number;
};

export async function startFakeApp(
	port: number,
	registry: Registry,
	options: FakeAppOptions = {},
): Promise<FakeApp> {
	const terminateDuplicates = options.terminateDuplicateClients ?? true;
	const packer = new MessageFramePacker<{ pluginName: string; method: string }>();
	const browserClients = new Map<string, string>();

	const ws = new WebSocket(`ws://localhost:${port}${ENDPOINT}`);
	ws.binaryType = "arraybuffer";
	await once(ws, "open");

	const send = (method: string, payload: unknown) => {
		const packed = packer.pack({ messageKey: { pluginName: PLUGIN_NAME, method }, payload });
		if (!(packed instanceof Promise)) ws.send(packed);
	};

	ws.on("message", (raw: RawData, isBinary: boolean) => {
		const data: string | ArrayBuffer = isBinary ? toArrayBuffer(raw) : raw.toString();

		if (typeof data === "string" && handleHandshake(data)) return;

		const { messageKey, payload } = packer.unpack(data);
		if (messageKey.pluginName !== PLUGIN_NAME || messageKey.method !== REQUEST_MESSAGE) return;

		const request = payload as Request;
		const skewed = options.protocolVersionSkew
			? { ...request, protocolVersion: request.protocolVersion + options.protocolVersionSkew }
			: request;

		void handleRequest(registry, skewed).then((response) => send(RESPONSE_MESSAGE, response));
	});

	function handleHandshake(data: string): boolean {
		let message: {
			__isHandshakeMessages?: boolean;
			method?: string;
			pluginName?: string;
			browserClientId?: string;
		};
		try {
			message = JSON.parse(data) as typeof message;
		} catch {
			return false;
		}
		if (message?.__isHandshakeMessages !== true) return false;
		if (message.method !== "handshake" || message.pluginName !== PLUGIN_NAME) return true;

		const previous = browserClients.get(PLUGIN_NAME);
		if (terminateDuplicates && previous != null && previous !== message.browserClientId) {
			ws.send(
				JSON.stringify({
					protocolVersion: EXPO_PROTOCOL_VERSION,
					pluginName: PLUGIN_NAME,
					method: "terminateBrowserClient",
					browserClientId: previous,
					__isHandshakeMessages: true,
				}),
			);
		}
		browserClients.set(PLUGIN_NAME, message.browserClientId!);
		return true;
	}

	return { close: () => ws.close() };
}

function toArrayBuffer(raw: RawData): ArrayBuffer {
	if (raw instanceof ArrayBuffer) return raw;
	if (Array.isArray(raw)) return Buffer.concat(raw).buffer as ArrayBuffer;
	return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}
