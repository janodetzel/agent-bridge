import { apolloCommands } from "agent-bridge/apollo";
import { buildRegistry } from "agent-bridge/core";
import { featureCommands } from "agent-bridge/feature-kit";
import { navigationCommands, type NavigationRef } from "agent-bridge/react-navigation";

import { RouteName } from "../navigation/routes";
import { apolloClient, navigationRef, news, settings, todos } from "./instances";

/**
 * Everything the agent-bridge plugin can reach.
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
	apolloCommands(apolloClient),
	navigationCommands(navigationRef as NavigationRef, { routes: RouteName }),
);
