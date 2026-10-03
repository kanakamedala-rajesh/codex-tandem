# CT-35: Prepare a reproducible release package and notices

**Status:** Published as [GitHub #42](https://github.com/kanakamedala-rajesh/codex-tandem/issues/42). Ready for agent; unresolved blockers apply.
**Gate:** G4
**Kind:** Behavior slice
**Parent gate:** [GitHub #7](https://github.com/kanakamedala-rajesh/codex-tandem/issues/7). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Produce the final inspected tarball and release metadata without publishing it.

## Blocked by

CT-34 ([GitHub #41](https://github.com/kanakamedala-rajesh/codex-tandem/issues/41)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** PKG-001, PKG-002, PKG-003, PKG-004, NFR-009.

**SRS acceptance-test IDs:** T01, T17, T43, T44, T45.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Build reproducibly from a lockfile and inspect all shipped files/transitive dependencies; exclude native companion binaries, secrets and unintended source/archive artifacts.
- [ ] Install with lifecycle scripts disabled and verify shim/direct entrypoint and declared runtime floors.
- [ ] Record package-scope/name availability and publishing access checks plus preserved notices; availability/permission findings are not publication authorization.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Final tarball checksum/inventory, dependency/license records and clean install results locally on Windows and WSL2.

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
