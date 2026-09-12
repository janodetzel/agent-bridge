import path from "node:path";

import { moduleSpecifierVisitors } from "../lib/imports.mjs";
import { DEFAULT_FEATURES_DIR, featureOf, toPosix } from "../lib/paths.mjs";

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"A feature never imports another feature. Wiring belongs in the one file that creates instances.",
		},
		messages: {
			crossFeature:
				'"{{from}}" imports the "{{to}}" feature. Wire them together where the instances are created, passing a getter or a delegate, so the coupling is visible in one place and a command result can show what happened.',
		},
		schema: [
			{
				type: "object",
				properties: { featuresDir: { type: "string" } },
				additionalProperties: false,
			},
		],
	},

	create(context) {
		const featuresDir = context.options[0]?.featuresDir ?? DEFAULT_FEATURES_DIR;
		const here = featureOf(context.filename, featuresDir);
		if (!here) return {};

		const dir = path.dirname(context.filename);

		return moduleSpecifierVisitors((specifier, node) => {
			// Only a relative specifier can reach a sibling folder. A bare one is a
			// package, and the package boundary is dependency-cruiser's job.
			if (!specifier.startsWith(".")) return;

			const resolved = toPosix(path.resolve(dir, specifier));
			const target = featureOf(resolved, featuresDir);
			if (!target || target.root !== here.root || target.feature === here.feature) return;

			context.report({
				node,
				messageId: "crossFeature",
				data: { from: here.feature, to: target.feature },
			});
		});
	},
};
