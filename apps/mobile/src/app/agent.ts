import { navigationCommands, type NavigationRef } from "agent-bridge/react-navigation";

import { newsCommands } from "../features/news/commands";
import { settingsCommands } from "../features/settings/commands";
import { todosCommands } from "../features/todos/commands";
import { RouteName } from "../navigation/routes";
import { apolloClient, dismissedNewsStore, navigationRef, settingsStore } from "./instances";
import { apolloCommands } from "agent-bridge/apollo";

export const agentGroups = [
	todosCommands(apolloClient),
	newsCommands(apolloClient, dismissedNewsStore),
	settingsCommands(settingsStore),
	apolloCommands(apolloClient),
	navigationCommands(navigationRef as NavigationRef, { routes: RouteName }),
];
