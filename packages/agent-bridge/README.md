# agent-bridge

An Expo dev tools plugin that lets an agent run typed commands against the app in
a simulator, from a terminal or from a web console. A command calls the same store
action or operation function a tap in the UI calls, on the same instances, so what
the agent verifies is what the user gets.

```
$ pnpm agent-bridge nav.navigate --screen Settings
{"name":"Settings","params":null}
```

`docs/agent-bridge-architecture.md` in the repo root explains the app architecture
this package serves. `docs/package-architecture.md` is the brief it was built from.

## Installing it in the workspace

The package stays a workspace package; it is not published.

```jsonc
// apps/mobile/package.json
"dependencies": { "agent-bridge": "workspace:*" }
```

Add it to the root `package.json` as well, so `pnpm agent-bridge` works from the
repo root: pnpm links a binary into the `node_modules/.bin` of the package that
depends on it.

`zod` (version 4) is a peer dependency, and so are `expo` and `react`. The three
adapter libraries are optional peers: you only need the ones you use.

## Defining a command

A command has a description written for the agent, a Zod schema for its arguments,
and an async `run`. It holds no business logic of its own: it validates, calls the
function the UI calls, and returns the result.

```ts
import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

export const todosCommands = (client: ApolloClient) =>
	defineCommands("todos", {
		list: command({
			description:
				"Returns the todos. source=cache is what the screen shows now, source=network is what the server has.",
			args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
			run: ({ source }) => getTodos(client, source),
		}),
	});
```

Write the description for the agent: what the command does, what it returns, and
when it does nothing. It is all the agent gets.

The namespace is camelCase. `buildRegistry` keys every command as
`<namespace>.<name>` and throws on a duplicate, naming it.

## Registering the groups

Point Metro at the module that exports them, and call the hook with nothing:

```js
// metro.config.js
const { withAgentBridge } = require("agent-bridge/metro");
module.exports = withAgentBridge(getDefaultConfig(__dirname), { groups: "./src/app/agent.ts" });
```

```tsx
// src/app/agent.ts
export const agentGroups = [todosCommands(apolloClient), settingsCommands(settingsStore)];

// App.tsx
export default function App() {
	useAgentBridge();
	return; /* … */
}
```

## Using the CLI

```
agent-bridge commands
agent-bridge <namespace>.<name> [--<arg> <value> …]
agent-bridge <namespace>.<name> --args '<json>'
```

Global options: `--host` (default `localhost`), `--port` (default `8081`),
`--timeout <ms>`, `--pretty`, `--help`.

The CLI hard-codes no command. On every call it asks the app for the command list
and builds the flags from the JSON Schema it gets back, so a new command works
after a Metro reload with no CLI rebuild.

Flags follow the schema: a string takes the value as typed, `number` and `integer`
are parsed, a boolean is `--flag` or `--no-flag`, and an enum is checked against
its values before the call goes out. An object or array argument has no flag
syntax; pass the whole argument object with `--args '<json>'`, which cannot be
combined with individual flags.

Output:

- stdout holds exactly one JSON document per call: the result on success, or
  `{ "error", "code", "issues" }` on failure. `--pretty` indents it. The one
  exception is `--help`, which prints usage.
- stderr holds diagnostics for a human: the duration, the error code, a usage
  message.

| Exit code | Meaning                                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| 0         | The command ran and returned a result                                                                              |
| 1         | The command failed, or the call was wrong (`COMMAND_FAILED`, `INVALID_ARGS`, `UNKNOWN_COMMAND`, `USAGE`)           |
| 2         | The app could not be reached, or the two sides disagree on the protocol (`CONNECTION_FAILED`, `PROTOCOL_MISMATCH`) |

Exit code 2 with `CONNECTION_FAILED` usually means Metro is not running, the app
is not connected, or the app does not call `useAgentBridge`.

On the Android emulator, run `adb reverse tcp:8081 tcp:8081` once before the first
call. The iOS simulator reaches `localhost` without it.

## The MCP server

`agent-bridge-mcp` speaks MCP over stdio and exposes the same commands as tools, so
an agent calls them with typed arguments instead of shelling out. Register it by
pointing a client at the binary:

