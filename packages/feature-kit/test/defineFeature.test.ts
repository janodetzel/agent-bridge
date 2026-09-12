import { describe, expect, it } from "vitest";
import { z } from "zod";

import { defineFeature, META, type Spec } from "../src/index";

const spec = {
	add: { args: z.object({ title: z.string().min(1) }), description: "Adds one." },
} satisfies Spec;

describe("defineFeature", () => {
	it("accepts a camelCase namespace and carries it on the feature", () => {
		const feature = defineFeature("myFeature", spec).create({
			async add({ title }) {
				return title;
			},
		});

		expect(feature[META]).toEqual({ namespace: "myFeature", spec });
	});

	it.each(["Demo", "my-feature", "my.feature", "1st", ""])("rejects %o", (namespace) => {
		expect(() => defineFeature(namespace, spec)).toThrow(/invalid namespace/);
	});

	it("keeps the meta out of Object.keys and out of JSON", () => {
		const feature = defineFeature("todos", spec).create({
			async add({ title }) {
				return title;
			},
		});

		// A string key would show up in both, so a state dump would serialize the
		// schemas and `Object.keys` would report a command that does not exist.
		expect(Object.keys(feature)).toEqual(["add"]);
		expect(JSON.parse(JSON.stringify(feature))).toEqual({});
	});

	it("survives a spec whose keys are named spec and namespace", async () => {
		// The regression test for the symbol: a string key such as `__meta` would
		// have been shadowed by one of these and the feature would have broken
		// silently.
		const colliding = {
			spec: { args: z.object({}), description: "An entry point called spec." },
			namespace: { args: z.object({}), description: "An entry point called namespace." },
		} satisfies Spec;

		const feature = defineFeature("collide", colliding).create({
			async spec() {
				return "the spec handler ran";
			},
			async namespace() {
				return "the namespace handler ran";
			},
		});

		expect(feature[META].namespace).toBe("collide");
		expect(feature[META].spec).toBe(colliding);
		expect(await feature.spec({})).toBe("the spec handler ran");
	});

	it("hands back the same object, so the UI and a consumer share one instance", () => {
		const handlers = {
			async add({ title }: { title: string }) {
				return title;
			},
		};
		expect(defineFeature("todos", spec).create(handlers)).toBe(handlers);
	});
});
