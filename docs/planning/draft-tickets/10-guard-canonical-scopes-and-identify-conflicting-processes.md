# CT-10: Guard canonical scopes and identify conflicting processes

**Status:** Published as [GitHub #17](https://github.com/kanakamedala-rajesh/codex-tandem/issues/17). Ready for agent; unresolved blockers apply.
**Gate:** G1
**Kind:** Behavior slice
**Parent gate:** [GitHub #4](https://github.com/kanakamedala-rajesh/codex-tandem/issues/4). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Refuse competing or ambiguous launches using canonical scope/binding locks and trustworthy process ownership evidence.

## Blocked by

CT-09 ([GitHub #16](https://github.com/kanakamedala-rajesh/codex-tandem/issues/16)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** AUTH-005, AUTH-006, PROC-001, PROC-004, ARC-003.

**SRS acceptance-test IDs:** T10, T11, T12, T15, T36.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Serialize one active managed launch per installation and protect shared mutable bindings/canonical Codex homes across aliases.
- [ ] Use nonce and creation identity where available; ambiguous ownership or reused PID blocks unsafe recovery.
- [ ] Distinguish unrelated and background processes; reject accidentally shared live Windows/WSL analytics stores.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 simultaneous-launch, alias, stale-lock, reused-PID and cross-environment-store tests.

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
