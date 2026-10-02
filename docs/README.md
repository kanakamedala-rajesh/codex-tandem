# Documentation

The version 1.0 requirements baseline is dated September 30, 2026.
Implementation and acceptance tests have not been executed for this baseline.

| Document | Purpose |
| --- | --- |
| [System Requirements Specification](requirements/Codex-Tandem-SRS-v1.0.md) | Product scope, architecture decisions, interfaces, and acceptance criteria. |
| [Requirements register](requirements/Codex-Tandem-Requirements-Register.json) | Authoritative requirements and requirement-to-test traceability. |
| [Word specification](requirements/exports/Codex-Tandem-SRS-v1.0.docx) | Word copy of the version 1.0 specification. |

Keep requirements documents together in `requirements/` and their exported
document copies in `requirements/exports/`.

## Cross-platform editing

Text files use UTF-8 and LF line endings on Windows and Unix. The repository's
`.gitattributes` enforces Git line-ending behavior, and `.editorconfig` provides
matching defaults for compatible editors. Windows `.bat` and `.cmd` scripts use
CRLF in the working tree. Word documents are binary and must not undergo
line-ending conversion.
