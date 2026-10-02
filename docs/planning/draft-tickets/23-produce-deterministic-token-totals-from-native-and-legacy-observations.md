# CT-23: Produce deterministic token totals from native and legacy observations

**Status:** Published as [GitLab #30](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/30). Ready for agent; unresolved blockers apply.
**Gate:** G3
**Kind:** Behavior slice
**Parent gate:** [GitLab #6](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/6). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Generate stable nonnegative accounting totals without counting inherited, cached, reasoning or replayed usage twice.

## Blocked by

CT-22 ([GitLab #29](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/29)), CT-20 ([GitLab #27](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/27)).

- [CT-20](20-expose-unknown-imported-and-conflicting-attribution.md) — Expose unknown, imported and conflicting attribution

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** COL-003, COL-004, COL-007, COL-008, ATT-009, ATT-013, NFR-008, ARC-002.

**SRS acceptance-test IDs:** T23, T24, T25, T26, T31, T32.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Port the pinned donor's tested accounting behavior into the host built-in database model and one shared reporting computation.
- [ ] Verify observation uniqueness and conservative cumulative baselines/resets; unknown boundaries remain unresolved without manufactured zeroes.
- [ ] Protect integer/decimal arithmetic from overflow and preserve supported model/tier/effort/duration/source metadata.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Golden native/legacy totals, duplicate copies, resets, inherited prefixes and permutation/restart invariance on local Windows/WSL2.

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
