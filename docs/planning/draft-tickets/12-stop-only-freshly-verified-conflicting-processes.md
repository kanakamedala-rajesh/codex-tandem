# CT-12: Stop only freshly verified conflicting processes

**Status:** Published as [GitHub #19](https://github.com/kanakamedala-rajesh/codex-tandem/issues/19). Ready for agent; unresolved blockers apply.
**Gate:** G1
**Kind:** Behavior slice
**Parent gate:** [GitHub #4](https://github.com/kanakamedala-rajesh/codex-tandem/issues/4). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Offer scoped graceful shutdown and separately approved force termination without changing credentials on cancellation.

## Blocked by

CT-11 ([GitHub #18](https://github.com/kanakamedala-rajesh/codex-tandem/issues/18)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** PROC-002, PROC-003, PROC-004, PROC-006.

**SRS acceptance-test IDs:** T10, T11, T15, T20.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Display affected scope/consequences and revalidate generation/creation identity immediately before action.
- [ ] Cancel leaves processes and credentials unchanged; unknown or reused owners are never terminated.
- [ ] Stale-context servers require verified per-launch reuse support or approved stop; never kill by broad process name or terminate container PID 1.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 owned/unrelated process fixtures, cancel/graceful/force consent tests and installed-Codex background-server qualification.

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
