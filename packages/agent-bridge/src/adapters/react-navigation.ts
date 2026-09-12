import type { NavigationContainerRefWithCurrent, ParamListBase } from "@react-navigation/native";
import { z } from "zod";

import { command, defineCommands, type CommandGroup } from "../core/command";

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
export function navigationCommands(
	ref: NavigationRef,
	opts: NavigationCommandsOptions,
): CommandGroup {
	const focusTimeoutMs = opts.focusTimeoutMs ?? 2_000;

	return defineCommands(opts.namespace ?? "nav", {
		current: command({
			description:
				"Returns the focused route and its params, or null before the container is ready.",
			args: z.object({}),
			run: async () => {
				const route = ref.getCurrentRoute();
				return route ? { name: route.name, params: route.params ?? null } : null;
			},
		}),

		state: command({
			description: "Returns the current navigation state, or null before the container is ready.",
			args: z.object({}),
			run: async () => {
				const state = ref.getState();
				const rootState = ref.getRootState();
				return { state, rootState };
			},
		}),

		navigate: command({
			description:
				"Navigates like a user tap. Fails if the route does not become focused in time, which is what an unknown route looks like.",
			args: z.object({ screen: opts.routes, params: z.record(z.string(), z.unknown()).optional() }),
			run: async ({ screen, params }) => {
				if (!ref.isReady()) throw new Error("navigation is not ready");

				// `navigate` is overloaded per param list; the app validated the name already.
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
		}),

		back: command({
			description: "Goes back one screen. Fails when there is nothing to go back to.",
			args: z.object({}),
			run: async () => {
				if (!ref.canGoBack()) throw new Error("cannot go back");
				ref.goBack();
				return ref.getCurrentRoute()?.name ?? null;
			},
		}),
	});
}

async function waitFor(check: () => boolean, timeoutMs: number, message: string): Promise<void> {
	const start = Date.now();
	while (!check()) {
		if (Date.now() - start > timeoutMs) throw new Error(message);
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
}
