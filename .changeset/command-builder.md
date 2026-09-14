---
"@janodetzel/app-commands": minor
---

Define commands in the style of tRPC procedures: `command().input(schema).description("...").run(handler)`.

- New `command()` builder, exported from the package root. `.input()` takes any Standard Schema (zod, Valibot, ArkType), an object of them, or a validator function. The handler's argument type comes from the schema. The result is a core `Command` that is also a function the UI calls: a direct call validates, rejecting with `InputError`, while `run` skips validation for a caller that has already parsed.
- New `featureCommands(tree)`, exported from the package root, collects the commands built with `command()` and replaces `featureCommands(...features)` from `/adapters/feature-kit`. Its keys are the namespaces. Nested plain objects add a segment (`profile.settings.setUnits`), and a spread merges two features into one namespace.
- `Command.parse` may return a promise. `handleRequest` and `checkRegistry` await it. The wire protocol is unchanged.
- `checkRegistry` accepts names with more than two segments.
- Breaking: removed the `/adapters/feature-kit` entry point and the `@janodetzel/feature-kit` peer dependency.
- Breaking: removed the `/adapters/zod` entry point (`zodCommands`, `fromZod`). Use `command()` with a zod schema. The apollo, react-navigation and zustand adapters are built on `command()` now, and `navigationCommands`' `routes` option takes any Standard Schema of a string.
- The optional `zod` peer dependency is `^4.2.0`, the first release with the `~standard.jsonSchema` extension that command listings read.
- `@janodetzel/feature-kit` is merged into this package. Its ESLint plugin is `@janodetzel/app-commands/eslint`, with rules renamed from `feature-kit/*` to `app-commands/*`, and its dependency-cruiser rule is `@janodetzel/app-commands/depcruise`. `defineFeature`, `META` and `Spec` are gone; define entry points with `command()`. `no-ui-in-logic` and `no-ambient-io` now treat every non-test file under `src/features/`, at any depth, as a logic file; pass `logicFiles` to narrow it back to names for a layout that keeps screens inside feature folders. The depcruise `rules()` add `no-deep-feature-import` and `features-do-not-import-the-app`.
