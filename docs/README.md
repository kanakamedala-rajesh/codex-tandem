# Documentation

The version 1.0 requirements baseline is dated September 30, 2026.
Implementation and acceptance tests have not been executed for this baseline.

| Document                                                                      | Purpose                                                                     |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [System Requirements Specification](requirements/Codex-Tandem-SRS-v1.0.md)    | Product scope, architecture decisions, interfaces, and acceptance criteria. |
| [Requirements register](requirements/Codex-Tandem-Requirements-Register.json) | Authoritative requirements and requirement-to-test traceability.            |
| [Word specification](requirements/exports/Codex-Tandem-SRS-v1.0.docx)         | Word copy of the version 1.0 specification.                                 |

Keep requirements documents together in `requirements/` and their exported
document copies in `requirements/exports/`.

## Implementation planning

The approved spec and 38 implementation tasks are published in GitLab.
The [central G0–G4 tracker](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/1) links the five gate Issues,
each with native child Tasks. The [publication mapping](planning/gitlab-map.json)
records the exact issue IDs. Product acceptance tests remain NOT EXECUTED.

| Document                                                             | Purpose                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| [Implementation specification](planning/implementation-spec.md)      | Agreed scope, user stories, architecture, testing boundaries and delivery constraints. |
| [Ticket plan](planning/ticket-plan.md)                               | Numbered G0–G4 breakdown with blockers and links to 38 individual tickets.             |
| [Traceability matrix](planning/traceability.md)                      | Mapping of all 119 requirements and 45 acceptance-test families to tickets.            |
| [Accepted planning decisions](agents/planning-decisions.md)          | Grill decisions, mandatory local Windows/WSL2 validation and planning status.          |
| [Profile-switching reference](agents/profile-switching-reference.md) | Existing Go behavior to reimplement and improve in TypeScript.                         |
| [Project glossary](../GLOSSARY.md)                                   | Shared domain terminology.                                                             |

## Cross-platform editing

Text files use UTF-8 and LF line endings on Windows and Unix. The repository's
`.gitattributes` enforces Git line-ending behavior, and `.editorconfig` provides
matching defaults for compatible editors. Windows `.bat` and `.cmd` scripts use
CRLF in the working tree. Word documents are binary and must not undergo
line-ending conversion.
