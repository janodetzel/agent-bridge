# Skills

Instructions for agents working in this repo. Each folder holds one `SKILL.md`; the
frontmatter `description` is what an agent reads to decide whether the skill applies.

| Skill                      | Use it when                                                                                       |
| -------------------------- | ------------------------------------------------------------------------------------------------- |
| `driving-the-app`          | Verifying behavior at runtime with `pnpm agent-bridge`                                            |
| `workspace-setup`          | Installing, building, running the app, or debugging the environment                               |
| `building-a-feature`       | Adding a screen, a store, a mutation, or a command                                                |
| `state-architecture`       | Choosing how a feature holds state, including whether to reach for a machine or a reducer runtime |
| `maintaining-agent-bridge` | Changing the plugin itself: protocol, CLI, adapters, wire format                                  |

`.claude/skills` symlinks to this directory, which is how Claude Code finds them.
`CLAUDE.md` stays the short always-loaded summary; the detail lives here.
