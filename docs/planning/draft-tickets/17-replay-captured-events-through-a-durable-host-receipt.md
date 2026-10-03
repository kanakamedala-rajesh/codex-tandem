# CT-17: Replay captured events through a durable host receipt

**Status:** Published as [GitHub #24](https://github.com/kanakamedala-rajesh/codex-tandem/issues/24). Ready for agent; unresolved blockers apply.
**Gate:** G2
**Kind:** Behavior slice
**Parent gate:** [GitHub #5](https://github.com/kanakamedala-rajesh/codex-tandem/issues/5). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Recover event backlogs without losing or duplicating committed effects, through mounted or background-pull transport.

## Blocked by

CT-16 ([GitHub #23](https://github.com/kanakamedala-rajesh/codex-tandem/issues/23)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** CAP-005, CAP-004, OPS-002, NFR-007, DCK-006, DCK-007.

**SRS acceptance-test IDs:** T09, T14, T18, T19, T24, T26, T27, T28.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Commit normalized effects and event receipts before acknowledging deletion; repeated fetches and crash-after-commit replays are idempotent.
- [ ] Capture continues while collection is absent; committed files survive process crashes and incomplete files are ignored.
- [ ] Declare spool-loss/power-loss limits; never silently delete unacknowledged events; essential launch-record failure remains cancel by default with explicit untracked choice.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Local Windows/WSL2 commit/delete fault injection and replay; actual WSL2-to-container mounted/no-mount transport outages and backlog recovery.

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
