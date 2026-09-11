export type { Command, CommandGroup, Registry } from "./core/command";
export type { HandleOptions } from "./core/handle";

export let useAgentBridge: typeof import("./app/useAgentBridge").useAgentBridge;

// @ts-ignore process.env.NODE_ENV is defined by metro transform plugins
if (process.env.NODE_ENV !== "production") {
	useAgentBridge = require("./app/useAgentBridge").useAgentBridge;
} else {
	useAgentBridge = () => {};
}
