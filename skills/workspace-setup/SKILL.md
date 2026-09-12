---
name: workspace-setup
description: Install, build, and run this pnpm workspace, and get the app onto an iOS simulator or Android emulator. Use when setting the repo up for the first time, when a build or test fails in a way that smells like the environment, when adding a package or dependency to the workspace, or when a command such as `pnpm agent-bridge` is not found. Includes the checks to run before calling a change done.
---

# Working in this workspace

A pnpm workspace with one package and one app:

```
packages/agent-bridge/   The Expo dev tools plugin: core, app hook, CLI, web console
apps/mobile/             A todo-list example that registers its commands
```

## Setting up

```
pnpm install       # also builds the plugin through its prepare script
pnpm build         # src -> build, and cli -> build/cli
```

`pnpm install` links the `agent-bridge` binary into `node_modules/.bin` because the
root package depends on the workspace package. If `pnpm agent-bridge` is not found,
that dependency is missing.

## The checks

Run all four before calling a change done:

```
pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise
```

- `pnpm test` builds first on purpose: the CLI integration test runs the built
  binary, not the sources.
- `pnpm depcruise` enforces the layers inside `packages/agent-bridge`. When a rule
  blocks you, move the code; do not widen the rule.
- `pnpm --filter mobile check:release-bundle` exports a production bundle and fails
  if the bridge appears in it. Run it after touching `App.tsx`, `commands.ts`, or the
  package entry point.

## Running the app

```
pnpm --filter mobile start     # then press i for iOS, a for Android
```

On Android, run `adb reverse tcp:8081 tcp:8081` once so the app and the CLI meet on
port 8081. iOS reaches `localhost` without it.

The web console for the plugin: `pnpm --filter agent-bridge web:dev`, or open it
from Metro's Shift+M menu against a running app.

## Adding a dependency

- To the app: `cd apps/mobile && npx expo install <pkg>` so the version matches the
  SDK. Plain `pnpm add` there will eventually break a native build.
- To the plugin: `pnpm --filter agent-bridge add <pkg>`. A library an adapter binds
  to belongs in `peerDependenciesMeta` as optional, plus a dev dependency for types.
- The workspace uses `node-linker=hoisted`. Metro and React Native resolve modules
  by walking `node_modules`, and pnpm's isolated store breaks that.

## Troubleshooting

| Symptom                                  | Cause                                                                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `agent-bridge: command not found`        | The root package does not depend on `agent-bridge`, so pnpm linked no binary                                                              |
| CLI exits 2 with `CONNECTION_FAILED`     | Metro is not running, no app is connected, or the app does not call `useAgentBridge`                                                      |
| CLI exits 2 with `PROTOCOL_MISMATCH`     | The built CLI and the running app disagree. `pnpm build`, then reload the app                                                             |
| A CLI change seems to do nothing         | `pnpm build` only rebuilds what its script covers; the binary runs from `build/cli`                                                       |
| `Duplicate "graphql" modules` in a test  | A dependency is externalized and loads its own copy. Add it to `server.deps.inline` in `vitest.config.mts`                                |
| `expo install --check` flags TypeScript  | Deliberate: TS 6 requires an explicit `rootDir` that the generated expo-module tsconfig does not set, and that file is generated          |
| Adapter test cannot parse `react-native` | Tests alias `react-native` to `react-native-web` and inline `@react-navigation/*`; a new RN-importing dependency needs the same treatment |

## Things that are generated

`packages/agent-bridge/tsconfig.json`, `babel.config.js`, `.eslintrc.js`, and
`expo-module.config.json` come from `expo-module-scripts` and are rewritten on every
install. Do not hand-edit them; change the script or the root config instead. The
workspace lints from one flat config at the root, so the regenerated `.eslintrc.js`
is ignored.
