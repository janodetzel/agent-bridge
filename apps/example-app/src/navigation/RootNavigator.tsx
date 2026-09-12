import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Button, View } from "react-native";

import { NewsScreen } from "../features/news/NewsScreen";
import { AddTodoScreen } from "../features/todos/AddTodoScreen";
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
						<View style={{ flexDirection: "row", gap: 8 }}>
							<Button title="New" onPress={() => navigationRef.navigate("AddTodo")} />
							<Button title="News" onPress={() => navigationRef.navigate("News")} />
							<Button title="Settings" onPress={() => navigationRef.navigate("Settings")} />
						</View>
					),
				}}
			/>
			<Stack.Screen
				name="AddTodo"
				component={AddTodoScreen}
				options={{ title: "New todo", presentation: "modal" }}
			/>
			<Stack.Screen name="Settings" component={SettingsScreen} />
			<Stack.Screen name="News" component={NewsScreen} options={{ title: "News" }} />
		</Stack.Navigator>
	);
}
