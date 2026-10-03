# CT-16: Capture bounded lifecycle metadata without altering Codex

**Status:** Published as [GitHub #23](https://github.com/kanakamedala-rajesh/codex-tandem/issues/23). Ready for agent; unresolved blockers apply.
**Gate:** G2
**Kind:** Behavior slice
**Parent gate:** [GitHub #5](https://github.com/kanakamedala-rajesh/codex-tandem/issues/5). **Specification:** [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2).

## What it delivers

Install previewed minimal hooks that publish sanitized, versioned metadata durably and return neutral output.

## Blocked by

CT-14 ([GitHub #21](https://github.com/kanakamedala-rajesh/codex-tandem/issues/21)).

These are completion prerequisites. Missing environment access, credentials for a scoped test,
or an unresolved capability result is an additional explicit blocker, not permission to assume
success. Work only within the reviewed scope.

## Requirements and acceptance tests

**Requirement IDs:** CAP-001, CAP-002, CAP-003, CAP-004, CAP-006, CAP-007, CAP-008, DCK-005, DCK-006, NFR-003.

**SRS acceptance-test IDs:** T03, T14, T18, T19, T24, T28, T36, T37, T38, T45.

Use the full linked [requirements register](../../requirements/Codex-Tandem-Requirements-Register.json)
and [SRS procedures](../../requirements/Codex-Tandem-SRS-v1.0.md#16-acceptance-verification-and-traceability).
The IDs identify applicable test families. Passing this ticket's subcases does not mark an
entire multi-platform family passed; gate tickets consolidate complete evidence.

## Acceptance criteria

- [ ] Preserve existing hooks and trust; qualify actual event names and fields instead of assuming documentation or donor hooks match the installed binary.
- [ ] Enforce documented event/field/path bounds, restrictive publication and schema-version diagnostics; discard prompts, responses, tool data and secrets before persistence.
- [ ] Hooks perform no network, analytics, collector startup or history scans; malformed input and capture failure produce bounded behavior and visible degradation.
- [ ] Record results and unresolved limitations against the listed requirements and relevant test cases.
- [ ] Execute applicable implementation validations locally on both native Windows and WSL2; identify platform-specific cases and additional actual-container/native Linux requirements. CI alone is insufficient.

## Required verification evidence and platforms

Installed-hook local Windows/WSL2 tests and actual-container fixtures; hostile input, interrupted writes, neutral output, no-content retention and hook-latency measurements.

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
