import { isStoreFile } from "../lib/paths.mjs";

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"Only a store file changes state. Everywhere else a state change needs a named entry point, or no command can reach it.",
		},
		messages: {
			bareSet:
				"Only a store.ts file calls set. Give the change a named action there and call that, so a command can reach it too.",
			setState:
				"setState puts the app in a state no tap can produce, so the agent would verify something users never see. Give the change a named action in store.ts.",
		},
		schema: [],
	},

	create(context) {
		if (isStoreFile(context.filename)) return {};

		return {
			CallExpression(node) {
				if (node.callee.type === "Identifier" && node.callee.name === "set") {
					context.report({ node, messageId: "bareSet" });
					return;
				}
				if (
					node.callee.type === "MemberExpression" &&
					!node.callee.computed &&
					node.callee.property.type === "Identifier" &&
					node.callee.property.name === "setState"
				) {
					context.report({ node, messageId: "setState" });
				}
			},
		};
	},
};
