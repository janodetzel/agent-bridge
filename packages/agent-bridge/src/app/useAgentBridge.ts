import { useDevToolsPluginClient } from "expo/devtools";
import { useEffect } from "react";

import type { Registry } from "../core/command";
import type { HandleOptions } from "../core/handle";
import { PLUGIN_NAME } from "../core/protocol";
import { attachAgentBridge } from "./attach";

/**
 * Connects a registry to the Metro dev tools channel. Call it once, in the root
 * component:
 *
 * ```tsx
 * import { commandRegistry } from "./commands";
 *
 * useAgentBridge(commandRegistry);
 * ```
 *
 * Build the registry at module scope. One built inside a component is a new object
 * on every render, which would re-subscribe the listener each frame.
 *
 * `opts.defaultTimeoutMs` bounds a command that never settles, for a caller that
 * sent no timeout of its own. It defaults to 10 seconds.
 */
export function useAgentBridge(registry: Registry, opts?: HandleOptions): void {
	const client = useDevToolsPluginClient(PLUGIN_NAME);
	const defaultTimeoutMs = opts?.defaultTimeoutMs;

	useEffect(() => {
		if (!client) return;
		return attachAgentBridge(client, registry, { defaultTimeoutMs });
	}, [client, registry, defaultTimeoutMs]);
}
