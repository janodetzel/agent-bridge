import { execFile, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { AgentBridgeClient } from "../cli/client";
import type { Registry } from "../src/core/command";
import {
	startFakeApp,
	startFakeBroadcaster,
	type FakeApp,
	type FakeBroadcaster,
} from "./fake-broadcaster";

const execFileAsync = promisify(execFile);
const BINARY = path.join(__dirname, "..", "build", "cli", "index.js");

const registry: Registry = {
	"demo.echo": {
		description: "Returns its arguments.",
		jsonSchema: {
			type: "object",
			properties: { value: { type: "string", minLength: 1 } },
			required: ["value"],
		},
		parse: (input) => {
			const value = (input as { value?: unknown })?.value;
			return typeof value === "string" && value.length > 0
				? { ok: true, value: { value } }
				: { ok: false, issues: [{ path: ["value"], message: "expected a non-empty string" }] };
		},
		run: async (args) => args,
	},
	"demo.fail": {
		description: "Always throws.",
		jsonSchema: { type: "object", properties: {} },
		parse: (input) => ({ ok: true, value: input }),
		run: async () => {
			throw new Error("demo.fail always throws");
		},
	},
};

let broadcaster: FakeBroadcaster;
let app: FakeApp | undefined;

beforeEach(async () => {
	broadcaster = await startFakeBroadcaster();
});

afterEach(async () => {
	app?.close();
	app = undefined;
	await broadcaster.close();
});

describe("the CLI client", () => {
	it("gets the command list from the app", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const client = await AgentBridgeClient.connect({ port: broadcaster.port });

		const commands = await client.commands();
		expect(commands.map((c) => c.name)).toEqual(["demo.echo", "demo.fail"]);
		expect(commands[0]!.args).toMatchObject({ type: "object" });

		client.close();
	});

	it("gives two clients running at once only their own responses", async () => {
		// The real app would drop the first client here; this isolates the clientId filter.
		app = await startFakeApp(broadcaster.port, registry, { terminateDuplicateClients: false });
		const first = await AgentBridgeClient.connect({ port: broadcaster.port });
		const second = await AgentBridgeClient.connect({ port: broadcaster.port });

		const [a, b] = await Promise.all([
			first.run("demo.echo", { value: "first" }),
			second.run("demo.echo", { value: "second" }),
		]);

		expect(a).toMatchObject({ clientId: first.clientId, ok: true, result: { value: "first" } });
		expect(b).toMatchObject({ clientId: second.clientId, ok: true, result: { value: "second" } });

		first.close();
		second.close();
	});

	it("fails within 4 seconds when no app is connected", async () => {
		const client = await AgentBridgeClient.connect({ port: broadcaster.port });
		const started = Date.now();

		await expect(client.commands()).rejects.toThrow(/did not answer/);
		expect(Date.now() - started).toBeLessThan(4_000);

		client.close();
	}, 10_000);

	it("reports being dropped when a second client connects", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const first = await AgentBridgeClient.connect({ port: broadcaster.port });
		await first.commands();

		const second = await AgentBridgeClient.connect({ port: broadcaster.port });
		await expect(first.commands()).rejects.toThrow(/dropped this client/);

		first.close();
		second.close();
	});
});

describe("the appcmd binary", () => {
	const run = async (args: string[], port = broadcaster.port) => {
		if (!existsSync(BINARY)) {
			throw new Error(
				`${BINARY} is missing. Run \`pnpm --filter @janodetzel/app-commands build\` first.`,
			);
		}
		try {
			const { stdout, stderr } = await execFileAsync("node", [
				BINARY,
				"--port",
				String(port),
				...args,
			]);
			return { code: 0, stdout, stderr };
		} catch (e) {
			const failure = e as { code?: number; stdout: string; stderr: string };
			return { code: failure.code ?? 1, stdout: failure.stdout, stderr: failure.stderr };
		}
	};

	it("prints the command list as JSON that jq accepts (exit 0)", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const { code, stdout } = await run(["commands"]);

		expect(code).toBe(0);
		const jq = spawnSync("jq", ["-e", "length == 2"], { input: stdout, encoding: "utf8" });
		expect(jq.stderr).toBe("");
		expect(jq.status).toBe(0);
	}, 20_000);

	it("prints the result of a command (exit 0)", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const { code, stdout } = await run(["demo.echo", "--value", "hi"]);

		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toEqual({ value: "hi" });
	}, 20_000);

	it("accepts --args with JSON (exit 0)", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const { code, stdout } = await run(["demo.echo", "--args", '{"value":"from json"}']);

		expect(code).toBe(0);
		expect(JSON.parse(stdout)).toEqual({ value: "from json" });
	}, 20_000);

	it.each([
		[["demo.fail"], "COMMAND_FAILED"],
		[["demo.echo", "--value", ""], "INVALID_ARGS"],
		[["demo.nope"], "UNKNOWN_COMMAND"],
		[["demo.echo", "--nope", "x"], "USAGE"],
		[["demo.echo", "--args", "{}", "--value", "x"], "USAGE"],
	])(
		"exits 1 with %j",
		async (args, code) => {
			app = await startFakeApp(broadcaster.port, registry);
			const result = await run(args);

			expect(result.code).toBe(1);
			expect(JSON.parse(result.stdout)).toMatchObject({ code });
		},
		20_000,
	);

	it("reports the Zod issues on invalid arguments", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const { stdout } = await run(["demo.echo", "--value", ""]);

		expect(JSON.parse(stdout).issues[0]).toMatchObject({ path: ["value"] });
	}, 20_000);

	it("exits 2 when nothing listens (exit 2)", async () => {
		const { code, stdout, stderr } = await run(["commands"], 1);

		expect(code).toBe(2);
		expect(JSON.parse(stdout)).toMatchObject({ code: "CONNECTION_FAILED" });
		expect(stderr).toMatch(/cannot reach Metro/);
	}, 20_000);

	it("exits 2 when Metro is up but no app answers", async () => {
		const { code, stdout } = await run(["commands"]);

		expect(code).toBe(2);
		expect(JSON.parse(stdout)).toMatchObject({ code: "CONNECTION_FAILED" });
	}, 20_000);

	it("exits 2 on a protocol mismatch and says which side to update", async () => {
		app = await startFakeApp(broadcaster.port, registry, { protocolVersionSkew: 1 });
		const { code, stdout, stderr } = await run(["demo.echo", "--value", "hi"]);

		expect(code).toBe(2);
		expect(JSON.parse(stdout)).toMatchObject({ code: "PROTOCOL_MISMATCH" });
		expect(stderr).toMatch(/rebuild the package/i);
	}, 20_000);
});
