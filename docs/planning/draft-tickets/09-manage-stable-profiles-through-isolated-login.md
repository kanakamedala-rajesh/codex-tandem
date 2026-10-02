# CT-09: Manage stable profiles through isolated login

**Status:** Published as [GitLab #16](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/16). Ready for agent; unresolved blockers apply.
**Gate:** G1
**Kind:** Behavior slice
**Parent gate:** [GitLab #4](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/4). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Add, inspect, rename, reauthenticate and remove profiles while preserving valid credentials and historical identity bindings.

## Blocked by

CT-08 ([GitLab #15](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/15)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** SCP-002, PRO-001, PRO-002, PRO-003, PRO-004, AUTH-001, SEC-001.

**SRS acceptance-test IDs:** T06, T07, T08, T23, T30, T37, T44.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Use explicit existing-Codex login initiation and restricted staging; canceled/failed login preserves current valid credentials.
- [ ] Same-account reauthentication retains a binding; a different account/workspace requires a new binding; deletion requires confirmation and preserves non-secret history.
- [ ] Preview file-storage policy changes with backups, respect managed/keyring restrictions, and verify effective Windows ACLs and POSIX permissions.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 CRUD/login cancellation and ACL tests with synthetic credentials, followed by scoped real login verification; secret-leak checks.

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
