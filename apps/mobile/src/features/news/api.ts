import type { ApolloClient } from "@apollo/client";
import { gql } from "@apollo/client";

export type Article = {
	__typename: "Article";
	id: string;
	title: string;
	summary: string;
	publishedAt: string;
};

export const NEWS = gql`
	query News {
		news {
			id
			title
			summary
			publishedAt
		}
	}
`;

export async function getNews(client: ApolloClient, source: "cache" | "network"): Promise<Article[]> {
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
