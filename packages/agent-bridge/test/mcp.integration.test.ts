import { existsSync } from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { buildTools } from "../mcp/tools";
import { buildRegistry, command, defineCommands } from "../src/core/command";
import type { CommandInfo } from "../src/core/protocol";
import {
	startFakeApp,
	startFakeBroadcaster,
	type FakeApp,
	type FakeBroadcaster,
} from "./fake-broadcaster";

const BINARY = path.join(__dirname, "..", "build", "mcp", "index.js");

const registry = buildRegistry([
	defineCommands("demo", {
		echo: command({
			description: "Returns its arguments.",
			args: z.object({ value: z.string().min(1) }),
			run: async (args) => args,
		}),
		fail: command({
			description: "Always throws.",
			args: z.object({}),
			run: async () => {
				throw new Error("demo.fail always throws");
			},
		}),
	}),
]);

let broadcaster: FakeBroadcaster;
let app: FakeApp | undefined;
let client: Client | undefined;

beforeEach(async () => {
	broadcaster = await startFakeBroadcaster();
});

afterEach(async () => {
	await client?.close();
	client = undefined;
	app?.close();
	app = undefined;
	await broadcaster.close();
});

async function connect(port = broadcaster.port): Promise<Client> {
	if (!existsSync(BINARY)) {
		throw new Error(`${BINARY} is missing. Run \`pnpm --filter agent-bridge build\` first.`);
	}
	const connected = new Client({ name: "test", version: "0" });
	await connected.connect(
		new StdioClientTransport({
			command: "node",
			args: [BINARY, "--port", String(port)],
			stderr: "ignore",
		}),
	);
	client = connected;
	return connected;
}

/** The tools carry their payload as one JSON document, the way the CLI writes one. */
function payload(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
	const content = result.content as { type: string; text: string }[];
	return JSON.parse(content[0]!.text);
}

describe("the tool list", () => {
	const info = (name: string, args: object = { type: "object" }): CommandInfo => ({
		name,
		description: "d",
		args,
	});

	it("turns a command name into a tool name", () => {
		const { tools, commandOf } = buildTools([info("todos.add")], new Set());

		expect(tools[0]!.name).toBe("todos_add");
		expect(commandOf.get("todos_add")).toBe("todos.add");
	});

	it("renames a tool rather than letting two commands share one name", () => {
		const { commandOf } = buildTools([info("todos.a.b"), info("todos.a_b")], new Set());

		expect(commandOf.get("todos_a_b")).toBe("todos.a.b");
		expect(commandOf.get("todos_a_b_2")).toBe("todos.a_b");
	});

	it("keeps clear of the names the server reserves", () => {
		const { tools } = buildTools([info("run")], new Set(["run"]));

		expect(tools[0]!.name).toBe("run_2");
	});

	it("passes the app's schema through without its $schema", () => {
		const args = {
			$schema: "https://json-schema.org/draft/2020-12/schema",
			type: "object",
			properties: { title: { type: "string" } },
			required: ["title"],
		};
		const { tools } = buildTools([info("todos.add", args)], new Set());

		expect(tools[0]!.inputSchema).toEqual({
			type: "object",
			properties: { title: { type: "string" } },
			required: ["title"],
		});
	});
});

describe("the MCP server", () => {
	it("exposes one tool per command alongside the two meta tools", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const { tools } = await (await connect()).listTools();

		expect(tools.map((t) => t.name)).toEqual(["commands", "run", "demo_echo", "demo_fail"]);
		expect(tools[2]!.description).toContain("agent-bridge command: demo.echo");
		expect(tools[2]!.inputSchema).toMatchObject({ type: "object", required: ["value"] });
	}, 20_000);

	it("runs a command through its own tool", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const connected = await connect();
		await connected.listTools();

		const result = await connected.callTool({ name: "demo_echo", arguments: { value: "hi" } });

		expect(result.isError).toBeFalsy();
		expect(payload(result)).toEqual({ value: "hi" });
	}, 20_000);

	it("runs a command by name through the run tool", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const result = await (
			await connect()
		).callTool({
			name: "run",
			arguments: { command: "demo.echo", args: { value: "by name" } },
		});

		expect(payload(result)).toEqual({ value: "by name" });
	}, 20_000);

	it("lists the commands with their schemas", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const result = await (await connect()).callTool({ name: "commands", arguments: {} });

		const commands = payload(result) as CommandInfo[];
		expect(commands.map((c) => c.name)).toEqual(["demo.echo", "demo.fail"]);
	}, 20_000);

	it.each([
		[{ name: "demo_fail", arguments: {} }, "COMMAND_FAILED"],
		[{ name: "demo_echo", arguments: { value: "" } }, "INVALID_ARGS"],
		[{ name: "run", arguments: { command: "demo.nope" } }, "UNKNOWN_COMMAND"],
		[{ name: "run", arguments: {} }, "USAGE"],
	])(
		"reports %j as a tool error",
		async (call, code) => {
			app = await startFakeApp(broadcaster.port, registry);
			const connected = await connect();
			await connected.listTools();

			const result = await connected.callTool(call);

			expect(result.isError).toBe(true);
			expect(payload(result)).toMatchObject({ code });
		},
		20_000,
	);

	it("reports the Zod issues on invalid arguments", async () => {
		app = await startFakeApp(broadcaster.port, registry);
		const connected = await connect();
		await connected.listTools();

		const result = await connected.callTool({ name: "demo_echo", arguments: { value: "" } });

		expect((payload(result) as { issues: { path: string[] }[] }).issues[0]).toMatchObject({
			path: ["value"],
		});
	}, 20_000);

	it("still serves the meta tools when no app is connected", async () => {
		const connected = await connect();

		const { tools } = await connected.listTools();
		expect(tools.map((t) => t.name)).toEqual(["commands", "run"]);

		const result = await connected.callTool({ name: "commands", arguments: {} });
		expect(result.isError).toBe(true);
		expect(payload(result)).toMatchObject({ code: "CONNECTION_FAILED" });
	}, 30_000);

	it("says how to reach the app when Metro is down", async () => {
		const result = await (await connect(1)).callTool({ name: "commands", arguments: {} });

		expect(payload(result)).toMatchObject({ code: "CONNECTION_FAILED" });
		expect(JSON.stringify(payload(result))).toMatch(/Start Metro/);
	}, 20_000);
});
