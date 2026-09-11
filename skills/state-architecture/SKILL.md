---
name: state-architecture
description: Choose how a feature holds state - Zustand stores with operation functions, XState for one flow-heavy feature, or a TCA-style reducer architecture - and keep the choice drivable from the CLI. Use when starting a feature with multi-step flow, cancellation, or races, when tempted to reach for Redux, TCA, or a custom reducer runtime, when someone asks why this repo does not use one, or when state is spread across places a command cannot reach.
---

# Choosing how state is held

Any choice has to keep four properties, because the CLI depends on them. Lose one
and commands stop verifying what the user sees.

| Property                            | Why the bridge needs it                                                                                    |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| One instance, created outside React | A command runs outside the tree. State created in a component is unreachable.                              |
| Actions that can be awaited         | A command reports success when its promise resolves. Fire-and-forget reports success before the work runs. |
| Dependencies passed in              | A test needs in-memory storage and a fixed clock to reproduce what a command did.                          |
| Serializable state                  | A result crosses a WebSocket as JSON. Functions, `Map`, `Set`, and cycles fail the command.                |

## The default: Zustand plus operation functions

Client state lives in a vanilla Zustand store built by a factory that takes its
dependencies. Server state lives in Apollo's cache, with one operation function per
mutation owning its cache update. Both are module singletons in
`src/app/instances.ts`. This is what `todos` and `settings` do, and it is the right
starting point for a new feature.

It gives all four properties with very little code. What it does not give:

- Nothing forces a change to go through a named action, so `set` discipline is a
  lint rule rather than a guarantee.
- Tests assert what you write down; there is no recorded action log to replay.
- Cancellation and races are yours to handle with `AbortController`.

## When a feature has real flow logic: XState, for that feature only

Reach for a state machine when the feature has states that constrain what may
happen next: a multi-step checkout, an upload with retry and cancel, anything where
"what is allowed right now" is the hard part and a boolean soup is forming.

Use it for that one feature. Do not convert the app.

To keep it drivable: create the actor once in `src/app/instances.ts`
(`createActor(machine).start()`), expose commands that `send` an event **and wait
for the resulting state** rather than returning immediately, and make the command
return a picked snapshot (`actor.getSnapshot().value` plus the context fields you
care about, never the snapshot object). Waiting matters for the same reason
`nav.navigate` waits for focus: a send that lands in a state that ignores it looks
like success.

## TCA and reducer architectures: what they buy, and the trade taken here

A Composable Architecture-style runtime - one `State`, one `Action` enum, a reducer,
effects as values, dependencies in an environment - would also satisfy all four
properties, and it would satisfy them by construction rather than by convention.
Every change has a name, every effect is a value you can inspect, and a test is a
list of actions with expected state after each.

This repo does not use one because the cost is a custom runtime - a store type, an
effect type, cancellation, scoping, and the tooling around them - for benefits that
Zustand, Apollo, and plain async functions already give at about a third of the
code. The architecture doc records this as a deliberate trade, not an oversight.

If you are asked to introduce one anyway, or you are porting a feature from a
TCA codebase:

- Keep the store a module singleton and keep `send` awaitable, or return a promise
  that resolves when the effects it started have settled. A command that resolves
  when the action is merely enqueued reports success too early.
- Keep dependencies in the environment, constructed in `src/app/instances.ts`.
- Expose commands that send named actions and read back picked state. Do not expose
  a generic "send any action" command: it lets an agent put the app in states no tap
  can produce, which is the same reason the Zustand adapter is read-only.
- Adopt it for one feature and measure the code it costs before spreading it.

## Things to avoid whatever you choose

- **State inside a provider only.** A context value a command cannot import is
  invisible to the bridge. If you add a provider, still create the value outside and
  pass it in.
- **Server data copied into client state.** Two sources of truth make the
  `--source cache` / `--source network` check meaningless. Keep server data in
  Apollo's cache.
- **A write command that bypasses the UI's path.** Expose the action the screen
  calls. A command that pokes state directly verifies nothing.
- **Navigation inside business logic.** Actions and operation functions return
  results; screens decide where to go. Otherwise a CLI call changes screens as a
  side effect.
