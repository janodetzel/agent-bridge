---
name: driving-the-app
description: Run commands against the app in a simulator with `pnpm cmd` to verify behavior, read state, or navigate. Use when checking whether a change actually works at runtime, when inspecting the Apollo cache or a Zustand store, when a bug reproduces only in the running app, or when a task says to verify in the simulator. Covers the exit codes, the cache-versus-network check, the connection rules, and when to reach for the ios-simulator or android-emulator skills instead.
---

# Driving the app from the CLI

The running app exposes its business logic over Metro. A command calls the same
store action or operation function a tap calls, on the same instances, so what you
verify here is what a user gets.

## Before the first call

1. Metro and a simulator must be running: `pnpm --filter example-app start`, then press
   `i` for iOS or `a` for Android. Exit code 2 means nothing is connected.
2. On an Android emulator, run `adb reverse tcp:8081 tcp:8081` once.
3. After changing app code, reload the app (press `r` in Metro) before running
   commands. The bridge serves the bundle the app is currently running.

## Finding out what exists

```
pnpm cmd commands
```

Returns every command with its description and the JSON Schema of its arguments.
Never guess a command name: the list is the contract, and it changes with the app,
not with the CLI.

## Calling a command

```
pnpm cmd todos.add --title "Buy milk"
pnpm cmd todos.list --source cache
pnpm cmd settings.setUnits --units mi
pnpm cmd nav.navigate --screen Settings
```

Flags come from the schema: strings take the value as typed, numbers are parsed, a
boolean is `--flag` or `--no-flag`, and an enum is checked before the call goes out.
An object or array argument has no flag; pass the whole argument object as JSON with
`--args '{"…":…}'`, which cannot be combined with individual flags.

Useful globals: `--pretty` to indent, `--timeout <ms>` for a slow command, `--host`
and `--port` for a dev server that is not `localhost:8081`.

## Reading the result

stdout is exactly one JSON document per call, so it can be piped into `jq`. stderr
carries the duration and the error, for a human.

| Exit | Meaning                                                      | What to do                                                                   |
| ---- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 0    | The command ran                                              | Read the result on stdout                                                    |
| 1    | `COMMAND_FAILED`, `INVALID_ARGS`, `UNKNOWN_COMMAND`, `USAGE` | `INVALID_ARGS` carries the Zod issues; fix the call from those, do not guess |
| 2    | `CONNECTION_FAILED` or `PROTOCOL_MISMATCH`                   | Start Metro and the app, or rebuild the package and reload                   |

## The check that finds cache bugs

After a mutation that touches server data, compare the two sources, **cache first**:

```
pnpm cmd todos.list --source cache
pnpm cmd todos.list --source network
```

They must match. A difference means the `update` in the feature's operation
function is wrong: the screen looks right until the next refetch, which is why this
class of bug is otherwise hard to see. Read `cache` first — a `network-only` query
writes its result into the cache and hides the bug from every later `cache` read.

## Rules of the connection

- **One client at a time.** The app keeps a single CLI, web console, or MCP server
  and drops the previous one when another connects. A dropped client's next call
  fails with exit 2 saying the app dropped it. Close the web console before working
  from the CLI.
- **Every connected device answers.** With a simulator and an emulator both on
  Metro, a command runs on both and the CLI reports whichever answered first. Keep
  one device connected.

## The same commands as MCP tools

`.mcp.json` at the workspace root registers an `app-commands` MCP server, which
exposes every command as a tool named with `_` in place of the dot - `todos.add`
becomes `todos_add` - with the app's own argument schema. If those tools are in
your tool list, prefer them: they are the same commands over the same client, and
the arguments are checked before the call.

Two rules carry over. The tool list is a snapshot, so after reloading the app call
the `commands` tool to pick up anything new; and the server counts against the one
client at a time rule below, so a `pnpm cmd` call in a terminal and a tool
call drop each other.

## When to use the simulator skills instead

The `ios-simulator` and `android-emulator` skills drive the device through
`agent-device`: they tap, type, scroll, and read the live UI tree. They answer a
different question than this bridge does.

| Question                                                                   | Reach for                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Did the mutation land? What is in the cache or the store?                  | `pnpm cmd <command>`                                         |
| Do cache and server agree after a write?                                   | `pnpm cmd todos.list --source cache` then `--source network` |
| Does the screen render that state correctly?                               | `ios-simulator` / `android-emulator`                         |
| Is the button actually wired to the logic? Does the flow work when tapped? | `ios-simulator` / `android-emulator`                         |
| Which screen is focused, and can I get to another one?                     | either: `nav.navigate` is faster, a tap is more faithful     |

A command calls the same function a tap calls, which is the point — but that also
means it never exercises the tap handler, the disabled state, or the layout. Only a
real tap does. Conversely, reading a list off the screen tells you what rendered,
not what the cache holds, and those differ exactly when a cache update is broken.

The two work well together: set state up with commands, which is fast and exact,
then check the rendering with `agent-device`. For example, `todos.add` three items
and `nav.navigate --screen Home`, then snapshot the screen to see how the list
looks. `agent-device` talks to the device directly rather than through Metro's
plugin channel, so it does not count against the one-client rule below.

## What not to do

- Do not verify data with screenshots or the UI tree. Use the data commands; use
  `nav.navigate` only to put the app on a screen for a rendering check, and the
  simulator skills to judge that rendering.
- Do not add a command that reaches around the UI's code path. A command calls the
  function the screen calls, or it verifies nothing.
- Do not point a dev build carrying the bridge at production data. It accepts any
  command from anything that can reach Metro.
