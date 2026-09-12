import type { NavigationContainerRefWithCurrent, ParamListBase } from "@react-navigation/native";
import { z } from "zod";

import type { Registry } from "../core/command";
import { zodCommands } from "./zod";

/**
 * The ref created with `createNavigationContainerRef`. A ref typed with the app's
 * own param list is assignable to this one.
 */
export type NavigationRef = NavigationContainerRefWithCurrent<ParamListBase>;

export type NavigationCommandsOptions = {
	/** The route names this app has. Types do not exist at runtime, so pass them. */
	routes: z.ZodEnum<Record<string, string>>;
	namespace?: string;
	focusTimeoutMs?: number;
};

/**
 * Puts the app on a screen so a UI check has something to look at. It does not
 * verify business logic; the data commands do that.
 */
export function navigationCommands(ref: NavigationRef, opts: NavigationCommandsOptions): Registry {
	const focusTimeoutMs = opts.focusTimeoutMs ?? 2_000;

	return zodCommands(opts.namespace ?? "nav", {
		current: {
			args: z.object({}),
			description:
				"Returns the focused route and its params, or null before the container is ready.",
			run: async () => {
				const route = ref.getCurrentRoute();
				return route ? { name: route.name, params: route.params ?? null } : null;
			},
		},

		state: {
			args: z.object({}),
			description: "Returns the current navigation state, or null before the container is ready.",
			run: async () => ({ state: ref.getState(), rootState: ref.getRootState() }),
		},

		navigate: {
			args: z.object({ screen: opts.routes, params: z.record(z.string(), z.unknown()).optional() }),
			description:
				"Navigates like a user tap. Fails if the route does not become focused in time, which is what an unknown route looks like.",
			run: async ({ screen, params }) => {
				if (!ref.isReady()) throw new Error("navigation is not ready");

				// `navigate` is overloaded per param list; the schema validated the name already.
				(ref.navigate as (screen: string, params?: object) => void)(screen, params);

				// React Navigation logs a warning for an unknown route and does not
				// throw, so waiting for focus is the only failure signal there is.
				await waitFor(
					() => ref.getCurrentRoute()?.name === screen,
					focusTimeoutMs,
					`"${screen}" did not become the focused route within ${focusTimeoutMs} ms`,
				);

				return { name: screen, params: ref.getCurrentRoute()?.params ?? null };
			},
		},

		back: {
			args: z.object({}),
			description: "Goes back one screen. Fails when there is nothing to go back to.",
			run: async () => {
				if (!ref.canGoBack()) throw new Error("cannot go back");
				ref.goBack();
				return ref.getCurrentRoute()?.name ?? null;
			},
		},
	});
}

async function waitFor(check: () => boolean, timeoutMs: number, message: string): Promise<void> {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error(message);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}
