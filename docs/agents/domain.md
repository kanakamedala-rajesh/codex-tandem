# Domain docs

Use a single project context: root GLOSSARY.md and docs/adr/.

Before planning or implementation, read the glossary and relevant ADRs
when present. Create them when recording resolved terms or decisions.

Also read docs/agents/planning-decisions.md for accepted planning decisions,
local Windows/WSL2 validation requirements, and the current phase status.

For profile switching and codex-as migration, read
docs/agents/profile-switching-reference.md for the inspected existing behavior
and its mapping to the TypeScript implementation requirements.

Use the approved SRS vocabulary as the starting point. Keep glossary
definitions focused on domain meaning, without implementation details.

Preserve the architecture decisions already recorded in the SRS.
Reference their source when extracting them into standalone ADRs.
Surface conflicts explicitly before changing an approved decision.

Create ADRs for consequential trade-offs, using sequential filenames.
