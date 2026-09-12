export type { BridgeClient } from "./attach";

/**
 * A no-op in production. The transport accepts any valid command from anything
 * that can reach Metro, so the hook and the request handler must not exist in a
 * release build - the lazy `require` sits in a branch the bundler folds away,
 * which is what drops them.
 */
export let useAppCommands: typeof import("./useAppCommands").useAppCommands;

// @ts-ignore process.env.NODE_ENV is defined by metro transform plugins
if (process.env.NODE_ENV !== "production") {
	useAppCommands = require("./useAppCommands").useAppCommands;
} else {
	useAppCommands = () => {};
}
