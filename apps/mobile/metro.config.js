// Metro has to see the workspace packages, and it must not walk out of the
// workspace looking for a second copy of react.
const { getDefaultConfig } = require("expo/metro-config");
const { withAgentBridge } = require("agent-bridge/metro");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
	path.resolve(projectRoot, "node_modules"),
	path.resolve(workspaceRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;

// `agent-bridge/groups` resolves to src/app/agent.ts in a development bundle and to
// an empty module in a release bundle, so no command ships to users.
module.exports = withAgentBridge(config, { groups: "./src/app/agent.ts" });
