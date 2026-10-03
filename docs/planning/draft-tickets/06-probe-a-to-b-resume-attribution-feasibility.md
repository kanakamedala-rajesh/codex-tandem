# CT-06: Probe A-to-B resume attribution feasibility

**Status:** Published as [GitHub #13](https://github.com/kanakamedala-rajesh/codex-tandem/issues/13). Ready for agent; unresolved blockers apply.
**Gate:** G0
**Kind:** Bounded feasibility experiment
**Parent gate:** [GitHub #3](https://github.com/kanakamedala-rajesh/codex-tandem/issues/3). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Demonstrate whether the installed Codex can expose trustworthy launch/attempt boundaries across a controlled A-to-B resume.

## Blocked by

CT-04 ([GitHub #11](https://github.com/kanakamedala-rajesh/codex-tandem/issues/11)), CT-05 ([GitHub #12](https://github.com/kanakamedala-rajesh/codex-tandem/issues/12)).

- [CT-05](05-qualify-a-minimal-metadata-bridge-on-the-legacy-target.md) — Qualify a minimal metadata bridge on the legacy target

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** ATT-003, ATT-004, ATT-006, PROC-006, SCP-003, ATT-002.

**SRS acceptance-test IDs:** T02, T11, T14, T19, T20, T21, T22, T23, T24, T32, T45.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Use approved test identities and disposable test state, with controlled existing-Codex/manual activation rather than an unfinished production switching mechanism.
- [ ] Capture immutable launch context, earliest available turn event and any stale background-server context; keep unsupported fields/relationships unresolved.
- [ ] Record A/B observations and failure boundaries without claiming complete attribution, credential recovery or a full T19–T23/T45 pass.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Actual legacy-target sanitized lifecycle fixtures, propagation/server-context findings and separate local Windows/WSL2 feasibility runs. No production credential migration or general tracking claim.

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
