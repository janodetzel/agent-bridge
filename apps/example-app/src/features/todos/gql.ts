import { gql } from "@apollo/client";

export type Todo = {
	__typename: "Todo";
	id: string;
	title: string;
	/** Empty when the todo has none; the field is never null. */
	description: string;
	done: boolean;
};

export const TODO_FIELDS = gql`
	fragment TodoFields on Todo {
		id
		title
		description
		done
	}
`;

export const TODOS = gql`
	query Todos {
		todos {
			...TodoFields
		}
	}
	${TODO_FIELDS}
`;

export const ADD_TODO = gql`
	mutation AddTodo($title: String!, $description: String) {
		addTodo(title: $title, description: $description) {
			...TodoFields
		}
	}
	${TODO_FIELDS}
`;

export const SET_TODO_DONE = gql`
	mutation SetTodoDone($id: ID!, $done: Boolean!) {
		setTodoDone(id: $id, done: $done) {
			...TodoFields
		}
	}
	${TODO_FIELDS}
`;

export const ADD_TODOS = gql`
	mutation AddTodos($titles: [String!]!) {
		addTodos(titles: $titles) {
			...TodoFields
		}
	}
	${TODO_FIELDS}
`;

export const REMOVE_TODO = gql`
	mutation RemoveTodo($id: ID!) {
		removeTodo(id: $id)
	}
`;

export const REMOVE_ALL_TODOS = gql`
	mutation RemoveAllTodos {
		removeAllTodos
	}
`;
