# Implementation planning decisions

These decisions supplement the approved version 1.0 baseline in
`docs/requirements/`; they do not replace its requirements or acceptance tests.
The user accepted the decisions below during planning on October 2, 2026.

## Early compatibility experiment

Include a bounded G0 experiment on the actual target proving sanitized
turn-start capture and correct ownership across a controlled A-to-B resume.
Keep complete attribution implementation and qualification in G2. The experiment
does not establish a full-tracking support claim or waive the G1 safety work.

This resolves the sequencing ambiguity between the gate table and the smallest
useful prototype described in SRS section 17. Relevant evidence includes T14,
T19–T23 and T45; a partial experiment is not a pass for an entire acceptance test.

## Work during qualification blockers

Continue independent fixture-based testing and groundwork while real-machine
qualification is blocked. Identify blocked qualification tickets explicitly and
keep G0 incomplete until its required evidence is available. Defer dashboard
migration until Windows and container feasibility is established.

Required environments and release claims remain governed by SRS sections 16.1
and 17, including SCP-003, SEC-006 and REL-001.

## Qualification evidence

Version sanitized, reproducible fixtures, evidence manifests and result summaries
in the repository. Link GitLab tickets to the relevant commits and CI artifacts.
Keep credentials and raw transcripts out of Git.

Record the application commit, package checksum, runtime versions, platform and
target, fixture provenance, commands/results and manual steps as required by
SRS section 16. Mark unperformed tests NOT EXECUTED. Retain enough versioned
evidence to interpret a result after temporary CI artifacts expire.

## Planning status

