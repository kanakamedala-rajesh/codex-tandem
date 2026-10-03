# CT-33: Remove managed integration safely

**Status:** Published as [GitHub #40](https://github.com/kanakamedala-rajesh/codex-tandem/issues/40). Ready for agent; unresolved blockers apply.
**Gate:** G4
**Kind:** Behavior slice
**Parent gate:** [GitHub #7](https://github.com/kanakamedala-rajesh/codex-tandem/issues/7). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Uninstall Tandem integration without erasing user changes, credentials or analytics by default.

## Blocked by

CT-31 ([GitHub #38](https://github.com/kanakamedala-rajesh/codex-tandem/issues/38)), CT-32 ([GitHub #39](https://github.com/kanakamedala-rajesh/codex-tandem/issues/39)).

- [CT-32](32-diagnose-and-bound-retained-operational-data.md) — Diagnose and bound retained operational data

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** OPS-007, AUTH-008, MIG-003.

**SRS acceptance-test IDs:** T08, T09, T10, T38, T40, T41.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Preview removal of only unchanged managed hooks/helpers and leave modified user files with a warning.
- [ ] Require separate confirmation for purge; preserve data and current refreshed credentials by default.
- [ ] Rehearse rollback to plain Codex/previous workflow with one credential controller, including interrupted cleanup.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 install/change/uninstall/rollback scenarios, managed-file checksums and Smart App Control-on cleanup evidence.

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
