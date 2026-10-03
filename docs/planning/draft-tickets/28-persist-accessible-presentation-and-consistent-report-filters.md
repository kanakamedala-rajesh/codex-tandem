# CT-28: Persist accessible presentation and consistent report filters

**Status:** Published as [GitHub #35](https://github.com/kanakamedala-rajesh/codex-tandem/issues/35). Ready for agent; unresolved blockers apply.
**Gate:** G3
**Kind:** Behavior slice
**Parent gate:** [GitHub #6](https://github.com/kanakamedala-rajesh/codex-tandem/issues/6). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Provide keyboard-accessible filters and persistent appearance/session labels without rewriting upstream logs or ownership.

## Blocked by

CT-27 ([GitHub #34](https://github.com/kanakamedala-rajesh/codex-tandem/issues/34)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** UI-004, UI-005, UI-007, UI-008.

**SRS acceptance-test IDs:** T18, T30, T31, T32, T34, T35, T38.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Support required target/project/binding/model/outcome/evidence/time filters, JSON/CSV exports and shared timezone semantics.
- [ ] Apply light/dark/system theme and global font scale to all components; preserve focus and expanded rows during refresh and respect reduced motion.
- [ ] Persist presentation separately from normalized evidence; default launch remains quiet and any opt-in post-exit summary never waits for full import.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 browser keyboard, focus, contrast, font-scale, refresh and persistence checks; CLI/browser filter parity and quiet-launch tests.

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
