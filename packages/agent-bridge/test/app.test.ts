import { describe, expect, it, vi } from "vitest";

import { attachAgentBridge, type BridgeClient } from "../src/app/attach";
import type { Registry } from "../src/core/command";
import { PROTOCOL_VERSION, type Request, type Response } from "../src/core/protocol";

function fakeClient() {
	const listeners = new Map<string, ((data: never) => void)[]>();
	const sent: { method: string; params: unknown }[] = [];

	const client: BridgeClient = {
		addMessageListener(method, listener) {
			const forMethod = listeners.get(method) ?? [];
			forMethod.push(listener);
			listeners.set(method, forMethod);
			return {
				remove() {
					listeners.set(
						method,
						(listeners.get(method) ?? []).filter((l) => l !== listener),
					);
				},
			};
		},
		sendMessage(method, params) {
			sent.push({ method, params });
		},
	};

	return {
		client,
		sent,
		responses: () => sent.filter((m) => m.method === "response").map((m) => m.params as Response),
		emit(req: Request) {
			for (const listener of listeners.get("request") ?? [])
				(listener as (d: Request) => void)(req);
		},
	};
}

const registry: Registry = {
	"demo.echo": {
		description: "Returns its arguments.",
		jsonSchema: { type: "object", properties: { hello: { type: "string" } }, required: ["hello"] },
		parse: (input) => ({ ok: true, value: input }),
		run: async (args) => args,
	},
};

const runRequest = (id: string, clientId: string): Request => ({
	id,
	clientId,
	protocolVersion: PROTOCOL_VERSION,
	cmd: "run",
	command: "demo.echo",
	args: { hello: "world" },
});

describe("attachAgentBridge", () => {
	it("answers a request with exactly one response carrying the same id and clientId", async () => {
		const peer = fakeClient();
		attachAgentBridge(peer.client, registry);

		peer.emit(runRequest("req-42", "cli-9"));
		await vi.waitFor(() => expect(peer.responses()).toHaveLength(1));

		expect(peer.responses()[0]).toMatchObject({
			id: "req-42",
			clientId: "cli-9",
			protocolVersion: PROTOCOL_VERSION,
			ok: true,
			result: { hello: "world" },
		});
	});

	it("keeps each response addressed to the client that asked", async () => {
		const peer = fakeClient();
		attachAgentBridge(peer.client, registry);

		peer.emit(runRequest("a", "cli-a"));
		peer.emit(runRequest("b", "cli-b"));
		await vi.waitFor(() => expect(peer.responses()).toHaveLength(2));

		expect(peer.responses().map((r) => [r.id, r.clientId])).toEqual([
			["a", "cli-a"],
			["b", "cli-b"],
		]);
	});

	it("stops answering after the returned function runs", async () => {
		const peer = fakeClient();
		const detach = attachAgentBridge(peer.client, registry);
		detach();

		peer.emit(runRequest("req-1", "cli-1"));
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(peer.responses()).toHaveLength(0);
	});
});
