import type { Spec } from "@janodetzel/feature-kit";
import { z } from "zod";

export const settingsSpec = {
	get: {
		args: z.object({}),
		description:
			"Returns the saved settings: units and notifications. Picked field by field, because the store's state object also carries its actions and functions do not survive JSON.",
	},

	setUnits: {
		args: z.object({ units: z.enum(["km", "mi"]) }),
		description:
			"Sets the distance unit and saves it. Fails when the save fails, and the screen keeps the old value.",
	},

	setNotifications: {
		args: z.object({ notifications: z.boolean() }),
		description:
			"Turns notifications on or off and saves. Fails when the save fails, and the screen keeps the old value.",
	},
} as const satisfies Spec;
