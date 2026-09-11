import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

/**
 * The smoke test group. It proves the CLI reaches the app and that a thrown error
 * comes back as a failure, without depending on any business logic.
 */
export const demoCommands = defineCommands("demo", {
	echo: command({
		description:
			"Returns the arguments it was given. Use it to check that the CLI reaches the running app.",
		args: z.record(z.string(), z.unknown()),
		run: async (args) => args,
	}),

	fail: command({
		description: "Always throws. Use it to check that a failing command exits with code 1.",
		args: z.object({}),
		run: async () => {
			throw new Error("demo.fail always throws");
		},
	}),
});
