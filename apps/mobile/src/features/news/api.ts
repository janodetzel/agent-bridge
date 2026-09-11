import type { ApolloClient } from "@apollo/client";
import { type Article, NEWS } from "./gql";
import { type DismissedNewsStore } from "./store";

export async function getNews(
	client: ApolloClient,
	source: "cache" | "network",
): Promise<Article[]> {
	const { data } = await client.query({
		query: NEWS,
		fetchPolicy: source === "cache" ? "cache-only" : "network-only",
	});
	return (data as { news?: Article[] } | null)?.news ?? [];
}

/**
 * Pure, and the single place "what's shown" is decided: no React, no Zustand,
 * so both the screen and the command combine server data and local dismissals
 * the same way.
 */
export function visibleArticles(articles: Article[], dismissedIds: ReadonlySet<string>): Article[] {
	return articles.filter((article) => !dismissedIds.has(article.id));
}

export async function getVisibleArticles(
	dismissedStore: DismissedNewsStore,
	client: ApolloClient,
	source: "cache" | "network" = "network",
) {
	const articles = await getNews(client, source);
	return visibleArticles(articles, new Set(dismissedStore.getState().dismissedIds));
}

export async function dismissArticle(dismissedStore: DismissedNewsStore, id: string) {
	await dismissedStore.getState().dismiss(id);
	return dismissedStore.getState().dismissedIds;
}

export async function getDismissedIds(dismissedStore: DismissedNewsStore) {
	return dismissedStore.getState().dismissedIds;
}
