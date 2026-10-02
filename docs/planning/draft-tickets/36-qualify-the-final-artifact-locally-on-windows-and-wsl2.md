# CT-36: Qualify the final artifact locally on Windows and WSL2

**Status:** Published as [GitLab #43](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/43). Ready for agent; unresolved blockers apply.
**Gate:** G4
**Kind:** Qualification / gate review
**Parent gate:** [GitLab #7](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/7). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Execute the final applicable acceptance matrix on both local platforms using the exact packaged candidate.

## Blocked by

CT-29 ([GitLab #36](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/36)), CT-35 ([GitLab #42](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/42)).
- [CT-35](35-prepare-a-reproducible-release-package-and-notices.md) — Prepare a reproducible release package and notices

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** SEC-006, ENV-002, REL-001.

**SRS acceptance-test IDs:** T01, T02, T03, T04, T05, T06, T07, T08, T09, T10, T11, T12, T13, T14, T15, T16, T17, T18, T19, T20, T21, T22, T23, T24, T25, T26, T27, T28, T29, T30, T31, T32, T33, T34, T35, T36, T37, T38, T39, T40, T41, T42, T43, T44, T45.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Run actual local Windows and WSL2 validations, including install/build/launch/capture/storage/dashboard/migration/uninstall; keep Smart App Control enforcing on Windows.
- [ ] Re-run actual WSL2-to-legacy-container launch, bridge, A/B/children, stopping and latency on the final candidate.
- [ ] Record each test per platform as PASS/FAIL/BLOCKED/NOT EXECUTED, with explicit reasons for genuine non-applicability; CI results cannot substitute.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Separate local manifests with application commit, package checksum, platform/runtime/target versions, commands/results and manual steps; final T44/T45 evidence.

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
