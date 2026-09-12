import { describe, expect, it } from "vitest";

import { buildRegistry, lookup, type Command, type Registry } from "../src/core/command";
import { handleRequest } from "../src/core/handle";
import { PROTOCOL_VERSION, type Request, type Response } from "../src/core/protocol";
import { toJsonSafe } from "../src/core/serialize";

/**
 * Every registry here is built by hand: a literal JSON Schema and a plain
 * `parse` function, with no zod and nothing from feature-kit.
 *
 * That is the point of the file. agent-bridge is supposed to know four things
 * per command and nothing about where they came from, so if this test ever
 * needs a validation library or the feature layer to express itself, the bridge
 * has stopped being agnostic and the layering has leaked.
 */

const anything: Command["parse"] = (input) => ({ ok: true, value: input });

/** A hand-rolled stand-in for `z.object({ value: z.string().min(1) })`. */
const requiresValue: Command["parse"] = (input) => {
	const value = (input as { value?: unknown })?.value;
	return typeof value === "string" && value.length > 0
		? { ok: true, value: { value } }
		: { ok: false, issues: [{ path: ["value"], message: "expected a non-empty string" }] };
};

const command = (over: Partial<Command> = {}): Command => ({
	description: "Returns its arguments.",
	jsonSchema: { type: "object", properties: {}, additionalProperties: true },
	parse: anything,
	run: async (args) => args,
	...over,
});

const echo: Registry = {
	"demo.echo": command({
		jsonSchema: {
			type: "object",
			properties: { value: { type: "string", minLength: 1 } },
			required: ["value"],
		},
		parse: requiresValue,
	}),
};

const single = (name: string, over: Partial<Command>): Registry => ({
	[`demo.${name}`]: command(over),
});

const request = (req: Partial<Request> & Pick<Request, "cmd">): Request =>
	({
		id: "req-1",
		clientId: "client-1",
		protocolVersion: PROTOCOL_VERSION,
		...req,
	}) as Request;

const run = (registry: Registry, req: Partial<Request> & Pick<Request, "cmd">) =>
	handleRequest(registry, request(req));

const failed = (res: Response) => {
	if (res.ok) throw new Error(`expected a failure, got ${JSON.stringify(res.result)}`);
	return res;
};

describe("buildRegistry", () => {
	it("merges the slices the adapters return", () => {
		const merged = buildRegistry(echo, single("other", {}));
		expect(Object.keys(merged).sort()).toEqual(["demo.echo", "demo.other"]);
	});

	it("throws on a duplicate key and names it", () => {
		expect(() => buildRegistry(echo, echo)).toThrow('duplicate command "demo.echo"');
	});

	it("returns an empty registry for no slices", () => {
		expect(buildRegistry()).toEqual({});
	});
});

describe("lookup", () => {
	it("finds a command", () => {
		expect(lookup(echo, "demo.echo")).toBe(echo["demo.echo"]);
	});

	it("does not answer for an inherited property", () => {
		// A plain object would hand back Object.prototype.toString here, and the
		// handler would try to call it as a command.
		expect(lookup(echo, "toString")).toBeUndefined();
		expect(lookup(echo, "constructor")).toBeUndefined();
		expect(lookup(echo, "__proto__")).toBeUndefined();
	});
});

