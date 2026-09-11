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
		// Rule 2 of the architecture: business logic lives in stores and operation
		// functions, and a store update goes through the store file that owns it.
		files: ["packages/features/**/*.ts"],
		ignores: ["packages/features/**/store.ts"],
		rules: {
			"no-restricted-syntax": [
				"error",
				{
					selector: "CallExpression[callee.name='set']",
					message: "Only a store file calls set(). Move the update into the store action.",
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
		files: ["packages/agent-bridge/src/index.ts", "apps/mobile/src/agent/groups.ts"],
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
