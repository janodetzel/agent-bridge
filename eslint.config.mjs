import js from "@eslint/js";
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
		files: ["**/*.cjs"],
		languageOptions: { sourceType: "commonjs", globals: globals.node },
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
	{
		// The example app keeps its logic and its UI side by side, so the boundary
		// that matters is a lint rule on file names rather than a package split: an
		// operation function, a store, or a command that imports React cannot be
		// called from a command.
		files: ["apps/*/src/features/*/{api,store,commands}.ts"],
		rules: {
			"no-restricted-imports": [
				"error",
				{
					patterns: [
						{
							group: [
								"react",
								"react-native",
								"react-native/*",
								"expo",
								"expo-*",
								"@react-navigation/*",
							],
							message:
								"Logic that a command calls must run outside React. Move the UI part into the feature's screen.",
						},
					],
				},
			],
			"no-restricted-properties": [
				"error",
				{
					object: "Date",
					property: "now",
					message: "Inject a clock dependency, so a command and a test see the same time.",
				},
				{
					object: "Math",
					property: "random",
					message: "Inject randomness, so a command and a test see the same value.",
				},
			],
		},
	},
	{
		// Keeping the bridge out of a release build depends on a lazy require in a
		// branch the bundler drops. Written any other way, it ships to users.
		files: ["packages/agent-bridge/src/index.ts", "apps/*/src/app/App.tsx"],
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
