import { StyleSheet, Text, View } from "react-native";

export function SettingsScreen() {
	return (
		<View style={styles.container}>
			<Text style={styles.title}>Settings</Text>
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
	title: { fontSize: 24, fontWeight: "600" },
});
