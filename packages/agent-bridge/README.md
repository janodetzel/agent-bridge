# agent-bridge

An Expo dev tools plugin that lets an agent run typed commands against the app in
a simulator. A command calls the same store action or operation function a tap in
the UI calls, on the same instances, so what the agent verifies is what the user
gets.

Read `docs/agent-bridge-architecture.md` in the repo root for the app architecture
this package serves, and `docs/package-architecture.md` for the build plan.

## What works today

Tasks 1 to 3 of the build plan: the core protocol and handler, and the app hook.
The CLI, the adapters, and the command console still need to be built — see
[Not built yet](#not-built-yet).

## Defining a command

A command has a description written for the agent, a Zod schema for its arguments,
and an async `run`. It contains no business logic of its own: it validates, calls
the function the UI calls, and returns the result.

```ts
import { command, defineCommands } from "agent-bridge/core";
import { z } from "zod";

export const favoritesCommands = (client: ApolloClient) =>
	defineCommands("favorites", {
		list: command({
			description:
				"Returns favorites. source=cache is what the UI shows now, source=network is what the server has.",
			args: z.object({ source: z.enum(["cache", "network"]).default("cache") }),
			run: ({ source }) => getFavorites(client, source),
		}),
	});
```

`defineCommands` takes a camelCase namespace. `buildRegistry` keys every command
as `<namespace>.<name>` and throws on a duplicate, naming it.

## Registering the groups

Build the array at module scope. An array built inside a component is a new array
on every render, which rebuilds the registry and reconnects the bridge each time;
the hook warns once in development when it sees that.

```tsx
// src/agent/registry.ts
export const groups: CommandGroup[] = [demoCommands, favoritesCommands(apolloClient)];

// App.tsx
export default function App() {
	useAgentBridge(groups);
	return; /* ... */
}
```

`agent-bridge` exports a no-op in production. The hook, the handler, and every
command description stay out of a release bundle, which
`test/production-bundle.test.ts` checks by bundling the entry point with
`NODE_ENV=production` and searching the output.

## Entry points

| Subpath             | Contents                                                                          | May import React |
| ------------------- | --------------------------------------------------------------------------------- | ---------------- |
| `agent-bridge`      | `useAgentBridge`, a no-op in production                                           | yes              |
| `agent-bridge/core` | `command`, `defineCommands`, `buildRegistry`, `handleRequest`, the protocol types | no               |

A feature package imports `agent-bridge/core` only. `src/core` imports nothing
from React, React Native, Expo, React Navigation, Apollo, or Zustand, and
dependency-cruiser fails the build if that changes.

## The protocol

| Request    | Arguments                       | Returns                                                                                 |
| ---------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| `commands` | none                            | every command with its description and the JSON Schema of its arguments, sorted by name |
| `run`      | `command`, `args`, `timeoutMs?` | the result and `durationMs`                                                             |

Every response carries the `id` and `clientId` of its request, because Expo's
broadcast endpoint forwards every message to every connected client. A client
drops what is not addressed to it.

A failure comes back as one of six codes: `UNKNOWN_COMMAND`, `INVALID_ARGS` (with
the Zod issues, so the agent can fix the call without guessing), `COMMAND_FAILED`,
`TIMEOUT`, `NOT_SERIALIZABLE` (with the path of the first bad value, for example
`result.items[3].createdAt`), and `PROTOCOL_MISMATCH`.

The timeout defaults to 10 seconds. On a timeout the handler answers immediately
and leaves the command to settle on its own.

## Results must survive JSON

`toJsonSafe` turns a `Date` into an ISO string and drops `undefined` from objects.
It fails, naming the path, on `Map`, `Set`, functions, symbols, `BigInt`, `NaN`,
`Infinity`, and cycles. Return picked fields rather than a whole store state: a
Zustand state object carries its actions, and functions do not survive JSON.

## Not built yet

Tasks 4 to 9 of `docs/package-architecture.md`:

- `cli/` — the wire format copied from the installed `expo` package, the client,
  and the `agent-bridge` binary.
- `src/adapters/` — `agent-bridge/react-navigation`, `agent-bridge/apollo`, and
  `agent-bridge/zustand`. Their subpaths are absent from `exports` until they
  exist.
- `webui/` — still the scaffold from `create-dev-plugin`, to be replaced by the
  command console.

## Maintenance

`cli/` will depend on internal Expo code. After every Expo SDK upgrade, recopy the
wire format if its source files changed, record the version in `cli/wire/SOURCE.md`,
and rerun the simulator smoke test.
