# CT-14: Launch and supervise Codex inside the existing container

**Status:** Published as [GitHub #21](https://github.com/kanakamedala-rajesh/codex-tandem/issues/21). Ready for agent; unresolved blockers apply.
**Gate:** G1
**Kind:** Behavior slice
**Parent gate:** [GitHub #4](https://github.com/kanakamedala-rajesh/codex-tandem/issues/4). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Safely launch the existing container Codex with correct credentials, build environment and verified remote process lifecycle.

## Blocked by

CT-13 ([GitHub #20](https://github.com/kanakamedala-rajesh/codex-tandem/issues/20)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** DCK-001, DCK-002, DCK-003, DCK-004, DCK-007, DCK-008, DCK-009, DCK-010, PROC-005.

**SRS acceptance-test IDs:** T05, T08, T12, T13, T15, T16, T17, T18, T27, T28, T36, T37.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Transfer only selected credentials and recoverable outgoing refresh state using restricted, atomic target-side staging; never place secrets in arguments/environment.
- [ ] Preserve interactive and noninteractive semantics, canonical path containment and pinned target generation.
- [ ] Host docker-client loss does not release ownership until in-container processes are checked; background transport stays outside the launch critical path.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows adapter contract fixtures and local WSL2 actual-container integration: user/build command, terminal resize, disconnect, stopped/replaced target, secret transport and refreshed credentials.

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
