import js from "@eslint/js";
import appCommands from "@janodetzel/app-commands/eslint";
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
			"packages/app-commands/scripts/**",
			"packages/app-commands/webui/**",
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
	// The architecture principles, as rules. They live in app-commands rather than
	// here so an app that adopts the pattern gets them with the package, instead
	// of copying a lint config it has to keep in sync.
	//
	// Narrowed to the app: the principles are about how an app holds state, and
	// the packages are libraries. A store factory in an adapter test calls `set`
	// legitimately, and it is not a store.ts.
	...appCommands.configs.recommended.map((config) => ({
		...config,
		files: ["apps/*/src/**/*.ts", "apps/*/src/**/*.tsx"],
	})),
	{
		// Keeping the transport out of a release build depends on a lazy require in a
		// branch the bundler drops. Written any other way, it ships to users.
		files: ["packages/app-commands/src/expo/index.ts"],
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
