import { SchemaLink } from "@apollo/client/link/schema";
import { buildSchema } from "graphql";

/**
 * A stand-in for a real backend, so the example runs with nothing else installed.
 * Swap this link for `new HttpLink({ uri })` to point the app at a real API; no
 * other file changes.
 */
const schema = buildSchema(`
	type Todo {
		id: ID!
		title: String!
		done: Boolean!
	}
	type Article {
		id: ID!
		title: String!
		summary: String!
		publishedAt: String!
	}
	type Query {
		todos: [Todo!]!
		news: [Article!]!
	}
	type Mutation {
		addTodo(title: String!): Todo!
		addTodos(titles: [String!]!): [Todo!]!
		setTodoDone(id: ID!, done: Boolean!): Todo!
		removeTodo(id: ID!): ID!
		removeAllTodos: [ID!]!
	}
`);

type Row = { id: string; title: string; done: boolean };

let nextId = 3;
const rows: Row[] = [
	{ id: "1", title: "Wire up the bridge", done: true },
	{ id: "2", title: "Drive the app from the CLI", done: false },
];

type ArticleRow = { id: string; title: string; summary: string; publishedAt: string };

const articles: ArticleRow[] = [
	{
		id: "a1",
		title: "Metro ships a faster bundler",
		summary: "Cold starts drop by half in the latest release.",
		publishedAt: "2026-09-08T09:00:00.000Z",
	},
	{
		id: "a2",
		title: "React Navigation 8 released",
		summary: "Typed routes are now the default.",
		publishedAt: "2026-09-09T09:00:00.000Z",
	},
	{
		id: "a3",
		title: "Apollo Client adds cache.diagnose",
		summary: "A new dev-tool for spotting stale cache reads.",
		publishedAt: "2026-09-10T09:00:00.000Z",
	},
];

const find = (id: string): Row => {
	const row = rows.find((r) => r.id === id);
	if (!row) throw new Error(`no todo with id ${id}`);
	return row;
};

const root = {
	todos: () => rows.map((row) => ({ ...row })),

	news: () => articles.map((article) => ({ ...article })),

	addTodo: ({ title }: { title: string }) => {
		const row = { id: String(nextId++), title, done: false };
		rows.push(row);
		return { ...row };
	},

	addTodos: ({ titles }: { titles: string[] }) => {
		return titles.map((title) => {
			const row = { id: String(nextId++), title, done: false };
			rows.push(row);
			return { ...row };
		});
	},

	setTodoDone: ({ id, done }: { id: string; done: boolean }) => {
		const row = find(id);
		row.done = done;
		return { ...row };
	},

	removeTodo: ({ id }: { id: string }) => {
		rows.splice(rows.indexOf(find(id)), 1);
		return id;
	},

	removeAllTodos: () => {
		const ids = rows.map((row) => row.id);
		rows.length = 0;
		return ids;
	},
};

export const apiLink = new SchemaLink({ schema, rootValue: root });
