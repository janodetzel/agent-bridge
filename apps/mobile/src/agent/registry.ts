import type { CommandGroup } from "agent-bridge";

import { demoCommands } from "./demo.commands";

/**
 * Defined at module scope. An array built inside a component is a new array on
 * every render, which reconnects the bridge each time.
 */
export const groups: CommandGroup[] = [demoCommands];
