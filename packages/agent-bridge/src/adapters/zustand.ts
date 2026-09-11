import type { StoreApi } from "zustand";
import { z } from "zod";

import { command, defineCommands, type CommandGroup } from "../core/command";

export type ZustandInspectOptions = { namespace?: string };

/**
 * Read-only on purpose. A command that called `setState` would put the app in a
 * state no tap can produce, and the agent would verify something users never see.
 * To change state, expose the store action as a command in the feature.
 */
export function zustandInspect(
	stores: Record<string, StoreApi<object>>,
	opts: ZustandInspectOptions = {},
): CommandGroup {
	const names = Object.keys(stores);
	if (names.length === 0) throw new Error("zustandInspect needs at least one store");

	return defineCommands(opts.namespace ?? "store", {
		get: command({
			description: `Returns the state of one store, without its actions. Stores: ${names.join(", ")}.`,
			args: z.object({ store: z.enum(names as [string, ...string[]]) }),
			run: async ({ store }) => withoutFunctions(stores[store]!.getState()),
		}),
	});
}

function withoutFunctions(state: object): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(state).filter(([, value]) => typeof value !== "function"),
	);
}
