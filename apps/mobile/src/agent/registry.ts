import type { CommandGroup } from "agent-bridge";
import { navigationCommands, type NavigationRef } from "agent-bridge/react-navigation";

import { navigationRef } from "../navigation/ref";
import { demoCommands } from "./demo.commands";
import { RouteName } from "./routes";

/**
 * Defined at module scope. An array built inside a component is a new array on
 * every render, which reconnects the bridge each time.
 */
export const groups: CommandGroup[] = [
	demoCommands,
	navigationCommands(navigationRef as NavigationRef, { routes: RouteName }),
];
