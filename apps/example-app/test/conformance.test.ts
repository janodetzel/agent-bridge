import { ApolloClient, InMemoryCache } from "@apollo/client";
import { apolloCommands } from "@janodetzel/app-commands/adapters/apollo";
import { buildRegistry } from "@janodetzel/app-commands";
import { checkRegistry } from "@janodetzel/app-commands/conformance";
import { featureCommands } from "@janodetzel/app-commands/adapters/feature-kit";
import { zodCommands } from "@janodetzel/app-commands/adapters/zod";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { apiLink } from "../src/app/api";
import { createNews } from "../src/features/news";
import { createDismissedNewsStore } from "../src/features/news/store";
import { createSettings } from "../src/features/settings";
import { createSettingsStore } from "../src/features/settings/store";
import { createTodos } from "../src/features/todos";

/**
 * The conformance suite the package ships, run against this app's own registry.
 *
 * It is deliberately not the same shape as `commands.test.ts`: that file asserts
 * what this app's commands do, this one asserts the properties every registry
 * must have for an agent to trust it - a real description, a schema the CLI can
 * read, a `parse` that refuses bad input, no shadowed name, a result that
 * survives the wire.
 *
 * The registry is rebuilt rather than imported from `src/app/commands.ts`, which
 * reaches `instances.ts` and with it AsyncStorage and the navigation ref.
 * `navigationCommands` is left out for the same reason.
 */

const nullStorage = <T>() => ({ get: async () => null as T | null, set: async () => {} });

function buildAppRegistry() {
	const client = new ApolloClient({ link: apiLink, cache: new InMemoryCache() });
	return buildRegistry(
		featureCommands(
			createTodos({ apollo: client }),
			createNews({
				apollo: client,
				store: createDismissedNewsStore({ storage: nullStorage<string[]>() }),
			}),
			createSettings({ store: createSettingsStore({ storage: nullStorage() }) }),
		),
		zodCommands("exampleCommand", {
			inout: {
				args: z.object({ arg: z.string() }),
				description: "A command that forwards its input",
				run: async ({ arg }) => ({ arg }),
			},
		}),
		apolloCommands(client),
	);
}

describe("the registry this app builds", () => {
	it("conforms to what an agent needs from every command", async () => {
		// Only the commands that read from an in-memory store are sampled. The
		// round-trip check has to run a command, and a registry is mostly
		// mutations and network reads - sampling `todos.removeAll` to assert a
		// serialization property would be worse than not asserting it.
		const problems = await checkRegistry(buildAppRegistry(), {
			samples: {
				"settings.get": {},
				"news.dismissed": {},
				"exampleCommand.inout": { arg: "round trip" },
			},
		});

		expect(problems).toEqual([]);
	});
});
