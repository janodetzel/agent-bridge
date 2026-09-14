import type { Command } from "../core/command";
import {
	compileInput,
	NO_INPUT,
	type CompiledInput,
	type InferInput,
	type InferOutput,
	type InputSpec,
} from "./input";

/**
 * A core `Command` that is also the function the UI calls. The registry holds it
 * as it is; the screen calls it. `todosFeature.add({ title })` from a screen and
 * `todos.add` from the CLI run the same validation and the same handler.
 *
 * Calling it validates and then runs. `run` on its own skips validation, for a
 * caller that has already parsed, which is what `handleRequest` does. The UI
 * always calls the command itself.
 */
export type CallableCommand<In = unknown, Out = unknown> = Command &
	((...args: undefined extends In ? [input?: In] : [input: In]) => Promise<Out>);

type BuilderMethods<In, Out, Used extends string> = {
	/**
	 * The arguments: a Standard Schema (zod, Valibot, ArkType), an object of them,
	 * or a function that returns the parsed value and throws to reject it.
	 */
	input<S extends InputSpec>(
		spec: S,
	): CommandBuilder<InferInput<S>, InferOutput<S>, Used | "input">;
	/**
	 * Written for the agent: what the command does, what it returns, and what it
	 * does not do. It is part of the API; never generate it from the name.
	 */
	description(text: string): CommandBuilder<In, Out, Used | "description">;
	/** Must return a promise that settles when the work is done. */
	run<R>(handler: (input: Out) => Promise<R>): CallableCommand<In, R>;
};

/** Each step is available once; `run` only after `description`. */
export type CommandBuilder<In = void, Out = void, Used extends string = never> = Omit<
	BuilderMethods<In, Out, Used>,
	Used | ("description" extends Used ? never : "run")
>;

/** Thrown by a direct call whose input fails validation. */
export class InputError extends Error {
	readonly issues: readonly unknown[];

	constructor(issues: readonly unknown[]) {
		super(`invalid input: ${issues.map(messageOf).join("; ")}`);
		this.name = "InputError";
		this.issues = issues;
	}
}

/**
 * Starts a command: the schema, the description, and the handler in one expression.
 *
 * ```ts
 * setNotifications: command()
 *   .input({ notifications: z.boolean() })
 *   .description("Turns notifications on or off and saves. Fails when the save fails.")
 *   .run(async ({ notifications }) => { ... }),
 * ```
 */
export function command(): CommandBuilder {
	return builder({});
}

type BuilderState = { input?: CompiledInput; description?: string };

// Typed `never` inside: the public `CommandBuilder` type tracks the steps, and the
// runtime object is the same at every step.
function builder(state: BuilderState): never {
	const methods: BuilderMethods<unknown, unknown, never> = {
		input(spec) {
			if (state.input) throw new Error("command().input() was already called");
			return builder({ ...state, input: compileInput(spec) });
		},

		description(text) {
			if (state.description !== undefined) {
				throw new Error("command().description() was already called");
			}
			return builder({ ...state, description: text });
		},

		run(handler) {
			const description = state.description ?? "";
			if (description.trim() === "") {
				throw new Error(
					"command().run() needs a description first; an agent cannot use a command it cannot read",
				);
			}
			const { jsonSchema, parse } = state.input ?? NO_INPUT;

			// `async` turns a handler that throws synchronously into a rejection.
			const run = async (input: unknown) => handler(input);

			const callable = async (input?: unknown) => {
				const parsed = await parse(input);
				if (!parsed.ok) throw new InputError(parsed.issues);
				return run(parsed.value);
			};

			// Non-enumerable, so a feature object's keys and a state dump stay clean.
			Object.defineProperties(callable, {
				description: { value: description },
				jsonSchema: { get: jsonSchema },
				parse: { value: parse },
				run: { value: run },
			});
			return callable as never;
		},
	};
	return methods as never;
}

/**
 * Whether a value was built by `command()`: a function carrying the four fields.
 * An object literal is never collected - `command().input(fn)` covers a schema
 * library without Standard Schema, so there is one way to define a command.
 */
export function isCallableCommand(value: unknown): value is CallableCommand<never> {
	if (typeof value !== "function") return false;
	const candidate = value as unknown as Partial<Record<keyof Command, unknown>>;
	return (
		typeof candidate.description === "string" &&
		typeof candidate.parse === "function" &&
		typeof candidate.run === "function" &&
		// `in`, not a read: the schema is computed lazily, on first read.
		"jsonSchema" in candidate
	);
}

function messageOf(issue: unknown): string {
	return typeof issue === "object" && issue !== null && "message" in issue
		? String(issue.message)
		: String(issue);
}
