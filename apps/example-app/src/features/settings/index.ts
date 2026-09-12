import { defineFeature } from "@janodetzel/feature-kit";

import { settingsSpec } from "./spec";
import type { SettingsStore } from "./store";

export type SettingsDeps = { store: SettingsStore };

/**
 * Client state only, so the entry points are the store's actions. The store
 * rolls back and rethrows when the save fails, and that rethrow is what makes
 * the command fail.
 */
export const createSettings = (deps: SettingsDeps) =>
	defineFeature("settings", settingsSpec).create({
		async get() {
			const { units, notifications } = deps.store.getState();
			return { units, notifications };
		},

		async setUnits({ units }) {
			await deps.store.getState().setUnits(units);
			return deps.store.getState().units;
		},

		async setNotifications({ notifications }) {
			await deps.store.getState().setNotifications(notifications);
			return deps.store.getState().notifications;
		},
	});

export type Settings = ReturnType<typeof createSettings>;
