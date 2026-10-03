# CT-20: Expose unknown, imported and conflicting attribution

**Status:** Published as [GitHub #27](https://github.com/kanakamedala-rajesh/codex-tandem/issues/27). Ready for agent; unresolved blockers apply.
**Gate:** G2
**Kind:** Behavior slice
**Parent gate:** [GitHub #5](https://github.com/kanakamedala-rajesh/codex-tandem/issues/5). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Make incomplete or contradictory ownership explicit and support audited deterministic automatic reconciliation.

## Blocked by

CT-19 ([GitHub #26](https://github.com/kanakamedala-rajesh/codex-tandem/issues/26)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** ATT-007, ATT-008, ATT-010, ATT-012, ATT-013.

**SRS acceptance-test IDs:** T23, T24, T26, T29, T30, T31, T32.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Keep direct evidence, verified inheritance, imported operator assertions, unknowns and conflicts distinct.
- [ ] Never assign an uncertain cumulative interval wholly to the newer account or use ingestion order to settle contradictions.
- [ ] Store resolution revisions/provenance without raw content; preserve imported assertions without adding a new manual correction interface.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 order-independent evidence tests, stronger-evidence reconciliation, cross-account uncertain-delta cases and visible report-state fixtures.

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