```json
{
	"mcpServers": {
		"agent-bridge": { "command": "node_modules/.bin/agent-bridge-mcp", "args": [] }
	}
}
```

It takes the same `--host`, `--port` and `--timeout` options as the CLI, or reads
`AGENT_BRIDGE_HOST`, `AGENT_BRIDGE_PORT` and `AGENT_BRIDGE_TIMEOUT`.

Each command becomes one tool, named with `_` in place of the dot - `todos.add`
becomes `todos_add` - carrying the app's own argument schema. Two tools are always
present: `commands` returns the live list and republishes the tool list if it
changed, and `run` calls a command by its `<namespace>.<name>` when the tool list has
gone stale. A failing call comes back with `isError` and the same
`{ error, code, issues }` the CLI prints.

The tool list is a snapshot taken when a client asks for it. After reloading the app,
call `commands` to pick up anything new. The server counts against the one client at
a time rule, so it and a terminal running `agent-bridge` drop each other.

Do not launch it through a package-manager script: pnpm writes its banner to stdout,
where only MCP traffic belongs.

## The web console

`pnpm --filter agent-bridge web:dev` serves the console, and the Metro Shift+M menu
opens it against a running app. It lists the commands by namespace, builds a form
from each command's JSON Schema, and shows the response with its duration, or the
error code and the Zod issues.

## Adapters

Each adapter turns one library into a command group. They are separate entry
points, so an app pays only for what it imports.

```ts
import { navigationCommands } from "agent-bridge/react-navigation";
import { apolloCommands } from "agent-bridge/apollo";
import { zustandInspect } from "agent-bridge/zustand";

export const groups = [
	navigationCommands(navigationRef, { routes: RouteName }), // nav.current, nav.navigate, nav.back
	apolloCommands(apolloClient), //                             apollo.cache, apollo.refetch
	zustandInspect({ settings: settingsStore }), //               store.get
];
```

`nav.navigate` waits until the route is focused and fails when it is not, because
React Navigation logs a warning for an unknown route rather than throwing. Types do
not exist at runtime, so pass the route names as a `z.enum` and keep it honest with
a type test against the navigator's param list.

`apollo.cache` requires a prefix: a full dump of a real app's cache is megabytes of
noise in an agent's context. `zustandInspect` is read-only on purpose — a command
that called `setState` would put the app in a state no tap can produce. Expose the
store action as a command in the feature instead.

## Keeping the bridge out of release builds

The bridge accepts any valid command from anything that can reach Metro. Two things
keep it out of a release build:

1. `agent-bridge` exports a no-op in production, so the hook and the handler are
   dropped by the bundler.
2. The app's groups are dropped too. Wrap the Metro config with `withAgentBridge`
   from `agent-bridge/metro` and import them from `agent-bridge/groups`, or keep a
   `__DEV__` require in the app's own source. A plain import ships all of them, and
   so does any runtime-deferred import: the dependency edge comes from the specifier,
   not from the call.

`pnpm --filter mobile check:release-bundle` proves it: it exports a production
bundle and fails if the bridge appears in it. Run it for `ios` and `android`.

Also keep Metro bound to localhost on a shared network, and do not point a dev
build carrying the bridge at production data.

## Known limits

- **One browser-side client at a time.** The app keeps a single client per plugin
  and drops the previous one when another connects, so the CLI and the web console
  cannot both be attached. The CLI reports it and exits 2.
- **Every connected app answers.** With a simulator and an emulator on the same
  Metro, a command runs on both and the CLI takes the first answer. Keep one device
  connected while an agent works.
- **Screen readiness is not solved.** `nav.navigate` waits for focus, not for the
  screen's queries. If agents start failing on that, add a dev-only
  `useAgentReady(route, !loading)` hook for `navigate` to wait on — not before.

## Maintenance

`cli/wire/` is copied from internal Expo code. After every Expo SDK upgrade, re-read
the files listed in `cli/wire/SOURCE.md`, recopy them if they changed, and rerun the
simulator smoke test. Pin the `expo` peer range to the tested SDK.
