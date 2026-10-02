# CT-18: Attribute mixed-identity sessions by launch and turn attempt

**Status:** Published as [GitLab #25](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/25). Ready for agent; unresolved blockers apply.
**Gate:** G2
**Kind:** Behavior slice
**Parent gate:** [GitLab #5](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/5). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Retain A's observations when a session resumes under B, including retry attempts, late events and crashes before completion.

## Blocked by

CT-17 ([GitLab #24](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/24)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** ATT-001, ATT-002, ATT-003, ATT-004, ATT-006, ATT-007, AUTH-004, AUTH-007, COL-010.

**SRS acceptance-test IDs:** T09, T19, T20, T21, T22, T23, T24, T26, T28, T29, T32, T37.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Correlate each observation to an immutable launch and evidenced attempt boundary; never overwrite a turn-to-account mapping or infer solely from current profile.
- [ ] Detect external account/workspace changes and stale/missing launch propagation; mark affected evidence instead of relabeling previous work.
- [ ] Preserve structured observed outcomes; distinguish an actual usage-limit error from interruption without provider evidence.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Golden A/B resume, repeated-turn, crash-before-stop, stale-server, external-login and reordered-event scenarios on local Windows/WSL2 and the actual qualified target.

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
