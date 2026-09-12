#!/usr/bin/env node
// The bridge is a remote control for the app, so it must not reach a release
// build. This exports a production bundle and fails if the bridge shows up in it.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The transport, and only the transport. It is what connects the app to Metro, so
// without it nothing in a release build can answer a command.
//
// Plenty of the bridge does reach the bundle - the argument schemas, the
// descriptions, and `handleRequest` itself, which the app pulls in when it imports
// `buildRegistry` from agent-bridge/core. All of it is unreachable: no caller, no
// socket. That is bundle size, not exposure, and checking for it would only teach
// people to ignore a failing check.
const FORBIDDEN = ["useDevToolsPluginClient"];
const platform = process.argv[2] ?? "ios";
const outputDir = mkdtempSync(join(tmpdir(), "release-bundle-"));

try {
	execFileSync("npx", ["expo", "export", "--platform", platform, "--output-dir", outputDir], {
		stdio: "inherit",
	});

	const bundleDir = join(outputDir, "_expo", "static", "js", platform);
	const bundles = readdirSync(bundleDir);
	const found = bundles.flatMap((file) => {
		const bytes = readFileSync(join(bundleDir, file));
		return FORBIDDEN.filter((needle) => bytes.includes(needle)).map((n) => `${n} in ${file}`);
	});

	if (found.length > 0) {
		console.error(`The ${platform} release bundle contains the bridge:`);
		for (const hit of found) console.error(`  ${hit}`);
		process.exit(1);
	}

	console.log(`The ${platform} release bundle is clean: ${bundles.join(", ")}`);
} finally {
	rmSync(outputDir, { recursive: true, force: true });
}
