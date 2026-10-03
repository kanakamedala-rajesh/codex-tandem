# CT-26: Serve authenticated local reports through a restricted API

**Status:** Published as [GitHub #33](https://github.com/kanakamedala-rajesh/codex-tandem/issues/33). Ready for agent; unresolved blockers apply.
**Gate:** G3
**Kind:** Behavior slice
**Parent gate:** [GitHub #6](https://github.com/kanakamedala-rajesh/codex-tandem/issues/6). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Let an authenticated local browser read the same reports as the CLI while denying hostile sites and privileged actions.

## Blocked by

CT-24 ([GitHub #31](https://github.com/kanakamedala-rajesh/codex-tandem/issues/31)), CT-25 ([GitHub #32](https://github.com/kanakamedala-rajesh/codex-tandem/issues/32)).

- [CT-25](25-run-one-recoverable-collector-without-delaying-launch.md) — Run one recoverable collector without delaying launch

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** SEC-002, SEC-003, UI-006, INT-002, ARC-002.

**SRS acceptance-test IDs:** T05, T26, T27, T32, T35, T36, T37, T41.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Bind loopback only; use private per-installation authentication, Host/Origin checks, restrictive browser policy and cross-site mutation protection.
- [ ] Define versioned report/health/display-setting contracts with optimistic setting revisions and schema validation.
- [ ] Reject arbitrary command/process/credential controls, path escape, malicious labels and unsafe export input.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 API attack tests, authentication/bootstrap/logout behavior and CLI/API report parity. Document the selected authentication contract before UI reliance.

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
