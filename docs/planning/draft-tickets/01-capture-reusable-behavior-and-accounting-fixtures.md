# CT-01: Capture reusable behavior and accounting fixtures

**Status:** Published as [GitLab #8](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/8). Ready for agent; unresolved blockers apply.
**Gate:** G0
**Kind:** Behavior/fixture preparation
**Parent gate:** [GitLab #3](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/3). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Turn the recorded profile-switching reference and pinned accounting behavior into a behavior/fixture inventory for the TypeScript implementation.

## Blocked by

None (can start immediately).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** MIG-001, PKG-004.

**SRS acceptance-test IDs:** T01, T09, T26, T43.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Use the documented profile-switching reference as the implementation input; the Go archive is optional source evidence, not a build or runtime prerequisite.
- [ ] Pin reused codex-report behavior to the approved commit and preserve its MIT notice; identify supported parser formats and golden accounting cases.
- [ ] Record useful behaviors, unsafe mechanisms to replace and source provenance; exclude Go binaries and embedded Git metadata from Tandem.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.

## Required verification evidence and platforms

Reviewed behavior-to-requirement inventory and sanitized synthetic/golden accounting fixture definitions with source provenance. No Go toolchain is required and no product acceptance pass is claimed.

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
