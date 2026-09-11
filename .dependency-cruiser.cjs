/**
 * Keeps the layers of agent-bridge apart:
 * - `src/core` runs anywhere, so it may not touch a UI library.
 * - `src/adapters` may use only its own library and core.
 * The example app's own boundary - logic files that must not import React - is an
 * ESLint rule on file names instead, because its features hold logic and UI together.
 */
// Rules match the resolved path of a dependency, which for an npm package is the
// file inside node_modules. Matching on the path rather than on dependency-cruiser's
// dependency types is deliberate: an import of a package the importer does not
// declare has no type to match, and that is exactly the import worth catching.
const inNodeModules = (...packages) => packages.map((p) => `(^|/)node_modules/${p}/`);

const UI_LIBRARIES = inNodeModules(
	"react",
	"react-dom",
	"react-native",
	"expo",
	"expo-[^/]+",
	"@react-navigation/[^/]+",
	"@apollo/client",
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
			to: { path: UI_LIBRARIES },
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
				path: UI_LIBRARIES,
				pathNot: inNodeModules("@react-navigation/[^/]+"),
			},
		},
		{
			name: "adapters-import-only-their-own-library",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/adapters/apollo" },
			to: {
				path: UI_LIBRARIES,
				pathNot: inNodeModules("@apollo/client"),
			},
		},
		{
			name: "adapters-import-only-their-own-library",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/adapters/zustand" },
			to: {
				path: UI_LIBRARIES,
				pathNot: inNodeModules("zustand"),
			},
		},
		{
			name: "no-unresolvable",
			comment:
				"An import that does not resolve slips past every layer rule, because the rules match the resolved path.",
			severity: "error",
			from: { path: "^(packages|apps)/[^/]+/(src|cli|test)" },
			to: { couldNotResolve: true },
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
			// "module" first, so a package that ships both maps to its ESM files and the
			// rules can match a readable path instead of a CJS interop directory.
			conditionNames: ["module", "import", "require", "node", "default", "types"],
			mainFields: ["main", "types"],
		},
	},
};
