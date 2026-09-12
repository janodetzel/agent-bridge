---
name: maintaining-app-commands
description: Work on the app-commands package itself - the core protocol, the app hook, the CLI and its copied Expo wire format, the adapters, and the web console. Use when changing the request or response shape, adding an adapter or a CLI flag, fixing the connection, after an Expo SDK upgrade, or when a change must stay out of release bundles.
---

# Maintaining the app-commands package

```
packages/app-commands/
	src/core/       protocol, Command/Registry, handleRequest, toJsonSafe - imports NOTHING
	src/app/        useAgentBridge, and the transport-agnostic attach()
	src/adapters/   one file per library, each importing only that library, zod, and core
	src/index.ts    the production no-op
	cli/            client, flags, entry point
	cli/wire/       copied from Expo - see SOURCE.md
	mcp/            the MCP server, over cli/client.ts
	webui/          the command console
```

`src/core` importing nothing is the rule the package exists to keep. A `Command` is
a description, a JSON Schema, a `parse` function and a `run` function, so the bridge
works against an app built on Redux, XState, MobX or plain service classes - and
against Valibot or ArkType, because `parse` is a function rather than a schema
object. zod lives in the adapter layer, where `adapters/zod.ts` is the single place
a schema becomes `jsonSchema` + `parse`. `packages/feature-kit` is a separate package
that never imports this one; `src/adapters/feature-kit.ts` adapts it, like Apollo.

`pnpm depcruise` enforces the layers. The rules match resolved paths under
`node_modules`, not dependency-cruiser's dependency types, because an import of a
package the importer does not declare has no type to match - and that is exactly the
import worth catching. After changing a rule, plant a violation and confirm it fails
before trusting a green run.

## Changing the protocol

`src/core/protocol.ts` holds the wire types and `PROTOCOL_VERSION`. Bump the version
whenever a request or response shape changes; the handler answers
`PROTOCOL_MISMATCH` and names both sides, and the CLI turns that into exit 2 with a
message saying what to rebuild. Both halves are built from the same source, so a
mismatch in practice means a stale build or a stale app - say so rather than adding
compatibility shims.

`handleRequest` takes a registry and a request and nothing else. It calls `parse`,
then `run`, then serializes; it has no notion of a feature, a namespace or a spec.
Keep it that way: the app hook, the tests, and the fake app peer all share that one
code path, which is why the tests are worth anything.

`CommandInfo.args` is the wire name for a command's JSON Schema. The CLI, the MCP
server and the web UI all read it and nothing else, so renaming it is a protocol
change even though nothing in `src/` would fail to compile.

## Adding an adapter

One factory returning a `Registry` slice with its keys already namespaced, in
`src/adapters/<lib>.ts`, plus an entry in the `exports` map pointing at
`./build/adapters/<lib>.js`. Build the slice with `zodCommands(namespace, {...})`
from `adapters/zod.ts`: it infers a schema per entry and checks that entry's handler
against it, so a handler destructuring a field its schema does not declare is a
compile error.

Take a `namespace` option, defaulting to something short, for an app that already
uses the name. The library goes in `peerDependenciesMeta` as optional and in
`devDependencies` for types, and in `.dependency-cruiser.cjs`'s `ADAPTER_LIBRARIES`
so the new adapter may reach it and nothing else. Tests build real instances and call
through `handleRequest`; no React rendering.

Read-only by default. `zustandInspect` exposes no writer on purpose: a command that
called `setState` would put the app in a state no tap can produce.

## The CLI

`cli/` compiles to CommonJS into `build/cli` (the `src` build is ESM), which is why
`cli/tsconfig.json` exists and why `build/src/core/protocol.js` appears - the CLI's
copy of the constants. `pnpm build` builds both halves; a CLI change that seems to
do nothing is usually a stale `build/cli`.

The CLI hard-codes no command. It fetches `commands` on every call and builds flags
from the JSON Schema, so a new command works after a Metro reload with no CLI
rebuild. Keep it that way. Validate locally only what the flag parser needs - the
app owns validation and answers `INVALID_ARGS` with the Zod issues.

