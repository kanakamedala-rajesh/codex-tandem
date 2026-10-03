# CT-13: Launch and resume locally with safe identity ownership

**Status:** Published as [GitHub #20](https://github.com/kanakamedala-rajesh/codex-tandem/issues/20). Ready for agent; unresolved blockers apply.
**Gate:** G1
**Kind:** Behavior slice
**Parent gate:** [GitHub #4](https://github.com/kanakamedala-rajesh/codex-tandem/issues/4). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Connect the selector and explicit CLI to guarded local launch and project-scoped resume.

## Blocked by

CT-12 ([GitHub #19](https://github.com/kanakamedala-rajesh/codex-tandem/issues/19)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** CLI-004, CLI-002, CLI-003, PRO-005, ARC-001, INT-001, AUTH-004.

**SRS acceptance-test IDs:** T05, T08, T09, T17, T18, T19, T25, T29, T37, T43.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Resolve identity and target separately and support explicit session or opt-in last-session lookup only within the canonical project/target.
- [ ] Preserve arguments, terminal behavior and documented signal/exit semantics; revalidate ownership before child execution.
- [ ] Keep reporting/storage imports off the fast path and leave selected credentials usable by plain Codex.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Installed CLI end-to-end local Windows/WSL2 launch/resume tests, wrong-project negatives, real Codex smoke evidence and fast-path dependency checks.

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
