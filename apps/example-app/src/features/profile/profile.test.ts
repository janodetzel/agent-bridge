import { command, featureCommands } from "@janodetzel/app-commands";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createProfileFeature } from ".";

/**
 * Settings are a stand-in built with `command()`, because a feature never
 * imports another, not even in a test. The stand-in is enough to show both
 * halves: the nested commands are registered, and `reset` calls through them.
 */
const fakeSettings = () => {
	let state = { units: "mi" as "km" | "mi", notifications: false };
	return {
		get: command()
			.description("Returns the fake settings.")
			.run(async () => state),
		setUnits: command()
			.input({ units: z.enum(["km", "mi"]) })
			.description("Sets the fake units.")
			.run(async ({ units }) => {
				state = { ...state, units };
				return units;
			}),
		setNotifications: command()
			.input({ notifications: z.boolean() })
			.description("Sets the fake notifications.")
			.run(async ({ notifications }) => {
				state = { ...state, notifications };
				return notifications;
			}),
	};
};

describe("the profile feature", () => {
	it("nests the settings commands under its own namespace", () => {
		const registry = featureCommands({
			profile: createProfileFeature({ settingsFeature: fakeSettings() }),
		});

		expect(Object.keys(registry).sort()).toEqual([
			"profile.reset",
			"profile.settings.get",
			"profile.settings.setNotifications",
			"profile.settings.setUnits",
		]);
	});

	it("resets through the nested settings, and returns them", async () => {
		const profile = createProfileFeature({ settingsFeature: fakeSettings() });

		expect(await profile.reset()).toEqual({ units: "km", notifications: true });
		expect(await profile.settings.get()).toEqual({ units: "km", notifications: true });
	});
});
