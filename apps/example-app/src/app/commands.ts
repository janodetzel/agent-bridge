import { apolloCommands } from "@janodetzel/app-commands/adapters/apollo";
import { buildRegistry } from "@janodetzel/app-commands";
import { zodCommands } from "@janodetzel/app-commands/adapters/zod";
import { featureCommands } from "@janodetzel/app-commands/adapters/feature-kit";
import {
	navigationCommands,
	type NavigationRef,
} from "@janodetzel/app-commands/adapters/react-navigation";

import { RouteName } from "../navigation/routes";
import { apolloClient, navigationRef, news, settings, todos } from "./instances";
import { z } from "zod";

/**
 * Everything the app-commands plugin can reach.
 *
 * The features carry their own namespaces and specs, so nothing is registered by
 * hand; `featureCommands` reads them. The adapters are the same shape - each
 * returns a slice of the registry - so a library the bridge knows about and a
 * feature the app wrote register identically.
 *
 * Built at module scope: a registry built during render would be a new object on
 * every frame, and the bridge would re-subscribe to each one.
 */
export const commandRegistry = buildRegistry(
	featureCommands(todos, news, settings),
	zodCommands("exampleCommand", {
		inout: {
			args: z.object({ arg: z.string() }),
			description: "A command that forwards its input",
			run: async ({ arg }) => ({ arg }),
		},
	}),
	apolloCommands(apolloClient),
	navigationCommands(navigationRef as NavigationRef, { routes: RouteName }),
);
