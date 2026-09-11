import { describe, expect, it } from "vitest";
import { z } from "zod";

import { buildRegistry, command, defineCommands, type CommandGroup } from "../src/core/command";
import { handleRequest } from "../src/core/handle";
import { PROTOCOL_VERSION, type Request, type Response } from "../src/core/protocol";
import { toJsonSafe } from "../src/core/serialize";

const echo = command({
	description: "Returns its arguments.",
	args: z.object({ value: z.string().min(1) }),
	run: async ({ value }) => ({ value }),
});

const request = (req: Partial<Request> & Pick<Request, "cmd">): Request =>
	({
		id: "req-1",
		clientId: "client-1",
		protocolVersion: PROTOCOL_VERSION,
		...req,
	}) as Request;

const run = (groups: CommandGroup[], req: Partial<Request> & Pick<Request, "cmd">) =>
	handleRequest(buildRegistry(groups), request(req));

const single = (name: string, cmd: ReturnType<typeof command>) =>
	[defineCommands("demo", { [name]: cmd })] as CommandGroup[];

const failed = (res: Response) => {
	if (res.ok) throw new Error(`expected a failure, got ${JSON.stringify(res.result)}`);
	return res;
};

describe("defineCommands", () => {
	it("accepts a camelCase namespace", () => {
		expect(defineCommands("myFeature", { echo }).namespace).toBe("myFeature");
	});

	it.each(["Demo", "my-feature", "my.feature", "1st", ""])("rejects %o", (namespace) => {
		expect(() => defineCommands(namespace, { echo })).toThrow(/invalid namespace/);
	});
});

describe("buildRegistry", () => {
	it("keys commands by namespace and name", () => {
		const registry = buildRegistry([defineCommands("demo", { echo })]);
		expect([...registry.keys()]).toEqual(["demo.echo"]);
	});

	it("throws on a duplicate key and names it", () => {
		const groups = [defineCommands("demo", { echo }), defineCommands("demo", { echo })];
		expect(() => buildRegistry(groups)).toThrow('duplicate command "demo.echo"');
	});
});

describe("handleRequest", () => {
	it("copies id and clientId into the response", async () => {
		const res = await handleRequest(buildRegistry(single("echo", echo)), {
			id: "abc",
			clientId: "cli-7",
			protocolVersion: PROTOCOL_VERSION,
			cmd: "run",
			command: "demo.echo",
			args: { value: "hi" },
		});
		expect(res).toMatchObject({ id: "abc", clientId: "cli-7", ok: true, result: { value: "hi" } });
		expect(res.ok && typeof res.durationMs).toBe("number");
	});

	it("treats a missing args as an empty object", async () => {
		const noArgs = command({
			description: "Takes nothing.",
			args: z.object({}),
			run: async () => "done",
		});
		const res = await run(single("noArgs", noArgs), { cmd: "run", command: "demo.noArgs" });
		expect(res).toMatchObject({ ok: true, result: "done" });
	});

	describe("error codes", () => {
		it("PROTOCOL_MISMATCH names both versions", async () => {
			const res = failed(
				await handleRequest(buildRegistry(single("echo", echo)), {
					id: "1",
					clientId: "c",
					protocolVersion: PROTOCOL_VERSION + 1,
					cmd: "commands",
				}),
			);
			expect(res.code).toBe("PROTOCOL_MISMATCH");
			expect(res.error).toContain(String(PROTOCOL_VERSION + 1));
			expect(res.error).toContain(String(PROTOCOL_VERSION));
		});

		it("UNKNOWN_COMMAND", async () => {
			const res = failed(await run(single("echo", echo), { cmd: "run", command: "demo.nope" }));
			expect(res.code).toBe("UNKNOWN_COMMAND");
			expect(res.error).toContain("demo.nope");
		});

		it("INVALID_ARGS carries the Zod issues", async () => {
			const res = failed(
				await run(single("echo", echo), { cmd: "run", command: "demo.echo", args: { value: "" } }),
			);
			expect(res.code).toBe("INVALID_ARGS");
			expect(res.issues?.[0]).toMatchObject({ path: ["value"] });
		});

		it("COMMAND_FAILED carries the error message", async () => {
			const boom = command({
				description: "Always throws.",
				args: z.object({}),
				run: async () => {
					throw new Error("nope");
				},
			});
			const res = failed(await run(single("fail", boom), { cmd: "run", command: "demo.fail" }));
			expect(res.code).toBe("COMMAND_FAILED");
			expect(res.error).toBe("nope");
		});

		it("TIMEOUT, without waiting for the command", async () => {
			let settled = false;
			const slow = command({
				description: "Resolves long after the timeout.",
				args: z.object({}),
				run: () =>
					new Promise<string>((resolve) =>
						setTimeout(() => {
							settled = true;
							resolve("late");
						}, 2_000),
					),
			});
			const started = Date.now();
			const res = failed(
				await run(single("slow", slow), { cmd: "run", command: "demo.slow", timeoutMs: 50 }),
			);
			expect(res.code).toBe("TIMEOUT");
			expect(res.error).toContain("50 ms");
			expect(Date.now() - started).toBeLessThan(1_000);
			expect(settled).toBe(false);
		});

		it("NOT_SERIALIZABLE names the path of the first bad value", async () => {
			const mapped = command({
				description: "Returns a Map.",
				args: z.object({}),
				run: async () => ({ items: [{ id: 1 }, { id: 2, tags: new Map() }] }),
			});
			const res = failed(
				await run(single("mapped", mapped), { cmd: "run", command: "demo.mapped" }),
			);
			expect(res.code).toBe("NOT_SERIALIZABLE");
			expect(res.error).toContain("result.items[1].tags");
		});
	});

	it("returns a Date as an ISO string", async () => {
		const dated = command({
			description: "Returns a Date.",
			args: z.object({}),
			run: async () => ({ at: new Date("2026-09-11T10:20:30.000Z") }),
		});
		const res = await run(single("dated", dated), { cmd: "run", command: "demo.dated" });
		expect(res).toMatchObject({ ok: true, result: { at: "2026-09-11T10:20:30.000Z" } });
	});
});

