import { Button, StyleSheet, Text, View } from "react-native";

import { navigationRef } from "../navigation/ref";

export function HomeScreen() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Home</Text>
			<Text style={styles.hint}>An agent can drive this screen from the CLI while Metro runs.</Text>
			<Button title="Settings" onPress={() => navigationRef.navigate("Settings")} />
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
	title: { fontSize: 24, fontWeight: "600" },
	hint: { color: "#666", textAlign: "center" },
});
