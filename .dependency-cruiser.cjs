/**
 * Keeps the layers of agent-bridge apart:
 * - `src/core` runs anywhere, so it may not touch a UI library.
 * - `src/adapters` may use only its own library and core.
 * - feature packages stay free of React, so the bridge can drive them headless.
 */
// Rules match the resolved path of a dependency, which for an npm package is the
// file inside node_modules.
const inNodeModules = (...packages) => packages.map((p) => `(^|/)node_modules/${p}/`);

const UI_LIBRARIES = inNodeModules(
	"react",
	"react-dom",
	"react-native",
	"expo",
	"expo-[^/]+",
	"@react-navigation/[^/]+",
	"@apollo/client/react",
	"zustand",
);

module.exports = {
	forbidden: [
		{
			name: "core-stays-portable",
			comment:
				"packages/agent-bridge/src/core must not import a UI or state library. It runs in the app, in the CLI, and in tests.",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/core" },
			to: { dependencyTypes: ["npm", "npm-dev", "npm-peer", "npm-optional"], path: UI_LIBRARIES },
		},
		{
			name: "core-does-not-import-app-or-adapters",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/core" },
			to: { path: "^packages/agent-bridge/src/(app|adapters)" },
		},
		{
			name: "adapters-import-only-their-own-library",
			comment:
				"An adapter binds one library to core. Importing another adapter's library would make every app pay for it.",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/adapters/react-navigation" },
			to: {
				dependencyTypes: ["npm", "npm-dev", "npm-peer", "npm-optional"],
				path: UI_LIBRARIES,
				pathNot: inNodeModules("@react-navigation/[^/]+"),
			},
		},
		{
			name: "adapters-import-only-their-own-library",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/adapters/apollo" },
			to: {
				dependencyTypes: ["npm", "npm-dev", "npm-peer", "npm-optional"],
				path: UI_LIBRARIES,
				pathNot: inNodeModules("@apollo/client"),
			},
		},
		{
			name: "adapters-import-only-their-own-library",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/adapters/zustand" },
			to: {
				dependencyTypes: ["npm", "npm-dev", "npm-peer", "npm-optional"],
				path: UI_LIBRARIES,
				pathNot: inNodeModules("zustand"),
			},
		},
		{
			name: "features-stay-free-of-ui",
			comment:
				"packages/features holds business logic the CLI drives. A React import there means a command cannot reach it.",
			severity: "error",
			from: { path: "^packages/features/src" },
			to: {
				dependencyTypes: ["npm", "npm-dev", "npm-peer", "npm-optional"],
				path: inNodeModules(
					"react",
					"react-native",
					"expo",
					"expo-[^/]+",
					"@react-navigation/[^/]+",
				),
			},
		},
		{
			name: "features-use-apollo-without-react",
			comment:
				"In Apollo Client 4 the root entry point is React-free and the hooks live under " +
				"@apollo/client/react. A feature that reaches for the hooks puts its cache logic " +
				"inside a component, where a command cannot call it.",
			severity: "error",
			from: { path: "^packages/features/src" },
			to: { path: ["(^|/)node_modules/@apollo/client/react/"] },
		},
		{
			name: "no-circular",
			severity: "error",
			from: {},
			to: { circular: true },
		},
	],
	options: {
		doNotFollow: { path: "node_modules" },
		// node_modules stays in the graph on purpose: the layer rules are about which
		// libraries a layer may import. `doNotFollow` keeps the graph from exploding.
		exclude: { path: "(/build/|/dist/|/webui/)" },
		tsPreCompilationDeps: true,
		tsConfig: { fileName: "tsconfig.base.json" },
		enhancedResolveOptions: {
			exportsFields: ["exports"],
			conditionNames: ["import", "require", "node", "default", "types"],
			mainFields: ["main", "types"],
		},
	},
};
