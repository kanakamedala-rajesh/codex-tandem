# CT-02: Install a packed CLI and run host capability diagnostics

**Status:** Published as [GitLab #9](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/9). Ready for agent; unresolved blockers apply.
**Gate:** G0
**Kind:** Behavior slice
**Parent gate:** [GitLab #3](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/3). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Build and pack one precompiled JavaScript application whose installed CLI diagnoses host SQLite and compression capabilities.

## Blocked by

None (can start immediately).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** SCP-001, ENV-001, ENV-002, PKG-001, PKG-002, PKG-003, INT-002, INT-003.

**SRS acceptance-test IDs:** T01, T02, T03, T05, T13, T17, T35, T37, T39, T41, T43, T44.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Install the tarball with lifecycle scripts disabled; exercise npm shim and direct Node entrypoint without build tools.
- [ ] Perform disposable built-in SQLite, gzip and Zstandard self-tests; missing APIs produce versioned JSON diagnostics without ANSI contamination.
- [ ] Inspect production dependencies/assets and lock development dependencies; test the initial Node capability floor and compatible maintained versions without imposing a major-version ceiling.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Tarball checksum/content inventory, isolated install logs, runtime matrix and capability failure fixtures. Execute applicable installed-package checks locally on Windows and WSL2.

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
