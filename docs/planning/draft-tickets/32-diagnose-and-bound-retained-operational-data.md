# CT-32: Diagnose and bound retained operational data

**Status:** Published as [GitLab #39](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/39). Ready for agent; unresolved blockers apply.
**Gate:** G4
**Kind:** Behavior slice
**Parent gate:** [GitLab #7](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/7). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Explain runtime/source/target/recovery health through redacted diagnostics while bounding operational storage.

## Blocked by

CT-25 ([GitLab #32](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/32)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** OPS-004, OPS-006, SEC-004, INT-003.

**SRS acceptance-test IDs:** T03, T16, T27, T28, T37, T39.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Doctor is read-only apart from declared disposable self-tests; repair is separate with preview/confirmation.
- [ ] Redact sensitive paths/IDs by default and disclose fields before diagnostic export.
- [ ] Bound logs, completed journals and acknowledged events; retain unacknowledged evidence and expose disk pressure rather than silently dropping it.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 doctor/repair separation, retention/disk-full tests and diagnostic field/secret inspection including actual-target failures.

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
