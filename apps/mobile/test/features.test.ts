import { ApolloClient, InMemoryCache } from "@apollo/client";
import { buildRegistry, handleRequest, PROTOCOL_VERSION, type Registry } from "agent-bridge/core";
import { featureCommands } from "agent-bridge/feature-kit";
import { beforeEach, describe, expect, it } from "vitest";

import { apiLink } from "../src/app/api";
import { createNews } from "../src/features/news";
import { createDismissedNewsStore } from "../src/features/news/store";
import { createSettings } from "../src/features/settings";
import { createSettingsStore, type SettingsState } from "../src/features/settings/store";
import { createTodos } from "../src/features/todos";

/**
 * The features are tested the way the CLI calls them, through the registry, and
 * that is the same method the screens call. No simulator and no React:
 * `handleRequest` only needs a registry.
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

const memoryDismissedStorage = () => {
	let saved: string[] | null = null;
	return {
		get: async () => saved,
		set: async (ids: string[]) => {
			saved = ids;
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

describe("the todos feature", () => {
	let registry: Registry;

	beforeEach(() => {
		// A fresh client, so each test starts with an empty cache.
		const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
		registry = featureCommands(createTodos({ apollo: client }));
	});

	it("registers its commands under its own namespace", () => {
		expect(Object.keys(registry).sort()).toEqual([
			"todos.add",
			"todos.list",
			"todos.remove",
			"todos.setDone",
		]);
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

describe("the settings feature", () => {
	it("saves what it sets, and returns state without the actions", async () => {
		const storage = memoryStorage();
		const registry = featureCommands(createSettings({ store: createSettingsStore({ storage }) }));

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
		const registry = featureCommands(createSettings({ store }));

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

	it("is callable as plain methods, the way the screen calls it", async () => {
		const storage = memoryStorage();
		const store = createSettingsStore({ storage });
		const settings = createSettings({ store });

		// The screen does exactly this. There is no second implementation for it.
		await settings.setNotifications({ notifications: false });

		expect(store.getState().notifications).toBe(false);
		expect(storage.read()).toEqual({ units: "km", notifications: false });
	});
});

describe("the news feature", () => {
	let registry: Registry;

	beforeEach(() => {
		const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
		registry = featureCommands(
			createNews({
				apollo: client,
				dismissed: createDismissedNewsStore({ storage: memoryDismissedStorage() }),
			}),
		);
	});

	it("dismisses an article so it drops out of list", async () => {
		const before = (await resultOf(registry, "news.list", { source: "network" })) as {
			id: string;
		}[];
		const target = before[0]!.id;

		await resultOf(registry, "news.dismiss", { id: target });

		const cached = (await resultOf(registry, "news.list", { source: "cache" })) as { id: string }[];
		expect(cached.map((a) => a.id)).not.toContain(target);
		expect(cached.length).toBe(before.length - 1);
	});

	it("saves the dismissal, so a fresh store reads it back", async () => {
		const storage = memoryDismissedStorage();
		const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
		const store = createDismissedNewsStore({ storage });
		const commands = featureCommands(createNews({ apollo: client, dismissed: store }));

		const before = (await resultOf(commands, "news.list", { source: "network" })) as {
			id: string;
		}[];
		await resultOf(commands, "news.dismiss", { id: before[0]!.id });

		const reloaded = createDismissedNewsStore({ storage });
		await reloaded.getState().load();
		expect(reloaded.getState().dismissedIds).toEqual([before[0]!.id]);
	});

	it("rolls back and fails when the save fails", async () => {
		const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
		const store = createDismissedNewsStore({
			storage: {
				get: async () => null,
				set: async () => {
					throw new Error("disk full");
				},
			},
		});
		const commands = featureCommands(createNews({ apollo: client, dismissed: store }));

		const response = await call(commands, "news.dismiss", { id: "a1" });

		expect(response).toMatchObject({ ok: false, code: "COMMAND_FAILED", error: "disk full" });
		expect(store.getState().dismissedIds).toEqual([]);
	});

	it("rejects an empty id before it reaches the store", async () => {
		const response = await call(registry, "news.dismiss", { id: "" });
		expect(response).toMatchObject({ ok: false, code: "INVALID_ARGS" });
	});
});

describe("the registry the app builds", () => {
	it("holds every feature's commands under a namespace of its own", async () => {
		const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
		const registry = buildRegistry(
			featureCommands(
				createTodos({ apollo: client }),
				createNews({
					apollo: client,
					dismissed: createDismissedNewsStore({ storage: memoryDismissedStorage() }),
				}),
				createSettings({ store: createSettingsStore({ storage: memoryStorage() }) }),
			),
		);

		const namespaces = new Set(Object.keys(registry).map((key) => key.split(".")[0]));
		expect([...namespaces].sort()).toEqual(["news", "settings", "todos"]);

		// Every command carries a description written for the agent, not a name
		// turned into a sentence, and a schema the CLI can build flags from.
		for (const [name, cmd] of Object.entries(registry)) {
			expect(cmd.description.length, name).toBeGreaterThan(20);
			expect(cmd.jsonSchema, name).toMatchObject({ type: "object" });
		}
	});
});
