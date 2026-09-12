#!/usr/bin/env node
/**
 * stdio entry point of the agent-bridge MCP server.
 *
 * stdout carries the MCP protocol and nothing else, which is why every diagnostic
 * here goes to stderr. The client module the server builds on is silent by design.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer, type McpServerOptions } from "./server";

const USAGE = `Usage:
  agent-bridge-mcp [--host <host>] [--port <port>] [--timeout <ms>]

Speaks MCP over stdio and exposes the commands of the app running on Metro. The
same settings can come from AGENT_BRIDGE_HOST, AGENT_BRIDGE_PORT and
AGENT_BRIDGE_TIMEOUT.`;

function parseOptions(argv: string[]): McpServerOptions {
	if (argv.includes("--help") || argv.includes("-h")) {
		console.log(USAGE);
		process.exit(0);
	}

	const options: McpServerOptions = {};
	const host = process.env.AGENT_BRIDGE_HOST;
	const port = numeric(process.env.AGENT_BRIDGE_PORT, "AGENT_BRIDGE_PORT");
	const timeout = numeric(process.env.AGENT_BRIDGE_TIMEOUT, "AGENT_BRIDGE_TIMEOUT");

	if (host !== undefined) options.host = host;
	if (port !== undefined) options.port = port;
	if (timeout !== undefined) options.defaultTimeoutMs = timeout;

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i]!;
		switch (token) {
			case "--host":
				options.host = required(argv[++i], token);
				break;
			case "--port":
				options.port = numeric(required(argv[++i], token), token);
				break;
			case "--timeout":
				options.defaultTimeoutMs = numeric(required(argv[++i], token), token);
				break;
			default:
				throw new Error(`unknown option "${token}"\n\n${USAGE}`);
		}
	}

	return options;
}

function required(value: string | undefined, option: string): string {
	if (value === undefined) throw new Error(`${option} needs a value`);
	return value;
}

function numeric(value: string | undefined, source: string): number | undefined {
	if (value === undefined || value === "") return undefined;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) throw new Error(`${source} must be a number, got "${value}"`);
	return parsed;
}

async function main(): Promise<void> {
	const server = createServer(parseOptions(process.argv.slice(2)));
	await server.connect(new StdioServerTransport());
	console.error("agent-bridge MCP server ready on stdio");
}

main().catch((e: unknown) => {
	console.error(e instanceof Error ? e.message : String(e));
	process.exitCode = 1;
});
