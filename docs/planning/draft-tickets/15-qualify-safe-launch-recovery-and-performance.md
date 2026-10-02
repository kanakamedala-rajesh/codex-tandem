# CT-15: Qualify safe-launch recovery and performance

**Status:** Published as [GitLab #22](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/22). Ready for agent; unresolved blockers apply.
**Gate:** G1
**Kind:** Qualification / gate review
**Parent gate:** [GitLab #4](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/4). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Verify the integrated launcher meets G1 safety and latency requirements on the required environments.

## Blocked by

CT-14 ([GitLab #21](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/21)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** NFR-001, NFR-002, NFR-003, NFR-004, NFR-010, AUTH-003, PROC-005.

**SRS acceptance-test IDs:** T04, T06, T07, T08, T09, T10, T11, T12, T15, T16, T17, T18, T27, T28, T38.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Complete T06–T12 and T15–T18, including local Windows/WSL2 execution and actual legacy-target cases.
- [ ] Apply the SRS benchmark protocol with equivalent direct baselines, 50 warmups and 1,000 alternating measurements; include all added guard/hook/RPC work.
- [ ] Keep failed or unexecuted cases explicit; performance failures cannot remove identity or credential safeguards.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Crash matrix, process-consent evidence, raw sanitized timing distributions and per-platform p95/p99 summaries with package/commit IDs.

Evidence identifies the application commit (when implementation exists), package checksum,
runtime/platform/target, fixture provenance, exact commands/results and manual steps.
Use synthetic or sanitized fixtures; never retain secrets or raw conversation content.
Unavailable tests remain BLOCKED or NOT EXECUTED. Do not weaken platform security or modify
the legacy environment to manufacture a passing result.

## Scope and handoff

This ticket evaluates the integrated result; it must not substitute an unchecked summary for the underlying test evidence. Record any failed requirement or named owner-approved waiver explicitly.

The [accepted planning decisions](../../agents/planning-decisions.md) and
[glossary](../../../GLOSSARY.md) apply. For profile switching, use the
[behavior reference](../../agents/profile-switching-reference.md); the Go archive is not
a runtime/build dependency. The user approved dependency-ordered implementation. Package publication remains a separate release action.