The user approved the implementation spec and 38-ticket breakdown, closed the
grill session and authorized the normal spec-to-tickets workflow. The spec is
[GitLab #2](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/2). Central [GitLab #1](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/1) links G0–G4 gate Issues;
each gate owns native child Tasks. This mapping was explicitly accepted because
this namespace has no Epic type and Issues can only have Task children.

All 38 tasks are published with requirement IDs, acceptance-test IDs, explicit
blockers and required verification evidence. Native blocking links are unavailable
on the current license; task descriptions and blocked labels record prerequisites.
The mapping is in `docs/planning/gitlab-map.json`. Product acceptance tests
remain NOT EXECUTED. Package publication requires a separate release action.

## Reporting time

Store timestamps in UTC. Use one saved reporting timezone per installation,
initialized from the host and configurable by the user. CLI and dashboard use
that same setting rather than independently using the terminal/browser timezone.
Report ranges include the start and exclude the end. Document the effective
timezone in reports and verify calendar boundaries, including daylight-saving
transitions where applicable (UI-005; T31/T32).

## Relationship to codex-as-go

The user clarified that codex-as-go is their own Go profile-switching project
and Codex Tandem extends it. Implement its useful behavior in Tandem's approved
TypeScript stack; do not wrap or depend on the Go executable. The inspected
behavior and required improvements are recorded in
[profile-switching-reference.md](profile-switching-reference.md).

The archive is an optional source reference for details, not a prerequisite for
building, installing or running Tandem. Its checksum is provenance for the
inspection, not a runtime dependency or a reason to block the behavior port.
Keep the SRS's safety improvements and separate, explicit state-migration work.

## Manual attribution scope

The MVP preserves imported operator assertions with their lower-assurance status;
it does not introduce a new manual identity-assignment/correction interface.
Automatic reconciliation remains deterministic and audited. Stronger evidence
can resolve unknowns; contradictions remain visible conflicts and must not be
silently overwritten. A new manual assignment workflow is deferred beyond MVP
(ATT-007/008/010; T24/T29/T30).

## Pricing refresh

Ship a versioned pricing snapshot and provide an explicit refresh command.
Show the snapshot date/source, leave unknown models unpriced, and distinguish
API-equivalent estimates from subscription bills or quota. Do not make automatic
background price requests. Neither bundled pricing nor refresh may introduce
network work on the launch path (COL-009, SEC-005; T31/T37).

## Remaining technical qualification work

The following are explicit work items, not assumed capabilities or new product
scope choices:

- Qualify real installed Codex lifecycle fields, launch-context propagation,
  parent/child linkage and background-server behavior before committing to the
  capture adapter's exact contracts.
- Inspect the actual legacy target, effective paths, existing bridge facilities
  and mounted/no-mount transport; preserve the existing toolchain.
- Verify Windows process identity, credential ACLs, recoverable replacement and
  security enforcement, alongside corresponding local WSL2 behavior.
- Validate CI runner eligibility and the runtime/browser matrix; CI supplements
  rather than replaces the required local runs.
- Select and document bounded event/parser limits, physical schemas, browser
  authentication details and resolved development dependencies through their
  owning implementation/qualification tickets, within the SRS invariants.

If qualification requires changing an approved requirement or product behavior,
surface the conflict and obtain a decision rather than silently changing the
baseline. An implementation ticket dependent on an unresolved qualification
result cannot be treated as unblocked.

## Testing boundaries and local validation

The user accepted the proposed testing boundaries: installed-package CLI tests
for end-to-end behavior; focused contract tests for credential recovery, metadata
capture and accounting replay; browser tests for dashboard behavior; and actual
platform/target qualification alongside fixture tests.

During implementation, execute applicable validations locally on both native
Windows and WSL2. Record separate results, versions, commands and evidence for
each environment. CI results supplement these runs and cannot substitute for
them. A test unavailable in either local environment remains NOT EXECUTED or
BLOCKED, with the missing capability stated; it does not become a pass.

The SRS additionally requires native Linux and actual legacy-container
qualification where applicable. Windows security must stay enabled. Platform-
specific tests run on their applicable platform; Windows-only security tests
cannot be satisfied by WSL, and legacy-container tests cannot be satisfied by a
generic container fixture.

## Discovery snapshot: October 2, 2026

Read-only discovery found Windows 11, host Node v24.15.0 and npm 11.12.1,
an already-running WSL2 Ubuntu distribution, and Docker CLI 29.8.1. The
Ubuntu-24.04 and docker-desktop distributions were stopped and were not started.
The Windows Smart App Control registry value was 1; this inventory observation
is not a successful T44 qualification.

GitLab exposed shared runners, including online, unpaused runners with Linux
and Windows names. Runner tags, project job eligibility, quota and Windows
security configuration still require validation. No project or group runners
were listed. Runner inventory is not execution evidence.

The actual legacy container, its bridge facilities and target paths remain
unverified. Initial filename-bounded searches did not locate the donors. The
user subsequently supplied `C:\Users\kanak\Downloads\tmp\codex-as-go.zip`.
Donor-dependent work requires pinned revision/archive hash verification and
license review. A missing local copy does not establish remote absence.

GitHub API verification confirmed that the pinned codex-report commit
`516a1d6306559d8a607de84c4d76529160349ac8` exists and its
[license](https://github.com/kanakamedala-rajesh/codex-report/blob/516a1d6306559d8a607de84c4d76529160349ac8/LICENSE)
is MIT.

### Supplied codex-as-go archive

Read-only ZIP inspection confirmed a codex-as Go project with a README, source,
scripts and embedded Git metadata. No LICENSE or COPYING file was found in the
archive. No archive content was executed or extracted into this repository.

- SRS P01 archive SHA-256:
  `fd675029900bfad68382a513b17b415ced49ba51b6a1f388ffa06e5d931be67d`.
- Supplied archive SHA-256:
  `b56c969b76c1105445c112f545fa5be61041641a16c2b9ccc2e2f1c504278cf8`.

The archive does not match the pinned baseline bytes. The user confirmed that
the code is their own and supplied this ZIP for the donor work; they noted that
archive creation may explain the difference. Use the supplied ZIP as the current
donor reference, retaining both hashes and the ownership confirmation. Do not
claim byte or source equivalence with the original archive without evidence.
The approved SRS provenance remains unchanged. No license file was present;
the user's ownership confirmation is the recorded basis for this project's
authorized donor work, not a claim that the archive includes an MIT license.

All application acceptance tests remain NOT EXECUTED.

## Accepted GitHub migration: October 3, 2026

The user approved migration to the private personal repository
[kanakamedala-rajesh/codex-tandem](https://github.com/kanakamedala-rajesh/codex-tandem)
with `master` retained as the default branch. GitHub issues and Actions are the
prepared destination workflow. Use `docs/planning/tracker-map.json` for active
GitHub identities and preserve `gitlab-map.json` plus the original GitLab records
as historical provenance. CT identifiers, requirements, qualification limits and
the bounded review policy remain unchanged.

The accepted non-Enterprise route copies Git history and imports issues/comments
with original attribution/date in their text. Historical merged MRs and pipelines
have archive representations; new GitHub timestamps, PRs and Actions runs cannot
replace their original identities. Migration is not product implementation and
must preserve imported issue states without closing-keyword side effects.

The user will merge the migration PR, make GitHub public and later deprecate
GitLab. Keep GitLab CI until that cutover and avoid dual tracker writes. Private
repository protection returned HTTP 403 because the destination requires an
eligible plan or public visibility; required-check enforcement remains unavailable
until the owner enables it. The prepared Actions workflow and manual checks do
not establish enforced branch protection or a completed cutover.

Migration acceptance still requires the verified map, reconciliation, exact
candidate Actions evidence and separate native Windows/development Ubuntu checks.
Earlier planning/discovery entries above remain historical source records.
