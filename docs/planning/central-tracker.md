# Codex Tandem: implementation tracker for G0–G4

## Purpose

Track the complete Codex Tandem implementation through G0–G4. This is the central
coordination ticket; it links the five gate Issues, each owning native child
Tasks for implementation and qualification. The user approved this mapping
because the namespace supports Issue → Task without an available Epic type.

The reviewed plan contains 38 tickets covering all 119 requirements and all 45
acceptance-test families. CT identifiers below are planning identifiers, not
GitLab issue numbers. Creating this tracker does not start product implementation
or authorize package publication.

## Gate progress and linked issues

- [ ] G0 — Compatibility and feasibility. [GitLab #3](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/3).
- [ ] G1 — Safe identity launcher. [GitLab #4](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/4).
- [ ] G2 — Attribution backbone. [GitLab #5](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/5).
- [ ] G3 — Accounting and dashboard. [GitLab #6](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/6).
- [ ] G4 — Hardening, migration and release qualification. [GitLab #7](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/7).

| Gate | Planned tickets | Required outcome                                                                                                                                      | Qualification focus                                                           |
| ---- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| G0   | CT-01–CT-08     | Packed JavaScript CLI, host diagnostics, selector/passthrough, safe target discovery, bounded metadata/A-to-B experiments and compatibility decision. | T01–T05, T13–T14, initial T44, plus partial attribution feasibility evidence. |
| G1   | CT-09–CT-15     | Stable profiles, guarded scopes, refresh-safe activation/recovery, scoped process stopping, local/container launch and measured overhead.             | T06–T12, T15–T18.                                                             |
| G2   | CT-16–CT-21     | Durable capture and replay, observation/attempt/child ownership, visible uncertainty and actual installed-Codex qualification.                        | T19–T24, T29, T45.                                                            |
| G3   | CT-22–CT-29     | Bounded source collection, deterministic totals, transparent estimates/quotas, shared reports and authenticated accessible dashboard.                 | T25–T35.                                                                      |
| G4   | CT-30–CT-38     | Previewed migration, backup/restore, diagnostics/retention, safe cleanup, privacy, final artifact and evidence-backed release decision.               | T36–T44 and all prior required tests, including final T45 coverage.           |

## Agreed implementation direction

- Extend the user's codex-as profile-switching workflow in the approved TypeScript
  stack. The Go archive is source reference material, not a runtime/build dependency.
- Use the existing Codex installation, host built-in SQLite/compression, one package
  and independent Windows/WSL stores. Preserve the existing legacy container toolchain.
- Attribute observations through immutable launches, turn attempts and verified
  child relationships. Never reassign earlier work using the newly selected profile.
- Preserve credential refreshes and recoverable activation, scoped stop consent,
  metadata-only capture, deterministic replay and explicit uncertainty.
- Use UTC timestamp storage and one configurable reporting timezone, with
  inclusive-start/exclusive-end ranges shared by CLI and browser.
- Preserve imported operator assertions; a new manual attribution editor is beyond MVP.
- Bundle versioned pricing with explicit refresh; show provenance and leave unknown
  models unpriced. No automatic background price requests or launch-path network work.

## Mandatory validation and evidence

Applicable implementation validations must actually run locally on both native
Windows and WSL2. Record separate results for each; CI supplements these runs and
cannot replace them. Keep Smart App Control enforcing for required Windows
qualification. Actual WSL2-to-legacy-container and native glibc Linux qualification
remain required where specified by the baseline.

Tests that were not executed remain NOT EXECUTED; unavailable prerequisites remain
BLOCKED. Inventory, compilation and synthetic fixtures are not substitutes for
real-platform acceptance. A partial experiment does not mark a complete SRS test
family as passed.

Version sanitized fixtures, evidence manifests and result summaries. Every result
identifies the application commit, package checksum, runtime/platform/target,
fixture provenance, commands/results and manual steps. Keep secrets and raw
conversation content out of Git, issue bodies and exports.

## Work ordering and tracking rules

1. Keep the G0–G4 linked gate Issues and their native child Tasks indexed here.
2. Publish implementation tickets under the relevant gate in dependency order,
   retaining a mapping from CT identifiers to GitLab issue IDs.
3. Every implementation ticket includes requirement IDs, acceptance-test IDs,
   explicit blockers, acceptance criteria and required platform evidence.
4. Use ticket blockers to select work. Gate membership alone does not serialize
   independent fixture groundwork; CT-22 can proceed after CT-01/CT-02 while
   real-environment G0 work remains blocked.
5. Keep G0 incomplete until its required evidence is available. Production G1 and
   dashboard work must respect the reviewed compatibility and behavior dependencies.
6. Close a gate only after its qualification evidence is complete. Mark a checklist
   item here complete only when the corresponding linked gate is accepted.
7. Record requirement conflicts explicitly; do not silently revise the approved
   baseline or remove safeguards to meet performance targets.

## Definition of complete

- [ ] G0–G4 linked gates are complete with their implementation tasks resolved.
- [ ] All 119 requirements are accounted for in the traceability record.
- [ ] Every MUST requirement has passing evidence on its required platforms, or
      an explicitly identified owner-approved waiver; no unexplained green labels.
- [ ] All 45 acceptance-test families have explicit per-platform outcomes and evidence.
- [ ] Applicable validations have actually run locally on Windows and WSL2.
- [ ] Actual container A/B resume, nested-child attribution and process ownership pass.
- [ ] Credential recovery, privacy and accounting invariants pass.
- [ ] SRS performance budgets are measured and met or handled through an explicit
      approved requirement decision.
- [ ] The exact final tarball has a checksum, content/license inspection and platform qualification.
- [ ] Support matrix, known limitations and migration/rollback instructions are recorded.
- [ ] Final release readiness is reviewed; publishing remains a separate action.

## Reviewed planning sources

The repository's approved requirements baseline remains authoritative:
`docs/requirements/Codex-Tandem-SRS-v1.0.md` and
`docs/requirements/Codex-Tandem-Requirements-Register.json`.

The reviewed local drafts are `docs/planning/implementation-spec.md`,
`docs/planning/ticket-plan.md`, `docs/planning/traceability.md` and the individual
CT ticket drafts. Accepted clarifications are recorded in
`docs/agents/planning-decisions.md`. These local planning files have not been
pushed; this tracker is self-contained and does not imply they are remotely available.

## Publication status

Approved specification: [GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2). All five gate Issues and 38 native
child Tasks are published. Every task includes requirement IDs, acceptance-test
IDs, blockers and required verification evidence. Native blocking links are
unavailable on this license; explicit issue references and blocked labels apply.
Product acceptance tests remain NOT EXECUTED.
