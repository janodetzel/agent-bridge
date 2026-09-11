import type { ApolloClient } from "@apollo/client";
import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

import { getNews, visibleArticles } from "./api";
import type { DismissedNewsStore } from "./store";

export const newsCommands = (client: ApolloClient, dismissed: DismissedNewsStore) =>
	defineCommands("news", {
		list: command({
			description:
				"Returns the articles that have not been dismissed. source=cache is what the screen shows right now, source=network is what the server has. Read cache first: a network read writes to the cache and hides a broken cache update.",
			args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
			run: async ({ source }) => {
				const articles = await getNews(client, source);
				return visibleArticles(articles, new Set(dismissed.getState().dismissedIds));
			},
		}),

		dismiss: command({
			description:
				"Dismisses one article locally, so it drops out of news.list. Fails when the save fails.",
			args: z.object({ id: z.string().min(1) }),
			run: async ({ id }) => {
				await dismissed.getState().dismiss(id);
				return dismissed.getState().dismissedIds;
			},
		}),

		dismissed: command({
			description: "Returns the ids dismissed so far.",
			args: z.object({}),
			run: async () => dismissed.getState().dismissedIds,
		}),
	});
