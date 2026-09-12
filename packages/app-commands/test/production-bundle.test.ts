import { build } from "esbuild";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The `/expo` subpath, not `.`: the root entry is the core now, and the core is
// meant to ship. What must not survive a release build is the transport - the
// hook that opens the dev tools channel and the handler behind it.
const entry = path.join(__dirname, "..", "src", "expo", "index.ts");

async function bundle(nodeEnv: string): Promise<string> {
	const result = await build({
		entryPoints: [entry],
		bundle: true,
		write: false,
		format: "cjs",
		platform: "node",
		external: ["expo/devtools", "react", "zod"],
		define: { "process.env.NODE_ENV": JSON.stringify(nodeEnv) },
	});
	return result.outputFiles[0]!.text;
}

describe("the expo entry point", () => {
	it("leaves the transport out of a production bundle", async () => {
		const output = await bundle("production");
		expect(output).not.toContain("useDevToolsPluginClient");
		expect(output).not.toContain("handleRequest");
	}, 30_000);

	it("keeps the transport in a development bundle", async () => {
		const output = await bundle("development");
		expect(output).toContain("useDevToolsPluginClient");
	}, 30_000);
});
