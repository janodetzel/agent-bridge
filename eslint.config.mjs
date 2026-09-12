import js from "@eslint/js";
import featureKit from "feature-kit/eslint";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			"**/node_modules/**",
			"**/build/**",
			"**/dist/**",
			"**/.expo/**",
			"**/*.config.js",
			"**/.eslintrc.js",
			"packages/agent-bridge/scripts/**",
			"packages/agent-bridge/webui/**",
			"apps/*/ios/**",
			"apps/*/android/**",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		// A CommonJS file requires. That is the point of it.
		files: ["**/*.cjs"],
		languageOptions: { sourceType: "commonjs", globals: globals.node },
		rules: { "@typescript-eslint/no-require-imports": "off" },
	},
	{
		files: ["**/*.mjs"],
		languageOptions: { globals: globals.node },
	},
	{
		files: ["**/*.ts", "**/*.tsx"],
		languageOptions: {
			parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
		},
		rules: {
			"@typescript-eslint/no-floating-promises": "error",
			"@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
		},
	},
	// The architecture principles, as rules. They live in feature-kit rather than
	// here so an app that adopts the pattern gets them with the package, instead
	// of copying a lint config it has to keep in sync.
	//
	// Narrowed to the app: the principles are about how an app holds state, and
	// the packages are libraries. A store factory in an adapter test calls `set`
	// legitimately, and it is not a store.ts.
	...featureKit.configs.recommended.map((config) => ({
		...config,
		files: ["apps/*/src/**/*.ts", "apps/*/src/**/*.tsx"],
	})),
	{
		// feature-kit is an architecture pattern, not part of the bridge. The
		// dependency runs the other way: agent-bridge/src/adapters/feature-kit adapts
		// it. dependency-cruiser catches a relative import across the two packages,
		// but not one by package name - that resolves into build/, which is excluded
		// from its graph - so the specifier is banned here instead.
		files: ["packages/feature-kit/**/*.{ts,tsx,mts,mjs}"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: ["agent-bridge", "agent-bridge/*"],
							message:
								"feature-kit never imports agent-bridge. If the bridge needs something from here, it belongs in agent-bridge/src/adapters/feature-kit.",
						},
					],
				},
			],
		},
	},
	{
		// Keeping the bridge out of a release build depends on a lazy require in a
		// branch the bundler drops. Written any other way, it ships to users.
		files: ["packages/agent-bridge/src/index.ts"],
		rules: {
			"@typescript-eslint/ban-ts-comment": "off",
			"@typescript-eslint/consistent-type-imports": "off",
			"@typescript-eslint/no-require-imports": "off",
		},
	},
	{
		files: ["**/test/**/*.ts"],
		rules: { "@typescript-eslint/no-explicit-any": "off" },
	},
);
