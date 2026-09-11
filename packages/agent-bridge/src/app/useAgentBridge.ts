import { useDevToolsPluginClient } from "expo/devtools";
import { useEffect, useMemo } from "react";

import { buildRegistry } from "../core/command";
import { agentGroups } from "../groups";
import type { HandleOptions } from "../core/handle";
import { PLUGIN_NAME } from "../core/protocol";
import { attachAgentBridge } from "./attach";

/**
 * Connects the app's command groups to the Metro dev tools channel. Call it once,
 * in the root component.
 *
 * The groups come from the package's own groups module, which `withAgentBridge` in
 * `metro.config.js` replaces with the app's module in a development bundle. Nothing
 * is passed in, so nothing can be passed in wrongly - an array built during render
 * used to reconnect the bridge on every frame.
 */
export function useAgentBridge(opts?: HandleOptions): void {
	const client = useDevToolsPluginClient(PLUGIN_NAME);
	const registry = useMemo(() => buildRegistry(agentGroups), []);
	const defaultTimeoutMs = opts?.defaultTimeoutMs;

	useEffect(() => {
		if (!client) return;
		return attachAgentBridge(client, registry, { defaultTimeoutMs });
	}, [client, registry, defaultTimeoutMs]);
}