describe("handleRequest", () => {
	it("copies id and clientId into the response", async () => {
		const res = await handleRequest(echo, {
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
		const registry = single("noArgs", { run: async () => "done" });
		expect(await run(registry, { cmd: "run", command: "demo.noArgs" })).toMatchObject({
			ok: true,
			result: "done",
		});
	});

	it("passes the parsed value to run, not the raw input", async () => {
		// A parse that fills in a default is how `.default()` reaches a handler.
		const registry = single("listed", {
			parse: (input) => ({ ok: true, value: { source: "cache", ...(input as object) } }),
			run: async (args) => args,
		});
		expect(await run(registry, { cmd: "run", command: "demo.listed", args: {} })).toMatchObject({
			ok: true,
			result: { source: "cache" },
		});
	});

	describe("error codes", () => {
		it("PROTOCOL_MISMATCH names both versions", async () => {
			const res = failed(
				await handleRequest(echo, {
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
			const res = failed(await run(echo, { cmd: "run", command: "demo.nope" }));
			expect(res.code).toBe("UNKNOWN_COMMAND");
			expect(res.error).toContain("demo.nope");
		});

		it("INVALID_ARGS carries the issues parse returned, untouched", async () => {
			const res = failed(
				await run(echo, { cmd: "run", command: "demo.echo", args: { value: "" } }),
			);
			expect(res.code).toBe("INVALID_ARGS");
			expect(res.issues?.[0]).toMatchObject({ path: ["value"] });
		});

		it("COMMAND_FAILED carries the error message", async () => {
			const registry = single("fail", {
				run: async () => {
					throw new Error("nope");
				},
			});
			const res = failed(await run(registry, { cmd: "run", command: "demo.fail" }));
			expect(res.code).toBe("COMMAND_FAILED");
			expect(res.error).toBe("nope");
		});

		it("reports a throwing parse as the adapter's bug, not a transport failure", async () => {
			const registry = single("bad", {
				parse: () => {
					throw new Error("schema is broken");
				},
			});
			const res = failed(await run(registry, { cmd: "run", command: "demo.bad" }));
			expect(res.code).toBe("COMMAND_FAILED");
			expect(res.error).toContain("parse function");
			expect(res.error).toContain("schema is broken");
		});

		it("TIMEOUT, without waiting for the command", async () => {
			let settled = false;
			const registry = single("slow", {
				run: () =>
					new Promise<string>((resolve) =>
						setTimeout(() => {
							settled = true;
							resolve("late");
						}, 2_000),
					),
			});
			const started = Date.now();
			const res = failed(await run(registry, { cmd: "run", command: "demo.slow", timeoutMs: 50 }));
			expect(res.code).toBe("TIMEOUT");
			expect(res.error).toContain("50 ms");
			expect(Date.now() - started).toBeLessThan(1_000);
			expect(settled).toBe(false);
		});

		it("NOT_SERIALIZABLE names the path of the first bad value", async () => {
			const registry = single("mapped", {
				run: async () => ({ items: [{ id: 1 }, { id: 2, tags: new Map() }] }),
			});
			const res = failed(await run(registry, { cmd: "run", command: "demo.mapped" }));
			expect(res.code).toBe("NOT_SERIALIZABLE");
			expect(res.error).toContain("result.items[1].tags");
		});
	});

	it("returns a Date as an ISO string", async () => {
		const registry = single("dated", {
			run: async () => ({ at: new Date("2026-09-11T10:20:30.000Z") }),
		});
		expect(await run(registry, { cmd: "run", command: "demo.dated" })).toMatchObject({
			ok: true,
			result: { at: "2026-09-11T10:20:30.000Z" },
		});
	});
});

describe("the commands request", () => {
	it("describes every command, sorted by name, handing back the schema verbatim", async () => {
		const favoritesSchema = {
			type: "object",
			properties: {
				source: { enum: ["cache", "network"] },
				itemId: { type: "string", minLength: 1 },
			},
			required: ["itemId"],
		};
		const registry = buildRegistry(echo, {
			"favorites.list": command({ description: "Lists favorites.", jsonSchema: favoritesSchema }),
		});

		const res = await handleRequest(registry, request({ cmd: "commands" }));
		if (!res.ok) throw new Error(res.error);

		const infos = res.result as { name: string; description: string; args: object }[];
		expect(infos.map((i) => i.name)).toEqual(["demo.echo", "favorites.list"]);
		// The bridge does not interpret the schema, so it must not reshape it either:
		// the CLI flags and the web UI form are built from exactly what the app sent.
		expect(infos[1]!.args).toEqual(favoritesSchema);
		expect(infos[1]!.description).toBe("Lists favorites.");
	});

	it("answers with an empty list for an empty registry", async () => {
		const res = await handleRequest({}, request({ cmd: "commands" }));
		expect(res).toMatchObject({ ok: true, result: [] });
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
