import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		// @react-navigation/native pulls in react-native, whose sources ship as Flow
		// and cannot be parsed by Node. The web build is plain JavaScript and gives
		// the adapter tests a real navigation library to run against.
		alias: { "react-native": "react-native-web" },
	},
	test: {
		// Dependencies are externalized by default, which would load
		// @react-navigation/native through Node and skip the alias above.
		server: { deps: { inline: [/@react-navigation\//] } },
		include: ["packages/*/test/**/*.test.ts", "apps/*/test/**/*.test.ts"],
		environment: "node",
	},
});
