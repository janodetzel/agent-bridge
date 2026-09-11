import { useDevToolsPluginClient } from "expo/devtools";
import { useEffect, useMemo, useRef } from "react";

import { buildRegistry, type CommandGroup } from "../core/command";
import type { HandleOptions } from "../core/handle";
import { PLUGIN_NAME } from "../core/protocol";
import { attachAgentBridge } from "./attach";

/**
 * Connects a set of command groups to the Metro dev tools channel. Call it once,
 * in the root component, with an array defined at module scope.
 */
export function useAgentBridge(groups: CommandGroup[], opts?: HandleOptions): void {
	const client = useDevToolsPluginClient(PLUGIN_NAME);
	const registry = useMemo(() => buildRegistry(groups), [groups]);
	const defaultTimeoutMs = opts?.defaultTimeoutMs;

	warnOnUnstableGroups(groups);

	useEffect(() => {
		if (!client) return;
		return attachAgentBridge(client, registry, { defaultTimeoutMs });
	}, [client, registry, defaultTimeoutMs]);
}

let warnedAboutGroups = false;

/**
 * A groups array built inside the component is a new array on every render, which
 * rebuilds the registry and reconnects the listener each time.
 */
function warnOnUnstableGroups(groups: CommandGroup[]): void {
	const previous = useRef(groups);
	// This module is only required in development, so no NODE_ENV check is needed.
	if (previous.current !== groups && !warnedAboutGroups) {
		warnedAboutGroups = true;
		console.warn(
			"[agent-bridge] the groups array passed to useAgentBridge changes on every render. " +
				"Define it at module scope, or memoize it, so the bridge does not reconnect.",
		);
	}
	previous.current = groups;
}