stdout stays exactly one JSON document per call. Diagnostics go to stderr.

## The MCP server

`mcp/` is a second front end over `cli/client.ts`, not a wrapper around the binary.
It hard-codes no command either: every command becomes a tool, built from the JSON
Schema the app reports, with the dot in the name replaced by `_`. The two tools that
are always there - `commands` and `run` - exist because a client starts the server
before Metro is up, so the first `tools/list` finds no app. Answering it with those
two rather than an error keeps `commands` reachable, and calling it once the app is
up sends `tools/list_changed`.

Three things to keep:

- **Connect per call, like the CLI.** The app keeps one client at a time. A resident
  server would drop a terminal running `appcmd` and be dropped by it in turn.
- **Nothing but MCP traffic on stdout.** `cli/client.ts` and `cli/wire/` are silent,
  which is what makes them reusable here. Diagnostics go to stderr, and `.mcp.json`
  runs `node_modules/.bin/appcmd-mcp` rather than a `pnpm` script, because
  pnpm writes its banner to stdout.
- **The app still owns validation.** The schema goes through untouched but for
  `$schema`, and a failure comes back as `isError` carrying the same
  `{ error, code, issues }` the CLI prints.

It builds with `tsc -p mcp/tsconfig.json`, not `expo-module build`, which knows only
`plugin`, `cli`, `utils` and `scripts` and treats anything else as a file to
compile. `expo-module prepare` has the same list, so `build:mcp` hangs off `prepare`
and `prepublishOnly` too - drop it and `pnpm install` leaves the binary missing. The
tsconfig resolves as `node16` because the MCP SDK ships behind an `exports` map.

## After an Expo SDK upgrade

`cli/wire/` is copied from internal Expo code that has changed before.

1. Re-read the files listed in `cli/wire/SOURCE.md` in the newly installed packages.
2. If they changed, recopy them, adapt for Node, and update the versions and paths
   in `SOURCE.md` - including anything that moved, as the dev tools client did when
   it became `@expo/devtools`.
3. Rerun the integration tests, then the simulator smoke test.
4. Pin the `expo` peer range to the SDK you tested.

Never write the frame format or the handshake from memory.

## Keeping it out of release builds

The bridge accepts any valid command from anything that can reach Metro, so nothing
in a release build may be able to answer one. `src/index.ts` exports a no-op in
production behind a lazy `require`, in a branch the bundler folds away, which drops
the hook and the handler. Written any other way - a plain import, a thunk, a getter -
it ships: the dependency edge comes from the specifier, not from the call.

`test/production-bundle.test.ts` checks that with esbuild;
`pnpm --filter example-app check:release-bundle` checks the whole app for both platforms.
Keep the strings that check greps for out of user-facing copy, or it turns into noise
people learn to ignore.

The check greps for the transport and nothing else. The schemas, the descriptions and
`handleRequest` itself do reach a release bundle - the app pulls the handler in when
it imports `buildRegistry` from `@janodetzel/app-commands` - but none of it is reachable
without a socket, so it is bundle size rather than exposure. Checking for it would
only teach people to ignore a failing check.

## Testing

- `test/core.test.ts` - the handler, every error code, serialization. Every registry
  in it is built by hand, with a literal JSON Schema and a plain `parse`. That is
  the point: if it ever needs zod or feature-kit to express itself, the layering has
  leaked and the bridge has stopped being agnostic.
- `test/adapters.test.ts` - real library instances through `handleRequest`, including
  the feature-kit adapter's duplicate, missing-handler and symbol-collision cases.
- `test/cli.integration.test.ts` - the built binary against `test/fake-broadcaster.ts`,
  a local copy of Metro's endpoint plus a fake app peer. It covers every exit code.
- `test/mcp.integration.test.ts` - the built MCP binary against the same broadcaster,
  driven by a real MCP client, plus the tool-name mapping on its own.
- The fake app peer imitates the real one, including dropping a browser client when
  a second connects. Options exist to turn that off for tests that need two clients;
  do not make the production client work around it.
