import { describe, expect, it } from "vitest";

import { buildRegistry } from "agent-bridge/core";
import { handleRequest, PROTOCOL_VERSION } from "agent-bridge/core";

import { groups } from "../src/agent/registry";

const registry = buildRegistry(groups);

describe("the app's command registry", () => {
	it("has no duplicate names across the groups", () => {
		const declared = groups.reduce((sum, g) => sum + Object.keys(g.commands).length, 0);
		expect(registry.size).toBe(declared);
	});

	it("registers the demo group and the navigation adapter", () => {
		expect([...registry.keys()].sort()).toEqual([
			"demo.echo",
			"demo.fail",
			"nav.back",
			"nav.current",
			"nav.navigate",
		]);
	});

	it("describes every command with a JSON Schema the CLI can read", async () => {
		const response = await handleRequest(registry, {
			id: "1",
			clientId: "test",
			protocolVersion: PROTOCOL_VERSION,
			cmd: "commands",
		});
		if (!response.ok) throw new Error(response.error);

		const infos = response.result as { name: string; description: string; args: object }[];
		for (const info of infos) {
			expect(info.description.length).toBeGreaterThan(10);
			expect(info.args).toMatchObject({ type: "object" });
		}
	});

	it("returns results that survive JSON.stringify", async () => {
		for (const command of ["demo.echo", "nav.current"]) {
			const response = await handleRequest(registry, {
				id: "1",
				clientId: "test",
				protocolVersion: PROTOCOL_VERSION,
				cmd: "run",
				command,
				args: {},
			});
			if (!response.ok) throw new Error(`${command}: ${response.error}`);
			expect(() => JSON.stringify(response.result)).not.toThrow();
		}
	});
});
