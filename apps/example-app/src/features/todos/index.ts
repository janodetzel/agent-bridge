import type { ApolloClient } from "@apollo/client";
import { defineFeature } from "feature-kit";

import { addTodo, addManyTodos, getTodos, removeTodo, removeAllTodos, setTodoDone } from "./api";
import { todosSpec } from "./spec";

export type TodosDeps = { apollo: ApolloClient };

/**
 * The feature methods are the commands. The screen calls `todos.add({ title })`
 * and so does the bridge, so there is one implementation and the agent verifies
 * the path a user takes.
 */
export const createTodos = (deps: TodosDeps) =>
	defineFeature("todos", todosSpec).create({
		async list({ source }) {
			return getTodos(deps.apollo, source);
		},

		async add({ title }) {
			await addTodo(deps.apollo, title);
			return getTodos(deps.apollo, "cache");
		},

		async addMany({ todos }) {
			await addManyTodos(deps.apollo, todos);
			return getTodos(deps.apollo, "cache");
		},

		async setDone({ id, done }) {
			return setTodoDone(deps.apollo, id, done);
		},

		async remove({ id }) {
			await removeTodo(deps.apollo, id);
			return getTodos(deps.apollo, "cache");
		},

		async removeAll() {
			await removeAllTodos(deps.apollo);
			return getTodos(deps.apollo, "cache");
		},
	});

export type Todos = ReturnType<typeof createTodos>;
