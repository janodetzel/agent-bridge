import { isStoreFile } from "../lib/paths.mjs";

/** A throw inside a nested function does not leave the action, so stop there. */
const FUNCTIONS = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);

const isPromiseReject = (node) =>
	node?.type === "CallExpression" &&
	node.callee.type === "MemberExpression" &&
	!node.callee.computed &&
	node.callee.object.type === "Identifier" &&
	node.callee.object.name === "Promise" &&
	node.callee.property.type === "Identifier" &&
	node.callee.property.name === "reject";

function rethrows(root) {
	let found = false;

	const visit = (node) => {
		if (found || !node || typeof node.type !== "string") return;
		if (node !== root && FUNCTIONS.has(node.type)) return;

		if (node.type === "ThrowStatement") {
			found = true;
			return;
		}
		if (node.type === "ReturnStatement" && isPromiseReject(node.argument)) {
			found = true;
			return;
		}

		for (const key of Object.keys(node)) {
			if (key === "parent") continue;
			const child = node[key];
			if (Array.isArray(child)) child.forEach(visit);
			else if (child && typeof child === "object") visit(child);
		}
	};

	visit(root);
	return found;
}

export default {
	meta: {
		type: "problem",
		docs: {
			description:
				"A store action that catches must rethrow. The rethrow is what makes the command fail; without it the agent is told the save succeeded.",
		},
		messages: {
			swallowed:
				"This catch rolls back but does not rethrow, so the action resolves as if it worked. A command would report success while the write failed, and the agent's next read is a race. End the catch with `throw`.",
		},
		schema: [],
	},

	create(context) {
		if (!isStoreFile(context.filename)) return {};

		return {
			CatchClause(node) {
				if (!rethrows(node.body)) {
					context.report({ node, messageId: "swallowed" });
				}
			},
		};
	},
};
