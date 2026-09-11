export declare const GROUPS_SPECIFIER: "agent-bridge/groups";

export type WithAgentBridgeOptions = {
	/** Path to the module exporting `agentGroups`, relative to the project root. */
	groups: string;
	projectRoot?: string;
};

/**
 * Wraps a Metro config so `agent-bridge/groups` resolves to the app's command
 * groups in development, and to an empty module in a release bundle.
 */
export declare function withAgentBridge<T extends object>(
	config: T,
	options: WithAgentBridgeOptions,
): T;
