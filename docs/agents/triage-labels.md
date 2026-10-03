# Triage labels

The five canonical skill roles map to identically named GitHub labels.

| Skill role      | GitHub label      | Meaning                                                                          |
| --------------- | ----------------- | -------------------------------------------------------------------------------- |
| needs-triage    | `needs-triage`    | Needs initial evaluation.                                                        |
| needs-info      | `needs-info`      | Waiting for missing information.                                                 |
| ready-for-agent | `ready-for-agent` | Specified sufficiently for agent implementation; check blockers before starting. |
| ready-for-human | `ready-for-human` | Requires human implementation.                                                   |
| wontfix         | `wontfix`         | Will not be implemented.                                                         |

## Supplementary labels

| GitHub label    | Meaning                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------ |
| `help-needed`   | Needs assistance, expertise, access, or a decision.                                        |
| `blocked`       | Cannot proceed; the issue must identify the blocker.                                       |
| `bug`           | Incorrect behavior.                                                                        |
| `enhancement`   | New or improved functionality.                                                             |
| `documentation` | Documentation work.                                                                        |
| `feature`       | Preserved source label for feature work; retain it alongside `enhancement` where imported. |

Supplementary labels can coexist with a triage label. Blocking relationships
remain the source of truth for ticket dependencies. Preserve imported label names,
colors and descriptions through the migration manifest; the documented `feature`
label records an existing source label, not a relabeling of imported issues.
