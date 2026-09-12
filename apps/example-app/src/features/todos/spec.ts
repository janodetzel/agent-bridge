import type { Spec } from "feature-kit";
import { z } from "zod";

/**
 * The commands this feature has, their arguments, and what the agent is told
 * about them. The handlers in `index.ts` are typed from this, so a schema and
 * its implementation cannot drift.
 *
 * Descriptions are part of the API, not documentation: say what the command
 * does not do, so the agent does not have to guess.
 */
export const todosSpec = {
	list: {
		args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
		description:
			"Returns the todos. source=cache is what the screen shows right now, source=network is what the server has. Read cache first: a network read writes to the cache and hides a broken cache update.",
	},

	add: {
		args: z.object({ title: z.string().min(1), description: z.string().optional() }),
		description:
			"Adds a todo through the API, updates the cache the way the screen does, and returns the todos from the cache. An omitted description is stored as an empty string; it is never null. Does not edit an existing todo: a repeated title adds a second one.",
	},

	addMany: {
		args: z.object({ todos: z.array(z.string().min(1)) }),
		description:
			"Adds many todos through the API, updates the cache the way the screen does, and returns the todos from the cache. Takes titles only; use add for a todo that needs a description.",
	},

	setDone: {
		args: z.object({ id: z.string().min(1), done: z.boolean() }),
		description:
			"Checks or unchecks one todo and returns it. Fails when the id does not exist. Setting done to the value it already has is a no-op the server still confirms.",
	},

	remove: {
		args: z.object({ id: z.string().min(1) }),
		description:
			"Removes a todo, evicts it from the cache, and returns the todos that are left. Fails when the id does not exist.",
	},

	removeAll: {
		args: z.object({}),
		description: "Removes all todos and clears the cache.",
	},
} as const satisfies Spec;
