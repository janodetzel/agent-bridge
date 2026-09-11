import { ApolloClient, InMemoryCache } from "@apollo/client";
import { buildRegistry, handleRequest, PROTOCOL_VERSION, type Registry } from "agent-bridge/core";
import { beforeEach, describe, expect, it } from "vitest";

import { apiLink } from "../src/app/api";
import { settingsCommands } from "../src/features/settings/commands";
import { createSettingsStore, type SettingsState } from "../src/features/settings/store";
import { todosCommands } from "../src/features/todos/commands";

/**
 * The commands are tested the way the CLI calls them, against the same functions
 * the screens call. No simulator and no React: `handleRequest` only needs a registry.
 */

const memoryStorage = () => {
	let saved: SettingsState | null = null;
	return {
		get: async () => saved,
		set: async (settings: SettingsState) => {
			saved = settings;
		},
		read: () => saved,
	};
};

const call = (registry: Registry, command: string, args?: unknown) =>
	handleRequest(registry, {
		id: "1",
		clientId: "test",
		protocolVersion: PROTOCOL_VERSION,
		cmd: "run",
		command,
		args,
	});

const resultOf = async (registry: Registry, command: string, args?: unknown) => {
	const response = await call(registry, command, args);
	if (!response.ok) throw new Error(`${command}: ${response.code}: ${response.error}`);
	return response.result;
};

describe("todos commands", () => {
	let registry: Registry;

	beforeEach(() => {
		// A fresh client, so each test starts with an empty cache.
		const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
		registry = buildRegistry([todosCommands(client)]);
	});

	it("adds a todo and shows it in the cache the screen reads", async () => {
		await resultOf(registry, "todos.list", { source: "network" });
		const todos = (await resultOf(registry, "todos.add", { title: "Write the brief" })) as {
			title: string;
		}[];

		expect(todos.map((t) => t.title)).toContain("Write the brief");
	});

	it("leaves the cache and the server agreeing after a mutation", async () => {
		await resultOf(registry, "todos.list", { source: "network" });
		await resultOf(registry, "todos.add", { title: "Check the cache update" });

		// Cache first: a network read writes to the cache and would hide the bug.
		const cached = (await resultOf(registry, "todos.list", { source: "cache" })) as {
			id: string;
		}[];
		const served = (await resultOf(registry, "todos.list", { source: "network" })) as {
			id: string;
		}[];

		expect(cached.map((t) => t.id)).toEqual(served.map((t) => t.id));
	});

	it("removes a todo from both the cache and the server", async () => {
		const before = (await resultOf(registry, "todos.list", { source: "network" })) as {
			id: string;
		}[];
		const target = before[0]!.id;

		await resultOf(registry, "todos.remove", { id: target });

		const cached = (await resultOf(registry, "todos.list", { source: "cache" })) as {
			id: string;
		}[];
		const served = (await resultOf(registry, "todos.list", { source: "network" })) as {
			id: string;
		}[];

		expect(cached.map((t) => t.id)).not.toContain(target);
		expect(served.map((t) => t.id)).not.toContain(target);
	});

	it("fails when the id does not exist", async () => {
		const response = await call(registry, "todos.setDone", { id: "nope", done: true });
		expect(response).toMatchObject({ ok: false, code: "COMMAND_FAILED" });
	});

	it("rejects an empty title before it reaches the API", async () => {
		const response = await call(registry, "todos.add", { title: "" });
		expect(response).toMatchObject({ ok: false, code: "INVALID_ARGS" });
	});
});

describe("settings commands", () => {
	it("saves what it sets, and returns state without the actions", async () => {
		const storage = memoryStorage();
		const registry = buildRegistry([settingsCommands(createSettingsStore({ storage }))]);

		expect(await resultOf(registry, "settings.setUnits", { units: "mi" })).toBe("mi");
		expect(storage.read()).toEqual({ units: "mi", notifications: true });
		expect(await resultOf(registry, "settings.get")).toEqual({
			units: "mi",
			notifications: true,
		});
	});

	it("rolls back and fails when the save fails", async () => {
		const store = createSettingsStore({
			storage: {
				get: async () => null,
				set: async () => {
					throw new Error("disk full");
				},
			},
		});
		const registry = buildRegistry([settingsCommands(store)]);

		const response = await call(registry, "settings.setUnits", { units: "mi" });

		expect(response).toMatchObject({ ok: false, code: "COMMAND_FAILED", error: "disk full" });
		// The rethrow is what makes the command fail, and the rollback is what keeps
		// the screen showing what was actually saved.
		expect(store.getState().units).toBe("km");
	});

	it("loads what was saved earlier", async () => {
		const storage = memoryStorage();
		await storage.set({ units: "mi", notifications: false });

		const store = createSettingsStore({ storage });
		await store.getState().load();

		expect(store.getState()).toMatchObject({ units: "mi", notifications: false });
	});
});
