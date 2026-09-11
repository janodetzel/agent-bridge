import { ApolloProvider } from "@apollo/client/react";
import { NavigationContainer } from "@react-navigation/native";
import { useAgentBridge, type CommandGroup } from "agent-bridge";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { RootNavigator } from "../navigation/RootNavigator";
import { apolloClient, dismissedNewsStore, navigationRef, settingsStore } from "./instances";

/**
 * Loaded behind `__DEV__`, so a release build carries neither the commands nor
 * their descriptions. `useAgentBridge` is already a no-op in production, but a
 * plain import of ./agent would still pull every command into the bundle.
 *
 * Module scope, so the array identity stays stable across renders.
 */
const agentGroups: CommandGroup[] = __DEV__
	? (require("./agent") as typeof import("./agent")).agentGroups
	: [];

export default function App() {
	useAgentBridge(agentGroups);

	useEffect(() => {
		void settingsStore.getState().load();
		void dismissedNewsStore.getState().load();
	}, []);

	return (
		<ApolloProvider client={apolloClient}>
			<NavigationContainer ref={navigationRef}>
				<RootNavigator />
			</NavigationContainer>
			<StatusBar style="auto" />
		</ApolloProvider>
	);
}
