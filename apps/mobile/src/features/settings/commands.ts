import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

import type { SettingsStore } from "./store";

export const settingsCommands = (store: SettingsStore) =>
	defineCommands("settings", {
		get: command({
			description: "Returns the current settings.",
			// Picked field by field: the state object also holds the actions, and
			// functions do not survive JSON.
			args: z.object({}),
			run: async () => {
				const { units, notifications } = store.getState();
				return { units, notifications };
			},
		}),

		setUnits: command({
			description: "Sets the distance unit and saves it. Fails when the save fails.",
			args: z.object({ units: z.enum(["km", "mi"]) }),
			run: async ({ units }) => {
				await store.getState().setUnits(units);
				return store.getState().units;
			},
		}),

		setNotifications: command({
			description: "Turns notifications on or off and saves. Fails when the save fails.",
			args: z.object({ notifications: z.boolean() }),
			run: async ({ notifications }) => {
				await store.getState().setNotifications(notifications);
				return store.getState().notifications;
			},
		}),
	});
