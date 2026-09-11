import { Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useStore } from "zustand";

import { settingsStore } from "../../app/instances";
import { setNotifications, setUnits } from "./api";

export function SettingsScreen() {
	// The screen reads the same store instance a command writes through.
	const units = useStore(settingsStore, (s) => s.units);
	const notifications = useStore(settingsStore, (s) => s.notifications);

	return (
		<View style={styles.screen}>
			<Text style={styles.label}>Distance</Text>
			<View style={styles.choices}>
				{(["km", "mi"] as const).map((option) => (
					<Pressable
						key={option}
						onPress={() => void setUnits(settingsStore, option)}
						style={[styles.choice, units === option && styles.choiceSelected]}
					>
						<Text style={[styles.choiceLabel, units === option && styles.choiceLabelSelected]}>
							{option}
						</Text>
					</Pressable>
				))}
			</View>

			<View style={styles.row}>
				<Text style={styles.label}>Notifications</Text>
				<Switch
					value={notifications}
					onValueChange={(value) => void setNotifications(settingsStore, value)}
				/>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	screen: { flex: 1, padding: 16, gap: 16 },
	label: { fontSize: 16 },
	choices: { flexDirection: "row", gap: 8 },
	choice: {
		paddingVertical: 8,
		paddingHorizontal: 20,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: "#d0d5dd",
	},
	choiceSelected: { backgroundColor: "#2f6feb", borderColor: "#2f6feb" },
	choiceLabel: { fontSize: 16 },
	choiceLabelSelected: { color: "#ffffff", fontWeight: "600" },
	row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
