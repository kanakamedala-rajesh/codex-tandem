# CT-03: Discover targets without changing their environment

**Status:** Published as [GitLab #10](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/10). Ready for agent; unresolved blockers apply.
**Gate:** G0
**Kind:** Behavior slice
**Parent gate:** [GitLab #3](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/3). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Inspect local and existing Docker targets and report precise readiness, path and bridge diagnostics.

## Blocked by

CT-02 ([GitLab #9](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/9)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** ENV-003, ENV-004, DCK-001, DCK-008, DCK-009, DCK-010, OPS-004.

**SRS acceptance-test IDs:** T03, T12, T13, T14, T16, T17, T36, T37, T39, T44, T45.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Resolve effective user, home, Codex home, executable, project roots, container generation and Docker context instead of copying SRS placeholder paths.
- [ ] Probe existing safe JSON projection/durable-write facilities and report missing trust/capabilities explicitly.
- [ ] Handle stopped, replaced, inaccessible and aliased targets without restarting containers, installing runtimes or altering permissions/security.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Sanitized discovery manifests and negative-case fixtures; local Windows/WSL2 discovery runs plus read-only checks on the actual legacy target when accessible.

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
