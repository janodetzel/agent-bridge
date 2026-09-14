import { createStore } from "zustand/vanilla";

export type SettingsState = { units: "km" | "mi"; notifications: boolean };

export type SettingsStoreActions = {
	load(): Promise<void>;
	setUnits(units: SettingsState["units"]): Promise<void>;
	setNotifications(notifications: boolean): Promise<void>;
};

export type SettingsStoreDeps = {
	storage: {
		get(): Promise<SettingsState | null>;
		set(settings: SettingsState): Promise<void>;
	};
};

/**
 * A factory, so a test can pass in-memory storage. This is all that is left of
 * dependency injection, and it is enough: `createSettingsStore({ storage: memory })`.
 */
export const createSettingsStore = (deps: SettingsStoreDeps) =>
	createStore<SettingsState & SettingsStoreActions>()((set, get) => ({
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
	deps: SettingsStoreDeps,
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

/** What the screen subscribes to. Commands read `getState()` and pick the same fields. */
export const settingsStoreSelectors = {
	/**
	 * The settings without the store's actions, which do not survive JSON. Builds a
	 * new object on every call, so it is for commands: passed to `useStore` it
	 * would re-render forever.
	 */
	all: ({ units, notifications }: SettingsState): SettingsState => ({ units, notifications }),
	units: (s: SettingsState) => s.units,
	notifications: (s: SettingsState) => s.notifications,
};
