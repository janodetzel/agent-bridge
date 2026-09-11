import type { CommandGroup } from "./core/command";

/**
 * The command groups an app registers, resolved at bundle time.
 *
 * This file is the fallback. When `metro.config.js` wraps its config with
 * `withAgentBridge`, Metro resolves `agent-bridge/groups` to the app's own groups
 * module in a development bundle, and back to this empty one in a release bundle -
 * which is what keeps the commands and their descriptions out of a release binary.
 *
 * An app that imports this without configuring Metro gets no commands, and a
 * warning saying so.
 */
export const agentGroups: CommandGroup[] = [];

// Declared locally: the bundler defines it, and this file is also imported by
// tooling outside a bundle, where it is simply absent.
declare const __DEV__: boolean | undefined;

if (typeof __DEV__ === "undefined" || __DEV__) {
	console.warn(
		"[agent-bridge] agent-bridge/groups resolved to the empty fallback, so no commands are " +
			"registered. Wrap your Metro config with withAgentBridge from agent-bridge/metro.",
	);
}
