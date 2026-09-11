import { ApolloProvider } from "@apollo/client/react";
import { NavigationContainer } from "@react-navigation/native";
import { useAgentBridge } from "agent-bridge";
import { StatusBar } from "expo-status-bar";

import { groups } from "./src/agent/groups";
import { apolloClient } from "./src/deps/apollo";
import { navigationRef } from "./src/navigation/ref";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
	useAgentBridge(groups);

	return (
		<ApolloProvider client={apolloClient}>
			<NavigationContainer ref={navigationRef}>
				<RootNavigator />
			</NavigationContainer>
			<StatusBar style="auto" />
		</ApolloProvider>
	);
}