describe("the commands request", () => {
	const listed = command({
		description: "Lists favorites.",
		args: z.object({
			source: z.enum(["cache", "network"]).default("cache"),
			itemId: z.string().min(1),
			limit: z.number().int().optional(),
			verbose: z.boolean().default(false),
		}),
		run: async () => [],
	});

	it("describes every command, sorted by name, with JSON Schema arguments", async () => {
		const groups = [
			defineCommands("favorites", { list: listed }),
			defineCommands("demo", { echo }),
		];
		const res = await handleRequest(buildRegistry(groups), request({ cmd: "commands" }));
		if (!res.ok) throw new Error(res.error);

		const infos = res.result as { name: string; description: string; args: Record<string, any> }[];
		expect(infos.map((i) => i.name)).toEqual(["demo.echo", "favorites.list"]);

		const schema = infos[1]!.args;
		expect(schema.type).toBe("object");
		expect(schema.properties.source).toMatchObject({ enum: ["cache", "network"] });
		expect(schema.properties.itemId).toMatchObject({ type: "string", minLength: 1 });
		expect(schema.properties.limit).toMatchObject({ type: "integer" });
		expect(schema.properties.verbose).toMatchObject({ type: "boolean" });
		// A default makes the argument optional for the caller.
		expect(schema.required).toEqual(["itemId"]);
	});
});

describe("toJsonSafe", () => {
	it("drops undefined in an object and nulls it at the top level and in arrays", () => {
		expect(toJsonSafe(undefined)).toEqual({ ok: true, value: null });
		expect(toJsonSafe({ a: 1, b: undefined })).toEqual({ ok: true, value: { a: 1 } });
		expect(toJsonSafe([1, undefined])).toEqual({ ok: true, value: [1, null] });
	});

	it.each([
		[{ a: { b: new Set() } }, "result.a.b"],
		[{ a: [1, () => {}] }, "result.a[1]"],
		[{ "not an identifier": 1n }, 'result["not an identifier"]'],
		[{ n: Number.NaN }, "result.n"],
		[{ n: Number.POSITIVE_INFINITY }, "result.n"],
	])("fails on %o at %s", (value, path) => {
		expect(toJsonSafe(value)).toMatchObject({ ok: false, path });
	});

	it("fails on a cycle", () => {
		const a: Record<string, unknown> = {};
		a.self = a;
		expect(toJsonSafe(a)).toMatchObject({
			ok: false,
			path: "result.self",
			reason: "circular reference",
		});
	});

	it("keeps a value that appears twice without being a cycle", () => {
		const shared = { id: 1 };
		expect(toJsonSafe({ a: shared, b: shared })).toEqual({
			ok: true,
			value: { a: { id: 1 }, b: { id: 1 } },
		});
	});
});
