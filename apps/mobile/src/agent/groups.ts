import type { CommandGroup } from "agent-bridge";

const NONE: CommandGroup[] = [];

/**
 * The registry is loaded behind `__DEV__`, so a release bundle contains neither
 * the command code nor the descriptions. `useAgentBridge` is a no-op in
 * production, but a plain import would still pull the registry into the bundle.
 *
 * Module scope on purpose: the array identity has to stay stable across renders.
 */
export const groups: CommandGroup[] = __DEV__
	? (require("./registry") as typeof import("./registry")).groups
	: NONE;
