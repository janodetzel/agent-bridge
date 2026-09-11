import { type SettingsState, type SettingsStore } from "./store";

export async function getSettings(store: SettingsStore) {
	const { units, notifications } = store.getState();
	return { units, notifications };
}
export async function setUnits(store: SettingsStore, units: SettingsState["units"]) {
	await store.getState().setUnits(units);
	return store.getState().units;
}
export async function setNotifications(
	store: SettingsStore,
	notifications: SettingsState["notifications"],
) {
	await store.getState().setNotifications(notifications);
	return store.getState().notifications;
}
