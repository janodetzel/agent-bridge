import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

import { getSettings, setNotifications, setUnits } from "./api";
import type { SettingsStore } from "./store";

export const settingsCommands = (store: SettingsStore) =>
	defineCommands("settings", {
		get: command({
			description: "Returns the current settings.",
			// Picked field by field: the state object also holds the actions, and
			// functions do not survive JSON.
			args: z.object({}),
			run: () => getSettings(store),
		}),

		setUnits: command({
			description: "Sets the distance unit and saves it. Fails when the save fails.",
			args: z.object({ units: z.enum(["km", "mi"]) }),
			run: ({ units }) => setUnits(store, units),
		}),

		setNotifications: command({
			description: "Turns notifications on or off and saves. Fails when the save fails.",
			args: z.object({ notifications: z.boolean() }),
			run: ({ notifications }) => setNotifications(store, notifications),
		}),
	});
