# CT-19: Attribute nested child work without inherited-history duplication

**Status:** Published as [GitHub #26](https://github.com/kanakamedala-rajesh/codex-tandem/issues/26). Ready for agent; unresolved blockers apply.
**Gate:** G2
**Kind:** Behavior slice
**Parent gate:** [GitHub #5](https://github.com/kanakamedala-rajesh/codex-tandem/issues/5). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Resolve parent/child observations using verified execution relationships while counting each observation once.

## Blocked by

CT-18 ([GitHub #25](https://github.com/kanakamedala-rajesh/codex-tandem/issues/25)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** ATT-005, ATT-009, COL-003.

**SRS acceptance-test IDs:** T22, T24, T25, T26.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Keep parent session, agent and child thread identifiers distinct; missing links remain unresolved until evidence arrives.
- [ ] Exclude inherited parent prefixes, forks and archived/source copies from new child usage; namespace response IDs by proven uniqueness scope.
- [ ] A child finishing late retains its evidenced original attempt identity after the parent resumes under another binding.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 nested-child/fork/archive fixtures and sanitized real Codex relationship examples on supported target combinations.

Evidence identifies the application commit (when implementation exists), package checksum,
runtime/platform/target, fixture provenance, exact commands/results and manual steps.
Use synthetic or sanitized fixtures; never retain secrets or raw conversation content.
Unavailable tests remain BLOCKED or NOT EXECUTED. Do not weaken platform security or modify
the legacy environment to manufacture a passing result.

## Scope and handoff

Implement the stated observable behavior through the required layers, with tests and a reviewable result. Resolve only technical details within the approved SRS invariants; record the chosen contract before dependent tickets rely on it.

The [accepted planning decisions](../../agents/planning-decisions.md) and
[glossary](../../../GLOSSARY.md) apply. For profile switching, use the
[behavior reference](../../agents/profile-switching-reference.md); the Go archive is not
a runtime/build dependency. The user approved dependency-ordered implementation. Package publication remains a separate release action.
