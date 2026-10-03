# CT-21: Qualify attribution against actual installed Codex

**Status:** Published as [GitHub #28](https://github.com/kanakamedala-rajesh/codex-tandem/issues/28). Ready for agent; unresolved blockers apply.
**Gate:** G2
**Kind:** Qualification / gate review
**Parent gate:** [GitHub #5](https://github.com/kanakamedala-rajesh/codex-tandem/issues/5). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Publish the per-version/per-target capability matrix and G2 attribution qualification results.

## Blocked by

CT-15 ([GitHub #22](https://github.com/kanakamedala-rajesh/codex-tandem/issues/22)), CT-20 ([GitHub #27](https://github.com/kanakamedala-rajesh/codex-tandem/issues/27)).

- [CT-20](20-expose-unknown-imported-and-conflicting-attribution.md) — Expose unknown, imported and conflicting attribution

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** SCP-003, ATT-012, REL-001, NFR-009.

**SRS acceptance-test IDs:** T02, T14, T19, T20, T21, T22, T23, T24, T29, T31, T32, T42, T43, T44, T45.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Execute T19–T24, T29 and T45 across their required combinations; include local Windows/WSL2 and actual-container A/B and child scenarios.
- [ ] Record missing events, stale-server behavior and unsupported fields precisely; qualify candidate floor and compatible newer releases.
- [ ] No full-tracking claim is allowed for any unproven target/version; capability failure blocks the affected guarantee and dependent feature.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Versioned sanitized fixtures and capability matrix with separate local Windows/WSL2 results, target evidence and regression command references.

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
