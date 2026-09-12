import type { Spec } from "@janodetzel/feature-kit";
import { z } from "zod";

export const newsSpec = {
	list: {
		args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
		description:
			"Returns the articles that have not been dismissed. source=cache is what the screen shows right now, source=network is what the server has. Read cache first: a network read writes to the cache and hides a broken cache update.",
	},

	dismiss: {
		args: z.object({ id: z.string().min(1) }),
		description:
			"Dismisses one article locally, so it drops out of news.list, and returns every dismissed id. Dismissing an already dismissed article is a no-op. The server never hears about it. Fails when the save fails.",
	},

	dismissed: {
		args: z.object({}),
		description:
			"Returns the ids dismissed so far, including ids of articles the server no longer serves.",
	},
} as const satisfies Spec;
