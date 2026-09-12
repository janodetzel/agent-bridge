import { createStore } from "zustand/vanilla";

export type SettingsState = { units: "km" | "mi"; notifications: boolean };

export type SettingsActions = {
	load(): Promise<void>;
	setUnits(units: SettingsState["units"]): Promise<void>;
	setNotifications(notifications: boolean): Promise<void>;
};

export type SettingsDeps = {
	storage: {
		get(): Promise<SettingsState | null>;
		set(settings: SettingsState): Promise<void>;
	};
};

/**
 * A factory, so a test can pass in-memory storage. This is all that is left of
 * dependency injection, and it is enough: `createSettingsStore({ storage: memory })`.
 */
export const createSettingsStore = (deps: SettingsDeps) =>
	createStore<SettingsState & SettingsActions>()((set, get) => ({
		units: "km",
		notifications: true,

		async load() {
			const saved = await deps.storage.get();
			if (saved) set(saved);
		},

		async setUnits(units) {
			await update(set, get, deps, { units });
		},

		async setNotifications(notifications) {
			await update(set, get, deps, { notifications });
		},
	}));

export type SettingsStore = ReturnType<typeof createSettingsStore>;

/**
 * Updates first so the screen reacts immediately, then saves. On failure it rolls
 * back and rethrows, and the rethrow is what makes the command fail.
 */
async function update(
	set: (partial: Partial<SettingsState>) => void,
	get: () => SettingsState,
	deps: SettingsDeps,
	change: Partial<SettingsState>,
): Promise<void> {
	const { units, notifications } = get();
	set(change);
	try {
		const { units: nextUnits, notifications: nextNotifications } = get();
		await deps.storage.set({ units: nextUnits, notifications: nextNotifications });
	} catch (e) {
		set({ units, notifications });
		throw e;
	}
}
