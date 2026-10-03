# CT-05: Qualify a minimal metadata bridge on the legacy target

**Status:** Published as [GitHub #12](https://github.com/kanakamedala-rajesh/codex-tandem/issues/12). Ready for agent; unresolved blockers apply.
**Gate:** G0
**Kind:** Bounded feasibility experiment
**Parent gate:** [GitHub #3](https://github.com/kanakamedala-rajesh/codex-tandem/issues/3). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Run a bounded capture experiment that emits sanitized durable metadata using only verified existing legacy-container facilities.

## Blocked by

CT-03 ([GitHub #10](https://github.com/kanakamedala-rajesh/codex-tandem/issues/10)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** ENV-004, DCK-005, DCK-006, CAP-001, CAP-003, CAP-004, CAP-006.

**SRS acceptance-test IDs:** T03, T14, T19, T24, T28, T37, T38, T45.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Preview and make reversible any helper/hook deployment; preserve existing hooks and trust settings.
- [ ] Exercise mounted and no-mount capture while the host collector is absent; reject malformed or oversized payloads without saving raw content.
- [ ] Prove no container Node/npm invocation, neutral hook output and recoverable atomic event publication; report unsupported facilities explicitly.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Sanitized actual-target turn-start fixtures, bridge capability manifest, crash/absence/trust cases and helper cleanup record. Host-side fixture handling validated locally on Windows and WSL2; actual container experiment runs from WSL2.

Evidence identifies the application commit (when implementation exists), package checksum,
runtime/platform/target, fixture provenance, exact commands/results and manual steps.
Use synthetic or sanitized fixtures; never retain secrets or raw conversation content.
Unavailable tests remain BLOCKED or NOT EXECUTED. Do not weaken platform security or modify
the legacy environment to manufacture a passing result.

## Scope and handoff

This is an experiment, not production credential switching or a full-tracking qualification. Preserve findings and sanitized fixtures; subsequent tickets implement and qualify production behavior.

The [accepted planning decisions](../../agents/planning-decisions.md) and
[glossary](../../../GLOSSARY.md) apply. For profile switching, use the
[behavior reference](../../agents/profile-switching-reference.md); the Go archive is not
a runtime/build dependency. The user approved dependency-ordered implementation. Package publication remains a separate release action.
