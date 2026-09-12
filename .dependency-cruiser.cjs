/**
 * Keeps the two packages apart, and keeps app-commands' core free of everything.
 *
 * - `app-commands/src/core` imports nothing. Not zod, not a UI library, not the
 *   feature layer. That is what lets it run against an app built on Redux,
 *   XState, MobX, or plain service classes. That is principle 10.
 * - `app-commands/src/adapters/<lib>` may use only its own library and core.
 * - `feature-kit` imports app-commands types only. The dependency runs the other
 *   way at runtime: an adapter binds the two.
 *
 * The example app's own boundaries are mostly feature-kit's ESLint rules, because
 * they are about file names rather than package edges. The one exception is the
 * sibling-feature rule, which feature-kit ships for dependency-cruiser as well:
 * a deep relative import between features is a package edge, and belongs here.
 */
// Rules match the resolved path of a dependency, which for an npm package is the
// file inside node_modules. Matching on the path rather than on dependency-cruiser's
// dependency types is deliberate: an import of a package the importer does not
// declare has no type to match, and that is exactly the import worth catching.
const featureKit = require("@janodetzel/feature-kit/depcruise");

const inNodeModules = (...packages) => packages.map((p) => `(^|/)node_modules/${p}/`);

// The adapter layer's shared schema language. Core has no validation library, so
// every adapter describes its arguments in zod and converts them in adapters/zod.ts.
// This is the one dependency all of them may have.
const SHARED = inNodeModules("zod");

const ADAPTER_LIBRARIES = {
	"react-navigation": inNodeModules("@react-navigation/[^/]+"),
	apollo: inNodeModules("@apollo/client"),
	zustand: inNodeModules("zustand"),
	"feature-kit": inNodeModules("@janodetzel/feature-kit"),
	zod: [],
};

/** One rule per adapter: its own library, plus zod, and nothing else. */
const adapterRules = Object.entries(ADAPTER_LIBRARIES).map(([adapter, allowed]) => ({
	name: "adapters-import-only-their-own-library",
	comment:
		"An adapter binds one library to core. Importing another adapter's library would make every app that uses this one pay for it.",
	severity: "error",
	from: { path: `^packages/app-commands/src/adapters/${adapter}` },
	to: { path: "(^|/)node_modules/", pathNot: [...SHARED, ...allowed] },
}));

module.exports = {
	forbidden: [
		...featureKit.rules(),
		{
			name: "core-imports-nothing",
			comment:
				"packages/app-commands/src/core must not import anything from node_modules - no validation library, no UI library, no feature layer. It knows four things per command and nothing about where they came from, and that is the property that makes it reusable (principle 10). Put the dependency in an adapter.",
			severity: "error",
			from: { path: "^packages/app-commands/src/core" },
			to: { path: "(^|/)node_modules/" },
		},
		{
			name: "core-does-not-import-transport-or-adapters",
			severity: "error",
			from: { path: "^packages/app-commands/src/core" },
			to: { path: "^packages/app-commands/src/(expo|adapters)" },
		},
		...adapterRules,
		{
			name: "feature-kit-imports-app-commands-types-only",
			comment:
				"feature-kit may import app-commands types, and nothing else from it - principle 10 is only worth something if the core can be replaced without the feature layer following. A value import means the two halves are welded together. `tsPreCompilationDeps` keeps type-only imports in the graph, so `dependencyTypesNot` is what lets them through while a runtime import still fails.",
			severity: "error",
			from: { path: "^packages/feature-kit" },
			to: {
				path: ["^packages/app-commands", ...inNodeModules("@janodetzel/app-commands")],
				dependencyTypesNot: ["type-only"],
			},
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
