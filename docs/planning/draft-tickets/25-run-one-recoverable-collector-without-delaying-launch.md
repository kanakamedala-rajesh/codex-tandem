# CT-25: Run one recoverable collector without delaying launch

**Status:** Published as [GitHub #32](https://github.com/kanakamedala-rajesh/codex-tandem/issues/32). Ready for agent; unresolved blockers apply.
**Gate:** G3
**Kind:** Behavior slice
**Parent gate:** [GitHub #6](https://github.com/kanakamedala-rajesh/codex-tandem/issues/6). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Start or reconnect a separately owned collector while Codex launches immediately, and recover after restarts or outages.

## Blocked by

CT-17 ([GitHub #24](https://github.com/kanakamedala-rajesh/codex-tandem/issues/24)), CT-22 ([GitHub #29](https://github.com/kanakamedala-rajesh/codex-tandem/issues/29)).

- [CT-22](22-read-rollout-sources-incrementally-with-bounded-decoding.md) — Read rollout sources incrementally with bounded decoding

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** COL-006, OPS-001, OPS-002, OPS-003, PROC-007, NFR-005, NFR-006.

**SRS acceptance-test IDs:** T19, T27, T28, T33, T39, T40.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Ensure one installation writer; coordinate migrations/imports and verify nonce/process ownership for start/stop/status.
- [ ] Collector stop never kills Codex or erases analytics; next command after restart can recover without installing a boot service.
- [ ] Serve responsive reads while collection yields; show backlog and health and preserve essential-record failure rules.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 collector restart, competing-start, port/PID reuse, disk-full and launcher-independence tests with CPU/RSS/freshness observations.

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
