import type { ApolloClient } from "@apollo/client";
import { z } from "zod";

import type { Registry } from "../core/command";
import { zodCommands } from "./zod";

export type ApolloCommandsOptions = { namespace?: string };

/**
 * Read-only access to the cache the UI reads from. Mutations belong to whoever
 * owns the data, whose methods the UI calls too.
 */
export function apolloCommands(client: ApolloClient, opts: ApolloCommandsOptions = {}): Registry {
	return zodCommands(opts.namespace ?? "apollo", {
		cache: {
			args: z.object({ prefix: z.string().min(1) }),
			description:
				"Returns the normalized cache entries whose key starts with the prefix, for example 'Favorite:'. The prefix is required: a full dump of a real app is megabytes.",
			run: async ({ prefix }) => {
				// `extract` is generic over the cache's serialized shape; InMemoryCache
				// normalizes to an object keyed by cache id.
				const entries = client.cache.extract() as Record<string, unknown>;
				return Object.fromEntries(
					Object.entries(entries).filter(([key]) => key.startsWith(prefix)),
				);
			},
		},

		refetch: {
			args: z.object({ operations: z.array(z.string().min(1)).min(1) }),
			description:
				"Refetches the named active queries and returns the operation names that ran. A query that is not mounted anywhere does not run.",
			run: async ({ operations }) => {
				// The returned object is a promise that also carries the queries it
				// touched, which is where the names are.
				const refetch = client.refetchQueries({ include: operations });
				const names = refetch.queries.map((query) => query.queryName).filter(Boolean);
				await refetch;
				return names;
			},
		},
	});
}
