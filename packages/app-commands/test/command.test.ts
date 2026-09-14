import { describe, expect, expectTypeOf, it } from "vitest";
import { z } from "zod";

import { command, featureCommands, InputError, type StandardSchemaV1 } from "../src/command";
import { buildRegistry, type Command, type Registry } from "../src/core/command";
import { handleRequest } from "../src/core/handle";
import { PROTOCOL_VERSION, type Response } from "../src/core/protocol";

const call = (registry: Registry, command: string, args?: unknown) =>
	handleRequest(registry, {
		id: "1",
		clientId: "test",
		protocolVersion: PROTOCOL_VERSION,
		cmd: "run",
		command,
		args,
	});

const failed = (res: Response) => {
	if (res.ok) throw new Error(`expected a failure, got ${JSON.stringify(res.result)}`);
	return res;
};

/**
 * A Standard Schema written by hand, with no library behind it and no JSON
 * Schema extension. If `command()` only worked with zod, this would fail.
 */
const positiveNumber: StandardSchemaV1<number> = {
	"~standard": {
		version: 1,
		vendor: "hand-rolled",
		validate: (value) =>
			typeof value === "number" && value > 0
				? { value }
				: { issues: [{ message: "expected a positive number" }] },
	},
};

describe("command()", () => {
	const echo = command()
		.input(z.object({ value: z.string().min(1) }))
		.description("Returns the value it was given, and writes nothing.")
		.run(async ({ value }) => ({ value }));

	it("is the function the UI calls", async () => {
		expect(await echo({ value: "hi" })).toEqual({ value: "hi" });
	});

	it("validates a direct call too, and rejects with the issues", async () => {
		const error = await echo({ value: "" }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(InputError);
		expect((error as InputError).issues[0]).toMatchObject({ path: ["value"] });
	});

	it("applies defaults on a direct call, as the bridge does", async () => {
		const list = command()
			.input({ source: z.enum(["cache", "network"]).default("cache") })
			.description("Returns where it would read from.")
			.run(async ({ source }) => source);
		expect(await list({})).toBe("cache");
	});

	it("turns a handler that throws synchronously into a rejection", async () => {
		const broken = command()
			.description("Always fails, on purpose.")
			.run((() => {
				throw new Error("sync");
			}) as never);
		await expect(broken()).rejects.toThrow("sync");
	});

	it("needs a description", () => {
		const untyped = command() as unknown as { run: (h: unknown) => unknown };
		expect(() => untyped.run(async () => null)).toThrow(/description/);
		expect(() =>
			command()
				.description("  ")
				.run(async () => null),
		).toThrow(/description/);
	});

	it("refuses a second input or description", () => {
		const once = command().input({}) as unknown as { input: (s: unknown) => unknown };
		expect(() => once.input({})).toThrow(/already/);
	});

	it("is a core Command, with the four fields", () => {
		expect(echo.description).toBe("Returns the value it was given, and writes nothing.");
		expect(echo.jsonSchema).toMatchObject({ type: "object", required: ["value"] });
		expect(echo.parse({ value: "" })).toMatchObject({ ok: false });
		expectTypeOf(echo).toMatchTypeOf<Command>();
	});

	it("runs without validation through run, for a caller that has already parsed", async () => {
		expect(await echo.run({ value: "" })).toEqual({ value: "" });
	});

	it("keeps its fields out of Object.keys and JSON", () => {
		const feature = { echo };
		expect(Object.keys(echo)).toEqual([]);
		expect(JSON.stringify(feature)).toBe("{}");
	});
});

describe("input forms", () => {
	it("a shape: required keys, optional keys, and issue paths", async () => {
		const add = command()
			.input({ title: z.string().min(1), description: z.string().optional() })
			.description("Adds a todo with a title and an optional description.")
			.run(async (input) => input);
		const registry = featureCommands({ todos: { add } });

		expect(registry["todos.add"]!.jsonSchema).toEqual({
			type: "object",
			properties: { title: { type: "string", minLength: 1 }, description: { type: "string" } },
			required: ["title"],
		});

		const res = failed(await call(registry, "todos.add", { title: "" }));
		expect(res.code).toBe("INVALID_ARGS");
		expect(res.issues?.[0]).toMatchObject({ path: ["title"] });

		// Unknown keys are dropped, and an omitted optional key stays omitted.
		expect(await call(registry, "todos.add", { title: "a", extra: 1 })).toMatchObject({
			ok: true,
			result: { title: "a" },
		});
		expect(failed(await call(registry, "todos.add", "not an object")).code).toBe("INVALID_ARGS");
	});

	it("an object schema: a default is optional for the caller and reaches the handler", async () => {
		const list = command()
			.input(z.object({ source: z.enum(["cache", "network"]).default("cache") }))
			.description("Returns where it would read from.")
			.run(async ({ source }) => source);
		const registry = featureCommands({ favorites: { list } });

		const schema = registry["favorites.list"]!.jsonSchema as {
			required?: string[];
			properties: Record<string, unknown>;
		};
		expect(schema.required).toBeUndefined();
		expect(schema.properties.source).toMatchObject({ enum: ["cache", "network"] });
		expect(await call(registry, "favorites.list", {})).toMatchObject({ ok: true, result: "cache" });
	});

	it("any Standard Schema, even one without a JSON Schema", async () => {
		const double = command()
			.input({ n: positiveNumber })
			.description("Returns twice the number it was given.")
			.run(async ({ n }) => n * 2);
		const registry = featureCommands({ math: { double } });

		expect(registry["math.double"]!.jsonSchema).toEqual({
			type: "object",
			properties: { n: {} },
			required: ["n"],
		});
		expect(await call(registry, "math.double", { n: 2 })).toMatchObject({ ok: true, result: 4 });
		expect(failed(await call(registry, "math.double", { n: -1 })).issues).toEqual([
			{ message: "expected a positive number", path: ["n"] },
		]);
	});

	it("an asynchronous Standard Schema", async () => {
		const later: StandardSchemaV1<string> = {
			"~standard": {
				version: 1,
				vendor: "hand-rolled",
				validate: async (value) =>
					typeof value === "string" ? { value } : { issues: [{ message: "expected a string" }] },
			},
		};
		const shout = command()
			.input({ text: later })
			.description("Returns the text in capitals.")
			.run(async ({ text }) => text.toUpperCase());
		const registry = featureCommands({ demo: { shout } });

		expect(await call(registry, "demo.shout", { text: "hi" })).toMatchObject({
			ok: true,
			result: "HI",
		});
		expect(failed(await call(registry, "demo.shout", { text: 1 })).code).toBe("INVALID_ARGS");
	});

	it("a validator function", async () => {
		const length = command()
			.input((value): string => {
				if (typeof value === "string") return value;
				throw new Error("Input is not a string");
			})
			.description("Returns the length of the string it was given.")
			.run(async (text) => text.length);
		const registry = featureCommands({ demo: { length } });

		expect(registry["demo.length"]!.jsonSchema).toEqual({});
		expect(await length("abc")).toBe(3);
		expect(failed(await call(registry, "demo.length", 1)).issues).toEqual([
			{ message: "Input is not a string" },
		]);
	});

	it("no input: an empty object or nothing, and not a primitive", async () => {
		const ping = command()
			.description("Answers pong, and does nothing else.")
			.run(async () => "pong");
		const registry = featureCommands({ demo: { ping } });

		expect(registry["demo.ping"]!.jsonSchema).toEqual({ type: "object", properties: {} });
		expect(await ping()).toBe("pong");
		expect(await call(registry, "demo.ping")).toMatchObject({ ok: true, result: "pong" });
		expect(failed(await call(registry, "demo.ping", "x")).code).toBe("INVALID_ARGS");
	});
});

describe("featureCommands()", () => {
	const ping = command()
		.description("Answers pong, and does nothing else.")
		.run(async () => "pong");
	const pong = command()
		.description("Answers ping, and does nothing else.")
		.run(async () => "ping");

	it("names a command by its path, so a nested feature adds a segment", () => {
		const settings = { ping };
		const registry = featureCommands({ todos: { ping }, profile: { settings, pong } });
		expect(Object.keys(registry).sort()).toEqual([
			"profile.pong",
			"profile.settings.ping",
			"todos.ping",
		]);
	});

	it("merges features with a spread", () => {
		expect(Object.keys(featureCommands({ demo: { ...{ ping }, ...{ pong } } }))).toEqual([
			"demo.ping",
			"demo.pong",
		]);
	});

	it("skips what is not a command or a plain object", () => {
		class Store {
			ping = ping;
		}
		const registry = featureCommands({
			demo: { ping, store: new Store(), helper: () => null, count: 1 },
		});
		expect(Object.keys(registry)).toEqual(["demo.ping"]);
	});

	it("puts a command into the registry as it is", () => {
		expect(featureCommands({ demo: { ping } })["demo.ping"]).toBe(ping);
	});

	it("does not collect an object literal with the four fields", () => {
		// `command().input(fn)` covers a library without Standard Schema, so a
		// hand-written command is a second way to do the same thing.
		const literal: Command = {
			description: "Returns its arguments, and writes nothing.",
			jsonSchema: { type: "object" },
			parse: (input) => ({ ok: true, value: input }),
			run: async (args) => args,
		};
		expect(Object.keys(featureCommands({ demo: { literal, ping } }))).toEqual(["demo.ping"]);
	});

	it("does not compute a schema until something reads it", () => {
		let computed = 0;
		const counted: StandardSchemaV1<string> = {
			"~standard": {
				version: 1,
				vendor: "hand-rolled",
				validate: (value) => ({ value: String(value) }),
				...{
					jsonSchema: {
						input: () => {
							computed += 1;
							return { type: "string" };
						},
					},
				},
			},
		};
		const lazy = command()
			.input(counted)
			.description("Returns its input as a string.")
			.run(async (text) => text);
		featureCommands({ demo: { lazy } });
		expect(computed).toBe(0);
		void lazy.jsonSchema;
		void lazy.jsonSchema;
		expect(computed).toBe(1);
	});

	it("wants every command inside a namespace", () => {
		expect(() => featureCommands({ ping })).toThrow(/without a namespace/);
	});

	it("rejects a segment the CLI cannot address", () => {
		expect(() => featureCommands({ "my-feature": { ping } })).toThrow(/invalid name "my-feature"/);
	});

	it("rejects a cycle", () => {
		const loop: Record<string, unknown> = { ping };
		loop.self = loop;
		expect(() => featureCommands({ demo: loop })).toThrow(/cannot be cyclic/);
	});

	it("merges into a registry beside the other adapters, and lists the schema", async () => {
		const registry = buildRegistry(featureCommands({ demo: { ping } }));
		const res = await handleRequest(registry, {
			id: "1",
			clientId: "test",
			protocolVersion: PROTOCOL_VERSION,
			cmd: "commands",
		});
		expect(res).toMatchObject({
			ok: true,
			result: [{ name: "demo.ping", args: { type: "object", properties: {} } }],
		});
	});
});

describe("types", () => {
	it("gives the caller the input type and the handler the output type", () => {
		const list = command()
			.input({
				source: z.enum(["cache", "network"]).default("cache"),
				limit: z.number().optional(),
			})
			.description("Lists things.")
			.run(async (input) => {
				expectTypeOf(input).toEqualTypeOf<{
					source: "cache" | "network";
					limit?: number | undefined;
				}>();
				return input.source;
			});

		expectTypeOf(list).parameter(0).toEqualTypeOf<{
			source?: "cache" | "network" | undefined;
			limit?: number | undefined;
		}>();
		expectTypeOf(list).returns.resolves.toEqualTypeOf<"cache" | "network">();
	});

	it("takes no argument without an input", () => {
		const ping = command()
			.description("Answers pong.")
			.run(async () => "pong" as const);
		expectTypeOf(ping).toBeCallableWith();
	});

	it("offers run only after description, and each step once", () => {
		// @ts-expect-error run needs a description
		void command().run;
		// @ts-expect-error input can be set once
		void command().input({}).input;
		// @ts-expect-error description can be set once
		void command().description("x").description;
	});
});
