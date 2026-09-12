import type { ApolloClient } from "@apollo/client";
import { defineFeature } from "@janodetzel/feature-kit";

import { getNews, visibleArticles } from "./api";
import { newsSpec } from "./spec";
import type { DismissedNewsStore } from "./store";

export type NewsDeps = { apollo: ApolloClient; store: DismissedNewsStore };

/**
 * Server data from the Apollo cache, local dismissals from a store, combined by
 * `visibleArticles`. The screen combines them with the same function, so
 * `news.list` and the list a reader sees cannot disagree.
 */
export const createNews = (deps: NewsDeps) =>
	defineFeature("news", newsSpec).create({
		async list({ source }) {
			const articles = await getNews(deps.apollo, source);
			return visibleArticles(articles, new Set(deps.store.getState().dismissedIds));
		},

		async dismiss({ id }) {
			await deps.store.getState().dismiss(id);
			return deps.store.getState().dismissedIds;
		},

		async dismissed() {
			return deps.store.getState().dismissedIds;
		},
	});

export type News = ReturnType<typeof createNews>;
