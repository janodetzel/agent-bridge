## What changed

<!-- One or two sentences. Link the issue if there is one. -->

## Principle 1: new capability, new command

Principle 1 is the only one in `docs/principles.md` with no mechanical check.
Nothing can prove a button has a command equivalent, so this checklist is its
only defense.

- [ ] Every action this change adds to the UI is reachable by name through a
      command, with typed arguments — or this change adds no new capability.
- [ ] Any new entry point is declared in its feature's `spec.ts`, with a
      description that says what the command does **not** do.

## Checks

- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm depcruise`
- [ ] Verified at runtime with `pnpm app-commands` if behavior changed.
