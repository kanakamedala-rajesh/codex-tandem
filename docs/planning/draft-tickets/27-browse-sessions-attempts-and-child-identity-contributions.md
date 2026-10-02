# CT-27: Browse sessions, attempts and child identity contributions

**Status:** Published as [GitLab #34](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/34). Ready for agent; unresolved blockers apply.
**Gate:** G3
**Kind:** Behavior slice
**Parent gate:** [GitLab #6](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/6). **Specification:** [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2).

## What it delivers

Show sessions with mixed identities, expandable attempts/children and honest evidence/health state.

## Blocked by

CT-21 ([GitLab #28](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/28)), CT-26 ([GitLab #33](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/33)).
- [CT-26](26-serve-authenticated-local-reports-through-a-restricted-api.md) — Serve authenticated local reports through a restricted API

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** UI-001, UI-002, UI-003, UI-006, COL-010, ATT-002.

**SRS acceptance-test IDs:** T21, T22, T28, T29, T32, T35, T37, T39.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Derive session identity sets from observations; identity filters charge only matching usage even when other contextual rows are shown.
- [ ] Render original structured outcomes, unknown identity, conflicts, source completeness, backlog and instrumentation limits.
- [ ] Use the donor's useful presentation behavior without a mandatory visual redesign; keep browser capabilities limited to reporting and presentation.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Actual browser checks backed by deterministic A/B/child fixtures locally on Windows and WSL2; compare visible totals with CLI results.

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
