import type { StoreApi } from "zustand";
import { z } from "zod";

import { command } from "../command/builder";
import { featureCommands } from "../command/tree";
import type { Registry } from "../core/command";

export type ZustandInspectOptions = { namespace?: string };

/**
 * Read-only on purpose. A command that called `setState` would put the app in a
 * state no tap can produce, and the agent would verify something users never see.
 * To change state, expose the store action as a named entry point.
 */
export function zustandInspect(
	stores: Record<string, StoreApi<object>>,
	opts: ZustandInspectOptions = {},
): Registry {
	const names = Object.keys(stores);
	if (names.length === 0) throw new Error("zustandInspect needs at least one store");

	return featureCommands({
		[opts.namespace ?? "store"]: {
			get: command()
				.input({ store: z.enum(names as [string, ...string[]]) })
				.description(
					`Returns the state of one store, without its actions. Stores: ${names.join(", ")}.`,
				)
				.run(async ({ store }) => withoutFunctions(stores[store]!.getState())),
		},
	});
}

function withoutFunctions(state: object): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(state).filter(([, value]) => typeof value !== "function"),
	);
}
