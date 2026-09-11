import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Button } from "react-native";

import { SettingsScreen } from "../features/settings/SettingsScreen";
import { TodosScreen } from "../features/todos/TodosScreen";
import { navigationRef } from "../app/instances";
import type { RootStackParamList } from "./routes";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
	return (
		<Stack.Navigator>
			<Stack.Screen
				name="Home"
				component={TodosScreen}
				options={{
					title: "Todos",
					headerRight: () => (
						<Button title="Settings" onPress={() => navigationRef.navigate("Settings")} />
					),
				}}
			/>
			<Stack.Screen name="Settings" component={SettingsScreen} />
		</Stack.Navigator>
	);
}
