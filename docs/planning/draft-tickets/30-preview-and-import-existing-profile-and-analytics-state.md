# CT-30: Preview and import existing profile and analytics state

**Status:** Published as [GitLab #37](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/37). Ready for agent; unresolved blockers apply.
**Gate:** G4
**Kind:** Behavior slice
**Parent gate:** [GitLab #7](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/7). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Import existing codex-as/codex-report state through a backed-up preview while preserving identity uncertainty and user presentation.

## Blocked by

CT-28 ([GitLab #35](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/35)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** MIG-001, MIG-002, MIG-003, PRO-002, ATT-008, UI-007.

**SRS acceptance-test IDs:** T07, T08, T09, T10, T24, T26, T29, T30, T34, T41, T43.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Read donor state without modifying it; show candidate profiles, mappings, records/settings and conflicts before import.
- [ ] Assign stable Tandem identities without upgrading historical assertions into verified observations; preserve names/settings and same-work deduplication.
- [ ] Allow only one live credential controller per scope and provide transition/rollback instructions preserving latest refreshes.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 synthetic donor imports, unchanged-source hashes, preview/cancel cases, duplicate import and historical-label preservation evidence.

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
