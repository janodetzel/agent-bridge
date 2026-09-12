import { isLogicFile } from "../lib/paths.mjs";

/** object.property -> the dependency to inject instead. */
const BANNED = {
	"Date.now": "a clock dependency, so a command and a test see the same time",
	"Date.parse": "a clock dependency, so a command and a test see the same time",
	"Math.random": "injected randomness, so a command and a test see the same value",
};

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"The outside world arrives through injected dependencies. Nothing reads the clock or randomness implicitly.",
		},
		messages: {
			ambient: "{{expression}} reads the outside world implicitly. Take {{instead}}.",
		},
		schema: [
			{
				type: "object",
				properties: {
					featuresDir: { type: "string" },
					logicFiles: { type: "array", items: { type: "string" } },
				},
				additionalProperties: false,
			},
		],
	},

	create(context) {
		const options = context.options[0] ?? {};
		if (!isLogicFile(context.filename, options)) return {};

		return {
			MemberExpression(node) {
				if (node.computed || node.object.type !== "Identifier") return;
				if (node.property.type !== "Identifier") return;

				const expression = `${node.object.name}.${node.property.name}`;
				const instead = BANNED[expression];
				if (instead) {
					context.report({ node, messageId: "ambient", data: { expression, instead } });
				}
			},
		};
	},
};
