import type { ApolloClient } from "@apollo/client";
import { command } from "@janodetzel/app-commands";
import { z } from "zod";

import { getNews, visibleArticles } from "./api";
import { type Article } from "./gql";
import type { DismissedNewsStore } from "./store";

export type NewsFeatureDeps = { apollo: ApolloClient; store: DismissedNewsStore };

/**
 * Server data from the Apollo cache, local dismissals from a store, combined by
 * `visibleArticles`. The screen combines them with the same function, so
 * `news.list` and the list a reader sees cannot disagree.
 */
export const createNewsFeature = (deps: NewsFeatureDeps) => ({
	list: command()
		.input({ source: z.enum(["cache", "network"]).default("cache") })
		.description(
			"Returns the articles that have not been dismissed. source=cache is what the screen shows right now, source=network is what the server has. Read cache first: a network read writes to the cache and hides a broken cache update.",
		)
		.run(async ({ source }) => {
			const articles = await getNews(deps.apollo, source);
			return visibleArticles(articles, new Set(deps.store.getState().dismissedIds));
		}),

	dismiss: command()
		.input({ id: z.string().min(1) })
		.description(
			"Dismisses one article locally, so it drops out of news.list, and returns every dismissed id. Dismissing an already dismissed article is a no-op. The server never hears about it. Fails when the save fails.",
		)
		.run(async ({ id }) => {
			await deps.store.getState().dismiss(id);
			return deps.store.getState().dismissedIds;
		}),

	dismissed: command()
		.description(
			"Returns the ids dismissed so far, including ids of articles the server no longer serves.",
		)
		.run(async () => deps.store.getState().dismissedIds),

	visibleArticles: (articles: Article[], dismissedIds: Array<string>) => {
		return visibleArticles(articles, new Set(dismissedIds));
	},
});

export type NewsFeature = ReturnType<typeof createNewsFeature>;
