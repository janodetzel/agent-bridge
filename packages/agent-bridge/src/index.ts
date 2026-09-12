export type { Command, ParseResult, Registry } from "./core/command";
export type { HandleOptions } from "./core/handle";

/**
 * A no-op in production. The bridge accepts any valid command from anything that
 * can reach Metro, so the hook and the request handler must not exist in a release
 * build - the lazy `require` sits in a branch the bundler folds away, which is what
 * drops them.
 */
export let useAgentBridge: typeof import("./app/useAgentBridge").useAgentBridge;

// @ts-ignore process.env.NODE_ENV is defined by metro transform plugins
if (process.env.NODE_ENV !== "production") {
	useAgentBridge = require("./app/useAgentBridge").useAgentBridge;
} else {
	useAgentBridge = () => {};
}
