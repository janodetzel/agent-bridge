# Where this code came from

`cli/wire/` talks to Metro's dev tools endpoint the same way the plugin's web UI
does. The format is internal to Expo and has changed before, so the code here is
copied from the installed packages rather than written from memory.

Copied on 2026-09-11 from:

| Installed package | Version             | File                                                                          |
| ----------------- | ------------------- | ----------------------------------------------------------------------------- |
| `@expo/devtools`  | 57.0.1              | `build/MessageFramePacker.js` (and its `.d.ts`)                               |
| `@expo/devtools`  | 57.0.1              | `build/DevToolsPluginClient.js`                                               |
| `@expo/devtools`  | 57.0.1              | `build/DevToolsPluginClientImplBrowser.js`                                    |
| `@expo/devtools`  | 57.0.1              | `build/ProtocolVersion.js`                                                    |
| `expo`            | 57.0.22             | `devtools.js`, which is now only `module.exports = require('@expo/devtools')` |
| `@expo/cli`       | bundled with SDK 57 | `build/src/start/server/metro/DevToolsPluginWebsocketEndpoint.js`             |

## Differences from the brief

The brief points at `node_modules/expo/src/devtools/` or
`node_modules/expo/build/devtools/`. Neither exists in SDK 57: the dev tools
client moved into its own `@expo/devtools` package, and `expo/devtools` is a
re-export. `DevToolsPluginClientImplBrowser` still exists, under the new package.

## What was copied, and what was adapted

- `MessageFramePacker.ts` is a straight port of the packer to TypeScript. The only
  change is the `Blob` path: Node has `Blob.prototype.arrayBuffer`, so the
  `FileReader` fallback in `utils/blobUtils.js` is dropped.
- `connection.ts` takes the browser half of `DevToolsPluginClient` and
  `DevToolsPluginClientImplBrowser`: the endpoint path, the handshake message, the
  `__isHandshakeMessages` envelope, the `pluginName` filter, and the
  `terminateBrowserClient` handling. Left out are the reconnect wrapper
  (`WebSocketWithReconnect`) and the shared `WebSocketBackingStore`, which exist to
  let several plugins in one app share a socket. The CLI is one process with one
  plugin and one connection, and it should fail rather than silently reconnect.
- The CLI uses the `ws` package instead of a global `WebSocket`, so it runs the
  same way on Node 20 and Node 22 or later.

## The protocol, as observed

1. The client opens `ws://<host>:<port>/expo-dev-plugins/broadcast`. The server
   (`DevToolsPluginWebsocketEndpoint`) forwards every message to every _other_
   connected client. It reads nothing and answers nothing itself.
2. The browser side sends, as a plain JSON string:

   ```json
   {
   	"protocolVersion": 1,
   	"pluginName": "commands",
   	"method": "handshake",
   	"browserClientId": "1757619000000",
   	"__isHandshakeMessages": true
   }
   ```

   `browserClientId` is `Date.now().toString()` in Expo's implementation.

3. Ordinary messages are packed by `MessageFramePacker`. A plain-object payload
   takes the fast path and goes out as
   `{"messageKey":{"pluginName":"commands","method":"request"},"payload":{…}}`.

## Answer to open question 2: several browser clients of one plugin

**No. The app keeps exactly one.** `DevToolsPluginClientImplApp.addHandshakeHandler`
keeps a `pluginName -> browserClientId` map. When a handshake arrives for a plugin
that already has a different client, the app sends `terminateBrowserClient` for the
_previous_ id, and that client closes itself.

For this repo that means the CLI and the command console cannot be connected to
the `commands` plugin at the same time: whichever connects second kicks the first. This is
not worked around. The CLI reports it as a connection error and exits with code 2.

Verified against a running app, not only read from the source: with the app in the
iOS simulator, a second CLI client connected, and the first client's next request
came back as `the app dropped this client`.

## One more thing the endpoint does: every connected app answers

The broadcast endpoint forwards a request to every client, and that includes a
second _app_. With the iOS simulator and the Android emulator both on the same
Metro, `nav.navigate --screen Settings` moved both of them, and the CLI resolved on
whichever response arrived first. Keep one device connected while an agent works,
or the run and the screen it checks may belong to different devices.

## Answer to open question 4 from the brief: `z.toJSONSchema` output

Every sample command produces a schema the CLI flag parser and the web UI form
both handle: `z.enum` becomes `enum`, `z.string().min(1)` becomes
`minLength`, `z.number().int()` becomes `integer`, and `z.record` becomes an
object with `additionalProperties`.

Two things to know:

- The handler generates schemas with `io: "input"`, so an argument with
  `.default()` stays out of `required` and the caller may omit it.
- It also passes `unrepresentable: "any"`, so an argument type JSON Schema cannot
  express - `z.date()`, `z.bigint()`, `z.map()`, `z.symbol()` - becomes `{}` rather
  than throwing and taking the whole listing down. Such an argument renders as a
  text field and has to be sent with `--args`. Prefer argument types that survive
  JSON: take an ISO string instead of a `Date`.

## Maintenance

After every Expo SDK upgrade, re-read the files in the table. If they changed,
recopy them, update the versions above, and rerun the simulator smoke test in
`docs/package-architecture.md` task 8.
