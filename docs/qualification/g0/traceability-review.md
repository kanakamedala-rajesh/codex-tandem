# T42 review: mappings, approvals and provenance

This is a G0 documentary review of SCP-003/REL-001, not final release acceptance.
The unchanged [register](../../requirements/Codex-Tandem-Requirements-Register.json)
has 119 requirements and 45 acceptance families; the
[published mapping](../../planning/gitlab-map.json) has 38 tasks. The offline
[audit](audit.mjs) checks unique IDs, every requirement's nonempty valid test
mapping, every family being referenced, exact requirement/test rows in planning
traceability and valid assigned task IDs. It also checks local links in this G0
packet. Counts and execution are in [validation.md](validation.md).

The reviewed task links allocate implementation work, not acceptance passes.
Every MUST has a test mapping; this does not prove every procedure has executed.
The SRS's 45 procedures remain authoritative. T42 release completeness remains
NOT EXECUTED until final artifact, scenarios and platforms have qualifying evidence.

## Approvals A–F

Authority: [SRS section1.1](../../requirements/Codex-Tandem-SRS-v1.0.md), approved
in the original conversation; later decisions are separately preserved in
[planning decisions](../../agents/planning-decisions.md). This audit creates no
new approval.

| Approval                      | Review and remaining boundary                                                                                                                                                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A: execution placement        | Host Node / existing Codex separation is retained. Modern disposable target was owner-selected; original legacy workflow remains blocked. [Separate proposal](baseline-proposal.md) identifies the conflict; no baseline waiver inferred.                          |
| B: instrumentation            | CT05 tested minimal trusted sanitized hook capture. Existing-hook configuration/trust preservation is evidenced only within its stated scope, not complete existing-hook execution or production installation. Local hooks and broad lifecycle remain unqualified. |
| C: speed / degraded operation | Warm selector timing and absent-collector capture slices exist. Production durable pre-launch record, untracked choice, launch overhead and collector guarantees remain future work; no timing or availability guarantee inferred.                                 |
| D: concurrency / stopping     | Controlled A exit then manual B activation is not production process control. One active launch per shared scope, PID identity checks and separate stop/force consent remain G1 requirements.                                                                      |
| E: product identity           | Codex Tandem / codex-tandem remain names. Current private experimental package is not publication of proposed @venkatasudhalabs/codex-tandem; scope ownership, name/license clearance and publication remain release checks.                                       |
| F: useful additions           | Resume feasibility and stable experimental metadata do not implement complete project-aware resume, identity history, replay, dashboard/health, export, updates or uninstall. Local independent stores/manual switching and scope limits remain unchanged.         |

## Source and fixture provenance

- P01: supplied codex-as-go archive SHA-256
  `b56c969b76c1105445c112f545fa5be61041641a16c2b9ccc2e2f1c504278cf8`
  differs from approved baseline
  `fd675029900bfad68382a513b17b415ced49ba51b6a1f388ffa06e5d931be67d`.
  Owner authorship/authorization is recorded in planning decisions; no license
  file was found and byte/source equivalence is not claimed. The Go executable
  is not a build/runtime dependency.
- P02: pinned codex-report commit
  `516a1d6306559d8a607de84c4d76529160349ac8` and inspected file hashes are in
  [provenance.json](../../fixtures/accounting/provenance.json); the full MIT notice
  is preserved. [CT01 evidence](../../fixtures/accounting/evidence.md) covers18
  synthetic scenarios/20 records with fixture SHA-256
  `f2cedb916e0853d3587290065d6f87d98139596cc2e0af1faf123fcff2163efd`.
  Arithmetic/provenance integrity is not an executed accounting engine or final
  package license check.
- U01: approvals/observations in the baseline and subsequent recorded owner
  decisions are distinct from measured results. The reported earlier2–3 second
  delay is not a new benchmark.
- S01–S11: external references motivate requirements; their presence in the
  register is not installed-version capability evidence. CT05/CT06 qualify only
  their observed Codex0.160.0 slices; original0.159.0 full lifecycle and arbitrary
  newer-version support remain unqualified.
- CT03 discovery, CT04 harmless-child terminal fixtures, CT05/CT06 allowlisted
  actual projections and CT07 Python direct/build artifact each retain their own
  provenance. No raw transcript, credential hash or account identity is needed
  for this review. Historical failed observations remain visible; corrected
  results are separately identified in the [decision](README.md).

Scenario review covers installation/runtime negatives, selector cancel/restore,
bridge trust/absence/malformed input/crash, controlled A/B and stale/missing
context, and sandbox/build guards. It identifies missing durable replay,
credential recovery, process races, background server, children, accounting,
browser and final lifecycle scenarios in the [handoff](support-matrix.md).
A synthetic subcase does not substitute for a missing actual-platform scenario.
