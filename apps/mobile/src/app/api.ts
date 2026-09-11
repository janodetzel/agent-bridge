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
	type Query {
		todos: [Todo!]!
	}
	type Mutation {
		addTodo(title: String!): Todo!
		setTodoDone(id: ID!, done: Boolean!): Todo!
		removeTodo(id: ID!): ID!
	}
`);

type Row = { id: string; title: string; done: boolean };

let nextId = 3;
const rows: Row[] = [
	{ id: "1", title: "Wire up the bridge", done: true },
	{ id: "2", title: "Drive the app from the CLI", done: false },
];

const find = (id: string): Row => {
	const row = rows.find((r) => r.id === id);
	if (!row) throw new Error(`no todo with id ${id}`);
	return row;
};

const root = {
	todos: () => rows.map((row) => ({ ...row })),

	addTodo: ({ title }: { title: string }) => {
		const row = { id: String(nextId++), title, done: false };
		rows.push(row);
		return { ...row };
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
};

export const apiLink = new SchemaLink({ schema, rootValue: root });
