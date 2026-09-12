import { ApolloClient, InMemoryCache } from "@apollo/client";
import { beforeEach, describe, expect, it } from "vitest";

import { apiLink } from "../../app/api";
import { createNews } from ".";
import { createDismissedNewsStore } from "./store";

/**
 * The feature is tested through its own methods, which is what the screen calls
 * and what a command calls. Server data comes from the Apollo cache and local
 * dismissals from a store, and `list` combines them with the same function the
 * screen uses.
 */

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

/** A fresh client, so each test starts with an empty cache. */
const freshApollo = () => new ApolloClient({ link: apiLink, cache: new InMemoryCache() });

describe("the news feature", () => {
	let news: ReturnType<typeof createNews>;

	beforeEach(() => {
		news = createNews({
			apollo: freshApollo(),
			store: createDismissedNewsStore({ storage: memoryDismissedStorage() }),
		});
	});

	it("dismisses an article so it drops out of list", async () => {
		const before = await news.list({ source: "network" });
		const target = before[0]!.id;

		await news.dismiss({ id: target });

		const cached = await news.list({ source: "cache" });
		expect(cached.map((a) => a.id)).not.toContain(target);
		expect(cached.length).toBe(before.length - 1);
	});

	it("saves the dismissal, so a fresh store reads it back", async () => {
		const storage = memoryDismissedStorage();
		const store = createDismissedNewsStore({ storage });
		const feature = createNews({ apollo: freshApollo(), store });

		const before = await feature.list({ source: "network" });
		await feature.dismiss({ id: before[0]!.id });

		const reloaded = createDismissedNewsStore({ storage });
		await reloaded.getState().load();
		expect(reloaded.getState().dismissedIds).toEqual([before[0]!.id]);
	});

	it("rolls back and fails when the save fails", async () => {
		const store = createDismissedNewsStore({
			storage: {
				get: async () => null,
				set: async () => {
					throw new Error("disk full");
				},
			},
		});
		const feature = createNews({ apollo: freshApollo(), store });

		await expect(feature.dismiss({ id: "a1" })).rejects.toThrow("disk full");
		expect(store.getState().dismissedIds).toEqual([]);
	});
});
