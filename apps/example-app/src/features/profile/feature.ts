import { command } from "@janodetzel/app-commands";
import { type SettingsFeature } from "./settings";

export type ProfileFeatureDeps<S extends SettingsFeature> = { settingsFeature: S };

/**
 * A feature composed of another. `settings` is nested as it is, so its commands
 * are reachable as `profile.settings.get` and so on, and `reset` builds on them.
 * The nesting is nothing but an object key: `featureCommands` adds the segment.
 *
 * Generic over the settings it is given, so `profileFeature.settings` keeps the
 * full type of the settings feature rather than narrowing to the port.
 */
export const createProfileFeature = <S extends SettingsFeature>(deps: ProfileFeatureDeps<S>) => ({
	settings: deps.settingsFeature,

	reset: command()
		.description(
			"Puts units back to km and turns notifications on, through the nested settings commands, and returns the settings. Saves twice: when the second save fails, units stay reset and the command fails.",
		)
		.run(async () => {
			await deps.settingsFeature.setUnits({ units: "km" });
			await deps.settingsFeature.setNotifications({ notifications: true });
			return deps.settingsFeature.get();
		}),
});

export type ProfileFeature = ReturnType<typeof createProfileFeature>;
