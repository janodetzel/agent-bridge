/**
 * Keeps the two packages apart, and keeps agent-bridge's core free of everything.
 *
 * - `agent-bridge/src/core` imports nothing. Not zod, not a UI library, not the
 *   feature layer. That is what lets the bridge run against an app built on
 *   Redux, XState, MobX, or plain service classes.
 * - `agent-bridge/src/adapters/<lib>` may use only its own library and core.
 * - `feature-kit` never imports agent-bridge. The bridge adapts it, like Apollo.
 *
 * The example app's own boundaries - no React in logic files, no imports between
 * sibling features - are feature-kit's ESLint rules instead, because they are
 * about file names and resolved paths rather than package edges.
 */
// Rules match the resolved path of a dependency, which for an npm package is the
// file inside node_modules. Matching on the path rather than on dependency-cruiser's
// dependency types is deliberate: an import of a package the importer does not
// declare has no type to match, and that is exactly the import worth catching.
const inNodeModules = (...packages) => packages.map((p) => `(^|/)node_modules/${p}/`);

// The adapter layer's shared schema language. Core has no validation library, so
// every adapter describes its arguments in zod and converts them in adapters/zod.ts.
// This is the one dependency all of them may have.
const SHARED = inNodeModules("zod");

const ADAPTER_LIBRARIES = {
	"react-navigation": inNodeModules("@react-navigation/[^/]+"),
	apollo: inNodeModules("@apollo/client"),
	zustand: inNodeModules("zustand"),
	"feature-kit": inNodeModules("feature-kit"),
	zod: [],
};

/** One rule per adapter: its own library, plus zod, and nothing else. */
const adapterRules = Object.entries(ADAPTER_LIBRARIES).map(([adapter, allowed]) => ({
	name: "adapters-import-only-their-own-library",
	comment:
		"An adapter binds one library to core. Importing another adapter's library would make every app that uses this one pay for it.",
	severity: "error",
	from: { path: `^packages/agent-bridge/src/adapters/${adapter}` },
	to: { path: "(^|/)node_modules/", pathNot: [...SHARED, ...allowed] },
}));

module.exports = {
	forbidden: [
		{
			name: "core-imports-nothing",
			comment:
				"packages/agent-bridge/src/core must not import anything from node_modules - no validation library, no UI library, no feature layer. It knows four things per command and nothing about where they came from, and that is the property that makes the bridge reusable. Put the dependency in an adapter.",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/core" },
			to: { path: "(^|/)node_modules/" },
		},
		{
			name: "core-does-not-import-app-or-adapters",
			severity: "error",
			from: { path: "^packages/agent-bridge/src/core" },
			to: { path: "^packages/agent-bridge/src/(app|adapters)" },
		},
		...adapterRules,
		{
			name: "feature-kit-does-not-import-agent-bridge",
			comment:
				"feature-kit is an architecture pattern, not part of the bridge. The dependency runs the other way: agent-bridge/src/adapters/feature-kit adapts it. Once this breaks, neither half can be replaced without the other. This catches a relative import across the two packages; an import by package name resolves into build/, which is excluded below, and is banned by an ESLint rule instead.",
			severity: "error",
			from: { path: "^packages/feature-kit" },
			to: { path: ["^packages/agent-bridge", ...inNodeModules("agent-bridge")] },
		},
		{
			name: "no-unresolvable",
			comment:
				"An import that does not resolve slips past every layer rule, because the rules match the resolved path.",
			severity: "error",
			from: { path: "^(packages|apps)/[^/]+/(src|cli|mcp|test)" },
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
