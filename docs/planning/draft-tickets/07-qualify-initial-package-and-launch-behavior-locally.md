# CT-07: Qualify initial package and launch behavior locally

**Status:** Published as [GitLab #14](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/14). Ready for agent; unresolved blockers apply.
**Gate:** G0
**Kind:** Behavior slice
**Parent gate:** [GitLab #3](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/3). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Establish the initial Windows and WSL2 compatibility evidence before committing to the full build.

## Blocked by

CT-06 ([GitLab #13](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/13)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** SEC-006, PKG-003, DCK-002, DCK-003, ENV-001.

**SRS acceptance-test IDs:** T03, T05, T13, T17, T44.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] On local Windows with Smart App Control enforcing, run source build, packed install, shim/direct entrypoint and available G0 behavior without weakening policy.
- [ ] On local WSL2, run the same applicable package/selector/runtime checks and actual-container launch with the intended user, directory and representative build command.
- [ ] Include initial native Linux compatibility evidence; treat available CI runner names or registry observations as inventory only and record unavailable cases as blocked.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Separate machine/runtime/command/result manifests for local Windows, local WSL2 and native Linux; actual work-container T13/T14 evidence; initial T44 findings.

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
