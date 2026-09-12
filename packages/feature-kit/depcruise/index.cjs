/**
 * The architecture principles that are about package edges, as dependency-cruiser
 * rules - the other half of what `feature-kit/eslint` enforces.
 *
 * They ship here for the same reason the lint rules do: an app that adopts the
 * pattern gets the checks with the package instead of copying a config it then
 * has to keep in sync.
 *
 * ```js
 * const featureKit = require("@janodetzel/feature-kit/depcruise");
 *
 * module.exports = {
 * 	forbidden: [...featureKit.rules(), ...ownRules],
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

/**
 * @param {{ features?: string, sameFeature?: string, severity?: "error" | "warn" | "info" }} [options]
 * @returns {object[]} rules to spread into a dependency-cruiser `forbidden` array
 */
function rules(options = {}) {
	const features = options.features ?? DEFAULT_FEATURES;
	const sameFeature = options.sameFeature ?? SAME_FEATURE;
	const severity = options.severity ?? "error";

	return [
		{
			name: "no-sibling-feature-import",
			comment:
				"A feature owns its slice and reaches another one only through a port it was given, wired at the composition root (principle 7). Once features import each other, the namespaces in the command surface stop describing the app. `feature-kit/eslint`'s no-cross-feature-import catches this by resolved path; this catches it by package edge, so a deep relative import cannot slip past both.",
			severity,
			// `$1` refers back to the feature folder captured in `from`, so a feature
			// importing its own files is fine and only a sibling is a violation.
			from: { path: features },
			to: { path: features, pathNot: [sameFeature] },
		},
	];
}

module.exports = { rules, DEFAULT_FEATURES, SAME_FEATURE };
