import type { ApolloClient } from "@apollo/client";
import { command } from "@janodetzel/app-commands";
import { z } from "zod";

import { addTodo, addManyTodos, getTodos, removeTodo, removeAllTodos, setTodoDone } from "./api";

export type TodosFeatureDeps = { apollo: ApolloClient };

/**
 * The feature methods are the commands. The screen calls `todos.add({ title })`
 * and so does the bridge, so there is one implementation and the agent verifies
 * the path a user takes.
 */
export const createTodosFeature = (deps: TodosFeatureDeps) => ({
	list: command()
		.input({ source: z.enum(["cache", "network"]).default("cache") })
		.description(
			"Returns the todos. source=cache is what the screen shows right now, source=network is what the server has. Read cache first: a network read writes to the cache and hides a broken cache update.",
		)
		.run(async ({ source }) => getTodos(deps.apollo, source)),

	add: command()
		.input({ title: z.string().min(1), description: z.string().optional() })
		.description(
			"Adds a todo through the API, updates the cache the way the screen does, and returns the todos from the cache. An omitted description is stored as an empty string; it is never null. Does not edit an existing todo: a repeated title adds a second one.",
		)
		.run(async ({ title, description }) => {
			await addTodo(deps.apollo, title, description);
			return getTodos(deps.apollo, "cache");
		}),

	addMany: command()
		.input({ todos: z.array(z.string().min(1)) })
		.description(
			"Adds many todos through the API, updates the cache the way the screen does, and returns the todos from the cache. Takes titles only; use add for a todo that needs a description.",
		)
		.run(async ({ todos }) => {
			await addManyTodos(deps.apollo, todos);
			return getTodos(deps.apollo, "cache");
		}),

	setDone: command()
		.input({ id: z.string().min(1), done: z.boolean() })
		.description(
			"Checks or unchecks one todo and returns it. Fails when the id does not exist. Setting done to the value it already has is a no-op the server still confirms.",
		)
		.run(async ({ id, done }) => setTodoDone(deps.apollo, id, done)),

	remove: command()
		.input({ id: z.string().min(1) })
		.description(
			"Removes a todo, evicts it from the cache, and returns the todos that are left. Fails when the id does not exist.",
		)
		.run(async ({ id }) => {
			await removeTodo(deps.apollo, id);
			return getTodos(deps.apollo, "cache");
		}),

	removeAll: command()
		.description("Removes all todos and clears the cache.")
		.run(async () => {
			await removeAllTodos(deps.apollo);
			return getTodos(deps.apollo, "cache");
		}),
});

export type TodosFeature = ReturnType<typeof createTodosFeature>;
