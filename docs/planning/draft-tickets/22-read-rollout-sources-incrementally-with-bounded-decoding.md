# CT-22: Read rollout sources incrementally with bounded decoding

**Status:** Published as [GitLab #29](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/29). Ready for agent; unresolved blockers apply.
**Gate:** G3
**Kind:** Behavior slice
**Parent gate:** [GitLab #6](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/6). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Process registered synthetic/read-only rollout sources incrementally, recovering cursor progress without unbounded reads.

## Blocked by

CT-01 ([GitLab #8](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/8)), CT-02 ([GitLab #9](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/9)).

- [CT-02](02-install-a-packed-cli-and-run-host-capability-diagnostics.md) — Install a packed CLI and run host capability diagnostics

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** COL-001, COL-002, COL-005, SEC-003, NFR-004.

**SRS acceptance-test IDs:** T03, T18, T25, T27, T35, T36.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Preserve source files; atomically commit observations with generation/cursor/parser progress and handle incomplete trailing records, rotation and replacement.
- [ ] Decode gzip/Zstandard using host built-ins with explicit byte/record/time limits, cancellation and corrupt-source diagnostics.
- [ ] Contain paths under approved roots and yield bounded batches. This ticket can proceed as independent fixture-based groundwork while G0 is blocked.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 plain/compressed/truncated/rotated-source fixtures, path-escape/resource-abuse tests and bounded-read measurements.

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
