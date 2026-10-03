# CT-37: Qualify native Linux and remaining runtime/browser combinations

**Status:** Published as [GitHub #44](https://github.com/kanakamedala-rajesh/codex-tandem/issues/44). Ready for agent; unresolved blockers apply.
**Gate:** G4
**Kind:** Qualification / gate review
**Parent gate:** [GitHub #7](https://github.com/kanakamedala-rajesh/codex-tandem/issues/7). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Complete required native Linux and supported-version evidence beyond the local Windows/WSL2 runs.

## Blocked by

CT-35 ([GitHub #42](https://github.com/kanakamedala-rajesh/codex-tandem/issues/42)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** ENV-002, SCP-003, REL-001.

**SRS acceptance-test IDs:** T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T25, T26, T27, T28, T29, T30, T31, T32, T33, T34, T35, T36, T37, T38, T39, T40, T41, T42, T43, T44, T45.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Validate native glibc Linux x64 local workflows and available Docker integration; WSL2 results are not relabeled as native Linux qualification.
- [ ] Test the initial minimum runtime/capability floor and maintained compatible newer releases, plus supported desktop browser coverage.
- [ ] Verify CI runner eligibility/limits before relying on jobs and mark absent combinations unexecuted; keep future macOS/ARM64/remote targets out of supported claims.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Native Linux manifests, actual CI job artifacts where used, runtime/browser compatibility matrix and failure diagnostics.

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
