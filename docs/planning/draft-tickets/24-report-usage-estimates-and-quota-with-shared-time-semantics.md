# CT-24: Report usage, estimates and quota with shared time semantics

**Status:** Published as [GitLab #31](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/31). Ready for agent; unresolved blockers apply.
**Gate:** G3
**Kind:** Behavior slice
**Parent gate:** [GitLab #6](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/6). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Expose CLI reports and safe exports with identity-correct quotas and transparent API-equivalent estimates.

## Blocked by

CT-23 ([GitLab #30](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/30)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** COL-009, ATT-011, UI-005, INT-002, SEC-005.

**SRS acceptance-test IDs:** T05, T18, T31, T32, T35, T37, T41.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Use UTC storage and one saved host-initialized reporting timezone; apply inclusive-start/exclusive-end ranges consistently including calendar/DST boundaries.
- [ ] Use versioned bundled pricing plus explicit refresh; expose date/source/unpriced portions and keep unknown models unpriced.
- [ ] Bind quota samples to evidenced identities and windows; expose staleness; make JSON parseable and CSV safe against formula execution; no launch-path network requests.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 CLI golden reports, pricing refresh/offline/unknown-model fixtures, quota-identity cases, timezone-boundary tests and hostile CSV values.

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
