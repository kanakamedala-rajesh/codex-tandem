# Triage labels

The five canonical skill roles map to identically named GitLab labels.

| Skill role | GitLab label | Meaning |
| --- | --- | --- |
| needs-triage | `needs-triage` | Needs initial evaluation. |
| needs-info | `needs-info` | Waiting for missing information. |
| ready-for-agent | `ready-for-agent` | Specified sufficiently for agent implementation; check blockers before starting. |
| ready-for-human | `ready-for-human` | Requires human implementation. |
| wontfix | `wontfix` | Will not be implemented. |

## Supplementary labels

| GitLab label | Meaning |
| --- | --- |
| `help-needed` | Needs assistance, expertise, access, or a decision. |
| `blocked` | Cannot proceed; the issue must identify the blocker. |
| `bug` | Incorrect behavior. |
| `enhancement` | New or improved functionality. |
| `documentation` | Documentation work. |

Supplementary labels can coexist with a triage label. Blocking relationships
remain the source of truth for ticket dependencies.
