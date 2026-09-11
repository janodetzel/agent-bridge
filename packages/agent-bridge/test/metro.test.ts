import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// The wrapper ships as CommonJS, because a metro.config.js requires it.
import { withAgentBridge, GROUPS_SPECIFIER } from "../metro/index.cjs";

const projectRoot = path.join(__dirname, "..", "..", "..", "apps", "mobile");
const groups = "./src/app/agent.ts";
const fallback = path.join(__dirname, "..", "build", "groups.js");

/** Stands in for Metro: every specifier resolves to itself, except the fallback. */
const metroResolver = vi.fn((_context: unknown, moduleName: string) =>
	moduleName === GROUPS_SPECIFIER
		? { type: "sourceFile", filePath: fallback }
		: { type: "sourceFile", filePath: `/resolved/${moduleName}` },
);

const resolve = (config: any, moduleName: string, dev: boolean) =>
	config.resolver.resolveRequest({ dev, resolveRequest: metroResolver }, moduleName, "ios");

describe("withAgentBridge", () => {
	const base = { projectRoot, resolver: { sourceExts: ["ts"] } };

	it("resolves the groups specifier to the app's module in a development bundle", () => {
		const config = withAgentBridge(base, { groups });

		expect(resolve(config, GROUPS_SPECIFIER, true)).toEqual({
			type: "sourceFile",
			filePath: path.join(projectRoot, "src", "app", "agent.ts"),
		});
	});

	it("resolves it to the empty fallback in a release bundle", () => {
		const config = withAgentBridge(base, { groups });

		expect(resolve(config, GROUPS_SPECIFIER, false)).toEqual({
			type: "sourceFile",
			filePath: fallback,
		});
	});

	it("leaves every other specifier as Metro resolved it", () => {
		const config = withAgentBridge(base, { groups });

		expect(resolve(config, "react-native", true)).toEqual({
			type: "sourceFile",
			filePath: "/resolved/react-native",
		});
	});

	it("swaps the package's own import of the fallback, not only the app's", () => {
		const config = withAgentBridge(base, { groups });
		const context = {
			dev: true,
			resolveRequest: vi.fn(() => ({ type: "sourceFile", filePath: fallback })),
		};

		// This is what the hook's relative `../groups` import resolves to.
		expect(config.resolver.resolveRequest(context, "../groups", "ios")).toEqual({
			type: "sourceFile",
			filePath: path.join(projectRoot, "src", "app", "agent.ts"),
		});
	});

	it("keeps a resolver the app had already installed", () => {
		const existing = vi.fn(() => ({ type: "sourceFile", filePath: "/the-app/answer.ts" }));
		const config = withAgentBridge(
			{ ...base, resolver: { ...base.resolver, resolveRequest: existing } },
			{ groups },
		);

		expect(resolve(config, "react-native", true)).toEqual({
			type: "sourceFile",
			filePath: "/the-app/answer.ts",
		});
		expect(resolve(config, GROUPS_SPECIFIER, true)).toMatchObject({ type: "sourceFile" });
	});

	it("keeps the rest of the config", () => {
		const config = withAgentBridge(base, { groups });
		expect(config.resolver.sourceExts).toEqual(["ts"]);
		expect(config.projectRoot).toBe(projectRoot);
	});

	it("fails loudly on a missing or wrong groups path", () => {
		expect(() => withAgentBridge(base, {} as { groups: string })).toThrow(/needs the path/);
		expect(() => withAgentBridge(base, { groups: "./nope.ts" })).toThrow(/cannot find/);
	});
});
