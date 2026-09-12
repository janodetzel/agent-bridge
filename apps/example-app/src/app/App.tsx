import { ApolloProvider } from "@apollo/client/react";
import { NavigationContainer } from "@react-navigation/native";
import { useAppCommands } from "@janodetzel/app-commands/expo";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";

import { RootNavigator } from "../navigation/RootNavigator";
import { commandRegistry } from "./commands";
import { apolloClient, dismissedNewsStore, navigationRef, settingsStore } from "./instances";

export default function App() {
	useAppCommands(commandRegistry);

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
