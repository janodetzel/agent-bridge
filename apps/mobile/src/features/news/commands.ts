import type { ApolloClient } from "@apollo/client";
import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

import { dismissArticle, getDismissedIds, getVisibleArticles } from "./api";
import type { DismissedNewsStore } from "./store";

export const newsCommands = (client: ApolloClient, dismissedStore: DismissedNewsStore) =>
	defineCommands("news", {
		list: command({
			description:
				"Returns the articles that have not been dismissed. source=cache is what the screen shows right now, source=network is what the server has. Read cache first: a network read writes to the cache and hides a broken cache update.",
			args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
			run: ({ source }) => getVisibleArticles(dismissedStore, client, source)
		}),

		dismiss: command({
			description:
				"Dismisses one article locally, so it drops out of news.list. Fails when the save fails.",
			args: z.object({ id: z.string().min(1) }),
			run: ({ id }) => dismissArticle(dismissedStore, id)
		}),

		dismissed: command({
			description: "Returns the ids dismissed so far.",
			args: z.object({}),
			run: () => getDismissedIds(dismissedStore),
		}),
	});
