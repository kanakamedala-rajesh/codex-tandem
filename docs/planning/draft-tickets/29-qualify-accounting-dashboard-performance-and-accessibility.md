# CT-29: Qualify accounting, dashboard performance and accessibility

**Status:** Published as [GitHub #36](https://github.com/kanakamedala-rajesh/codex-tandem/issues/36). Ready for agent; unresolved blockers apply.
**Gate:** G3
**Kind:** Qualification / gate review
**Parent gate:** [GitHub #6](https://github.com/kanakamedala-rajesh/codex-tandem/issues/6). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Demonstrate G3 accounting/report correctness and resource budgets under collection load.

## Blocked by

CT-28 ([GitHub #35](https://github.com/kanakamedala-rajesh/codex-tandem/issues/35)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** NFR-005, NFR-006, NFR-008, UI-004, ARC-002.

**SRS acceptance-test IDs:** T24, T25, T26, T27, T28, T29, T30, T31, T32, T33, T34, T35.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Complete T25–T35 using documented datasets of at least 100,000 observations/1,000 sessions and a 1 GiB mixed rollout corpus.
- [ ] Verify freshness, query latency, idle/import resource budgets, deterministic totals and browser/CLI parity.
- [ ] Run applicable checks locally on Windows and WSL2 and qualify required browsers; record real results rather than inferring from unit tests.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Dataset recipes/checksums, golden totals, browser/keyboard evidence and per-platform resource/latency distributions.

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
