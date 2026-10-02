# CT-04: Select a profile and pass through to a harmless child

**Status:** Published as [GitLab #11](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/11). Ready for agent; unresolved blockers apply.
**Gate:** G0
**Kind:** Behavior slice
**Parent gate:** [GitLab #3](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/3). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Demonstrate selector behavior and argument/terminal transparency using disposable profile metadata and a harmless child fixture.

## Blocked by

CT-02 ([GitLab #9](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/9)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** CLI-001, CLI-002, CLI-003, CLI-005, CLI-006, NFR-010, INT-001.

**SRS acceptance-test IDs:** T04, T05, T06, T17, T18.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Cover zero/one/many profiles, Unicode, duplicate labels, stable IDs, navigation, cancellation, resize and exception cleanup.
- [ ] Require explicit identity without a usable TTY; preserve Codex arguments after -- including --profile; preserve child exit/stdin/stdout behavior.
- [ ] Keep selector rendering free of network/history work; use synthetic credentials only, with production activation explicitly deferred to G1.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 interactive transcripts stripped of sensitive content, automated non-TTY/argument tests, terminal restoration checks and selector timing.

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
