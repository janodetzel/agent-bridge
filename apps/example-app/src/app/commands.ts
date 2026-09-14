import { apolloCommands } from "@janodetzel/app-commands/adapters/apollo";
import { buildRegistry, command, featureCommands } from "@janodetzel/app-commands";
import {
	navigationCommands,
	type NavigationRef,
} from "@janodetzel/app-commands/adapters/react-navigation";

import { RouteName } from "../navigation/routes";
import {
	apolloClient,
	navigationRef,
	newsFeature,
	profileFeature,
	todosFeature,
} from "./instances";
import { z } from "zod";

/**
 * Everything the app-commands plugin can reach.
 *
 * The keys are the namespaces: `featureCommands` names every command by its path
 * in this object, so `todos.add` is `todosFeature.add`, and a feature nested in
 * another adds a segment. The adapters are the same shape - each returns a slice
 * of the registry - so a library the bridge knows about and a feature the app
 * wrote register identically.
 *
 * Built at module scope: a registry built during render would be a new object on
 * every frame, and the bridge would re-subscribe to each one.
 */
export const commandRegistry = buildRegistry(
	featureCommands({
		todosFeature,
		newsFeature,
		// Nested: settings is registered through profile, as profileFeature.settings.*,
		// so it is not registered a second time on its own.
		profileFeature,
		exampleCommand: {
			inout: command()
				.input(z.object({ arg: z.string() }))
				.description("A command that forwards its input")
				.run(async ({ arg }) => ({ arg })),
		},
	}),
	apolloCommands(apolloClient),
	navigationCommands(navigationRef as NavigationRef, { routes: RouteName }),
);
