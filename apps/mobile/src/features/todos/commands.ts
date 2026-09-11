import type { ApolloClient } from "@apollo/client";
import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

import { addTodo, getTodos, removeTodo, setTodoDone } from "./api";

/**
 * A command validates its arguments, calls the operation function the screen
 * calls, and returns the result. No logic of its own.
 */
export const todosCommands = (client: ApolloClient) =>
	defineCommands("todos", {
		list: command({
			description:
				"Returns the todos. source=cache is what the screen shows right now, source=network is what the server has. Read cache first: a network read writes to the cache and hides a broken cache update.",
			args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
			run: ({ source }) => getTodos(client, source),
		}),

		add: command({
			description: "Adds a todo through the API and updates the cache the way the screen does.",
			args: z.object({ title: z.string().min(1) }),
			run: async ({ title }) => {
				await addTodo(client, title);
				return getTodos(client, "cache");
			},
		}),

		setDone: command({
			description: "Checks or unchecks one todo. Fails when the id does not exist.",
			args: z.object({ id: z.string().min(1), done: z.boolean() }),
			run: async ({ id, done }) => setTodoDone(client, id, done),
		}),

		remove: command({
			description: "Removes a todo and evicts it from the cache. Fails when the id does not exist.",
			args: z.object({ id: z.string().min(1) }),
			run: async ({ id }) => {
				await removeTodo(client, id);
				return getTodos(client, "cache");
			},
		}),
	});
