import { ApolloClient, HttpLink, InMemoryCache } from "@apollo/client";

/**
 * A module singleton, not a `useMemo` inside a component. A command runs outside
 * React and must reach the very cache the screens read from.
 */
export const apolloClient = new ApolloClient({
	link: new HttpLink({
		uri: process.env.EXPO_PUBLIC_GRAPHQL_URL ?? "http://localhost:4000/graphql",
	}),
	cache: new InMemoryCache(),
});
