import { ApolloClient, InMemoryCache } from "@apollo/client";
import { beforeEach, describe, expect, it } from "vitest";

import { apiLink } from "../../server/server";
import { createTodosFeature } from ".";

/**
 * The feature is tested through its own methods, which is the call the screens
 * make and the call a command makes: `todos.add({ title })` either way. No
 * simulator, no React, and no registry in between, so a failure here points at
 * the feature rather than at the plumbing.
 *
 * Argument validation is deliberately not tested here. A feature does not
 * validate - `defineFeature` attaches the namespace and the spec and nothing
 * else - and the zod parse happens in the adapter, so it is tested against the
 * registry in `test/commands.test.ts`.
 */

describe("the todos feature", () => {
	let todos: ReturnType<typeof createTodosFeature>;

	beforeEach(() => {
		// A fresh client, so each test starts with an empty cache.
		todos = createTodosFeature({
			apollo: new ApolloClient({ link: apiLink, cache: new InMemoryCache() }),
		});
	});

	it("exposes its entry points and nothing else", () => {
		expect(Object.keys(todos).sort()).toEqual([
			"add",
			"addMany",
			"list",
			"remove",
			"removeAll",
			"setDone",
		]);
	});

	it("adds a todo and shows it in the cache the screen reads", async () => {
		await todos.list({ source: "network" });
		const rows = await todos.add({ title: "Write the brief" });

		expect(rows.map((t) => t.title)).toContain("Write the brief");
	});

	it("leaves the cache and the server agreeing after a mutation", async () => {
		await todos.list({ source: "network" });
		await todos.add({ title: "Check the cache update" });

		// Cache first: a network read writes to the cache and would hide the bug.
		const cached = await todos.list({ source: "cache" });
		const served = await todos.list({ source: "network" });

		expect(cached.map((t) => t.id)).toEqual(served.map((t) => t.id));
	});

	it("removes a todo from both the cache and the server", async () => {
		const before = await todos.list({ source: "network" });
		const target = before[0]!.id;

		await todos.remove({ id: target });

		const cached = await todos.list({ source: "cache" });
		const served = await todos.list({ source: "network" });

		expect(cached.map((t) => t.id)).not.toContain(target);
		expect(served.map((t) => t.id)).not.toContain(target);
	});

	it("fails when the id does not exist", async () => {
		// The rejection is what the adapter turns into COMMAND_FAILED.
		await expect(todos.setDone({ id: "nope", done: true })).rejects.toThrow();
	});

	it("keeps a description on the todo, and stores an empty one when it is left out", async () => {
		await todos.list({ source: "network" });
		await todos.add({ title: "Write the brief", description: "Two pages, no more." });
		const cached = await todos.add({ title: "Send it" });

		expect(cached).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: "Write the brief", description: "Two pages, no more." }),
				expect.objectContaining({ title: "Send it", description: "" }),
			]),
		);
	});
});
