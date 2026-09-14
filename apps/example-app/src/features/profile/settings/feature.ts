import { command } from "@janodetzel/app-commands";
import { z } from "zod";

import { settingsStoreSelectors, type SettingsStore } from "./store";

export type SettingsFeatureDeps = { store: SettingsStore };

/**
 * Client state only, so the entry points are the store's actions. The store
 * rolls back and rethrows when the save fails, and that rethrow is what makes
 * the command fail.
 */
export const createSettingsFeature = (deps: SettingsFeatureDeps) => ({
	get: command()
		.description(
			"Returns the saved settings: units and notifications. Picked field by field, because the store's state object also carries its actions and functions do not survive JSON.",
		)
		.run(async () => {
			return settingsStoreSelectors.all(deps.store.getState());
		}),

	setUnits: command()
		.input({ units: z.enum(["km", "mi"]) })
		.description(
			"Sets the distance unit and saves it. Fails when the save fails, and the screen keeps the old value.",
		)
		.run(async ({ units }) => {
			await deps.store.getState().setUnits(units);
			return deps.store.getState().units;
		}),

	setNotifications: command()
		.input({ notifications: z.boolean() })
		.description(
			"Turns notifications on or off and saves. Fails when the save fails, and the screen keeps the old value.",
		)
		.run(async ({ notifications }) => {
			await deps.store.getState().setNotifications(notifications);
			return deps.store.getState().notifications;
		}),
});

export type SettingsFeature = ReturnType<typeof createSettingsFeature>;
