const fs = require("node:fs");
const path = require("node:path");

/**
 * The specifier an app imports its command groups from. Metro resolves it to the
 * app's groups module in a development bundle, and to the package's empty
 * fallback in a release bundle.
 */
const GROUPS_SPECIFIER = "agent-bridge/groups";

const FALLBACK_GROUPS = path.join(__dirname, "..", "build", "groups.js");

/** pnpm links workspace packages, and Metro may report either side of the link. */
function realPath(filePath) {
	try {
		return fs.realpathSync(filePath);
	} catch {
		return filePath;
	}
}

/**
 * Wraps a Metro config so the bridge's command groups exist in development and
 * are gone from a release bundle.
 *
 * The swap happens during resolution, before Metro collects dependencies, so the
 * app's groups module and everything it imports never enter a release bundle.
 * Deferring the import at runtime instead would keep all of it.
 *
 * @param {object} config a Metro config, usually from expo/metro-config
 * @param {{ groups: string, projectRoot?: string }} options path to the module
 *   exporting `agentGroups`, relative to the project root
 */
function withAgentBridge(config, options) {
	const groups = options?.groups;
	if (!groups) {
		throw new Error(
			"withAgentBridge needs the path to your groups module, for example " +
				'withAgentBridge(config, { groups: "./src/app/agent.ts" })',
		);
	}

	const projectRoot = options.projectRoot ?? config.projectRoot ?? process.cwd();
	const groupsPath = path.resolve(projectRoot, groups);

	if (!fs.existsSync(groupsPath)) {
		throw new Error(`withAgentBridge cannot find the groups module at ${groupsPath}`);
	}
	if (!fs.existsSync(FALLBACK_GROUPS)) {
		throw new Error(
			`agent-bridge is not built: ${FALLBACK_GROUPS} is missing. Run \`pnpm --filter agent-bridge build\`.`,
		);
	}

	const fallback = realPath(FALLBACK_GROUPS);
	const previous = config.resolver?.resolveRequest;

	return {
		...config,
		resolver: {
			...config.resolver,
			resolveRequest(context, moduleName, platform) {
				const next = previous ?? context.resolveRequest;
				const resolution = next(context, moduleName, platform);

				// Anything that lands on the empty fallback - the hook importing it, or an
				// app importing `agent-bridge/groups` - becomes the app's own groups module
				// in a development bundle. `context.dev` is per bundle, so one config serves
				// `expo start` and `expo export` alike.
				if (
					context.dev &&
					resolution?.type === "sourceFile" &&
					realPath(resolution.filePath) === fallback
				) {
					return { type: "sourceFile", filePath: groupsPath };
				}

				return resolution;
			},
		},
	};
}

module.exports = { withAgentBridge, GROUPS_SPECIFIER };
