/**
 * The architecture principles that are about package edges, as dependency-cruiser
 * rules - the other half of what `@janodetzel/app-commands/eslint` enforces.
 *
 * They ship here for the same reason the lint rules do: an app that adopts the
 * pattern gets the checks with the package instead of copying a config it then
 * has to keep in sync.
 *
 * ```js
 * const appCommands = require("@janodetzel/app-commands/depcruise");
 *
 * module.exports = {
 * 	forbidden: [...appCommands.rules(), ...ownRules],
 * 	options: { ... },
 * };
 * ```
 */

/**
 * Where an app keeps its features. One folder per feature, one level deep.
 *
 * The leading alternation is non-capturing on purpose: dependency-cruiser's `$1`
 * in `pathNot` refers to the first capture group, and that has to be the feature
 * folder. A capturing `(apps|packages)` would make `$1` the word "apps", the
 * backreference would never match a sibling, and the rule would silently pass
 * everything.
 */
const DEFAULT_FEATURES = "^(?:apps|packages)/[^/]+/src/features/([^/]+)/";

/** The same path with the captured feature folder pinned to the importer's. */
const SAME_FEATURE = "^(?:apps|packages)/[^/]+/src/features/$1/";

/** Any file in any feature. */
const FEATURES_ROOT = "^(?:apps|packages)/[^/]+/src/features/";

/** A feature's public surface: its barrel, or a nested sub-feature's barrel. */
const FEATURE_BARREL = "/index\\.[cm]?[jt]sx?$";

/** The app code a feature must not reach up into: the composition root and the UI. */
const APP_LAYERS = "^(?:apps|packages)/[^/]+/src/(?:app|screens|navigation)/";

/**
 * @param {{ features?: string, sameFeature?: string, featuresRoot?: string, appLayers?: string, severity?: "error" | "warn" | "info" }} [options]
 * @returns {object[]} rules to spread into a dependency-cruiser `forbidden` array
 */
function rules(options = {}) {
	const features = options.features ?? DEFAULT_FEATURES;
	const sameFeature = options.sameFeature ?? SAME_FEATURE;
	const featuresRoot = options.featuresRoot ?? FEATURES_ROOT;
	const appLayers = options.appLayers ?? APP_LAYERS;
	const severity = options.severity ?? "error";

	return [
		{
			name: "no-sibling-feature-import",
			comment:
				"A feature owns its slice and reaches another one only through a port it was given, wired at the composition root (principle 7). Once features import each other, the namespaces in the command surface stop describing the app. `@janodetzel/app-commands/eslint`'s no-cross-feature-import catches this by resolved path; this catches it by package edge, so a deep relative import cannot slip past both.",
			severity,
			// `$1` refers back to the feature folder captured in `from`, so a feature
			// importing its own files is fine and only a sibling is a violation.
			from: { path: features },
			to: { path: features, pathNot: [sameFeature] },
		},
		{
			name: "no-deep-feature-import",
			comment:
				"Outside a feature, import it through its barrel (`features/todos`, or `features/profile/settings` for a nested one), never a file inside it. The barrel is the feature's public surface; a deep import couples the importer to how the feature happens to be split into files.",
			severity,
			from: { pathNot: [featuresRoot] },
			to: { path: featuresRoot, pathNot: [FEATURE_BARREL] },
		},
		{
			name: "features-do-not-import-the-app",
			comment:
				"Dependencies point from the app into the features, never back: a feature that imports the composition root, a screen, or the navigator can no longer be created in a test or called by a command without the whole app. Pass what it needs as a dependency instead (principle 6).",
			severity,
			from: { path: featuresRoot },
			to: { path: appLayers },
		},
	];
}

module.exports = { rules, DEFAULT_FEATURES, SAME_FEATURE, FEATURES_ROOT, APP_LAYERS };
