# GitHub migration implementation plan

Status: approved October 3, 2026; execution is recorded in
[the migration record](../migration/README.md). This plan covers code, project
records, automation, agent instructions and historical evidence. The owner
provided the private personal repository `kanakamedala-rajesh/codex-tandem` and
reserved the final merge, public visibility and GitLab deprecation for themselves.

The recommended approach is a rehearsed migration followed by one controlled
cutover. Preserve original Git commits and CT identifiers, recreate the working
development workflow on GitHub, and retain a verified archive for history that
GitHub cannot represent natively. Do not treat a Git push as a complete migration.

## Verified source inventory

Read-only GitLab REST inventory and local inspection on October 3, 2026:

| Resource              | Observed state                                                                                                          |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Source                | Private `venkata-sudha/codex-tandem`, project ID `87154127`                                                             |
| Default branch        | `master`, local HEAD `5330dbd397772b3b247f0e754c9516dce26b91a2`                                                         |
| Live remote branches  | `master`, `agent/g0-compatibility`                                                                                      |
| Issues and Tasks      | 45 total: 7 Issues and 38 Tasks; 36 open, 9 closed                                                                      |
| Planning structure    | Central tracker #1, spec #2, G0–G4 #3–#7, CT-01–CT-38 #8–#45                                                            |
| User comments         | 17 on issues/tasks; their qualification decisions were read                                                             |
| Merge requests        | !1 G0 and !2 project agents, both merged into `master`; zero user notes reported                                        |
| Pipelines             | 8, all currently successful                                                                                             |
| Labels                | 11, including `feature` in addition to the documented triage labels                                                     |
| Access and protection | One effective project member; protected `master`                                                                        |
| Empty inventories     | Tags, milestones, releases, wiki pages, packages, container repositories, uploads, boards, webhooks, pipeline schedules |

The local `origin/agent/project-agents` reference is stale relative to the live
branch listing. Use live remote refs for migration, not cached tracking branches.
Recount everything at the freeze; these figures are a planning snapshot.

Still to inventory: all system events and MR diff versions/approvals; commit
comments; snippets; LFS objects and historical large blobs; submodules; artifacts
and trace availability; inherited settings, variables and integrations; deploy
keys, access tokens, triggers, environments, Pages and security records. An
uninspected resource is not an empty resource. Record variable names/scopes and
ownership without exporting values into reports or Git.

## Choose the migration route

The confirmed destination is the private personal repository
`kanakamedala-rajesh/codex-tandem`. Use the approved non-Enterprise route and
retain `master`. The alternatives below record the original route decision.

1. **Preferred when available: GitHub Enterprise Importer using GL2GH.** GitHub
   documents GitLab.com imports into Enterprise Cloud organizations, including
   issues and MRs as PRs. This best matches the request to preserve the working
   project and review history. Confirm access and rehearse before selecting it.
   [Official migration scope](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/understand-migrations).
2. **Without Enterprise: Git transfer plus a resumable API migration.** Recreate
   issues, comments, labels and relationships; carry original author/date/source
   metadata in each imported record. Ordinary API creation is not historical
   impersonation or timestamp preservation. Historical merged MRs need an explicit
   archive representation unless a supported importer can preserve native PR
   state. Do not replay merges or fabricate approvals to make history look native.
   This route requires acceptance of those representation differences before
   production cutover; it is not an equivalent full-fidelity import.

GitHub's ordinary web importer only transfers code/history, so it cannot satisfy
this project on its own. Detailed source research is in
[github-migration-research.md](github-migration-research.md).

## Migration contract

Every source object must end in one of four explicit states: migrated natively,
preserved in an accessible archive, intentionally excluded by an owner decision,
or unresolved. Completion requires zero unresolved objects. Never discard data
silently, or describe an archive-only record as a native GitHub feature.

| Area                  | Destination and preservation rule                                                                                                                                                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code                  | Same commits, trees, authors, dates, branches and tags; separately copy LFS if discovered. Preserve deleted-MR source commits in the backup. Do not rewrite old commit messages to update issue numbers.                                                |
| Issues and Tasks      | GitHub Issues with titles, full bodies, checklists, states, labels, assignees where mapped, comments and provenance. Preserve all 38 Tasks, not just the seven top-level Issues.                                                                        |
| Hierarchy             | Central tracker links spec and five gate issues; each gate links its CT tasks. Use native sub-issues where verified, with explicit links and the mapping as a reliable fallback.                                                                        |
| Dependencies          | Preserve every CT blocker edge. Use supported native dependencies if available to the target account; otherwise retain explicit linked blockers and existing `blocked` labels. Do not recompute readiness during migration.                             |
| Merge requests        | Preferred route: native PRs, preserving merged/closed/open state and review data to the importer's supported extent. Also archive descriptions, discussions, approvals, diff versions and original merge SHAs. Validate both existing MRs individually. |
| CI history            | Archive original pipeline/job metadata, available logs and artifacts with checksums. New Actions runs are new evidence, never replacements for GitLab pipeline identities.                                                                              |
| Project configuration | Recreate protection, merge/check policies, permissions and integrations explicitly. Verify private-repository plan entitlement before depending on rulesets or required checks.                                                                         |
| Other assets          | Recount and migrate releases, wiki, uploads, snippets, packages, images and deployment assets if discovered. The current zero counts do not waive the freeze-time check.                                                                                |

Issue numbers cannot be assumed stable: GitLab issues and MRs use separate
sequences while GitHub issues and PRs share numbering. Use CT IDs as durable
planning keys. Persist source project/type/ID/IID/URL and destination type/node
ID/number/URL, plus comment, upload and relationship mappings. Keep the original
`gitlab-map.json` as historical provenance; introduce `tracker-map.json` for the
active tracker and a migration manifest for all objects, including both MRs.

Link conversion must distinguish `#issue`, `!MR`, work-item URLs, blob/commit URLs,
pipeline URLs and cross-project references. Preserve the original body in the
archive; convert operational links through the map in a second pass. Unresolved
references fail reconciliation. Do not mass-replace every occurrence of GitLab.

## Implementation work packages

These are proposed migration tasks, not new GitLab/GitHub issues and not a
renumbering of the approved CT-01–CT-38 product backlog.

### M1 Establish destination and backup

- Confirm owner, private visibility, route, access, identity mapping and archive
  location/retention. Verify GitHub authentication without exposing credentials.
- Enumerate every source collection with pagination, including comments and
  system events. Record exact refs, item counts, relationships and timestamps.
- Create a full GitLab export, independent Git backup and separate API archive
  for export omissions. Download available artifacts before expiration; record
  already expired items explicitly. Inspect historical LFS and blob limits.
- Store raw exports and logs in restricted storage outside the product repository;
  commit only sanitized inventories, maps, checksums and migration tooling.
- Acceptance: backup integrity and a restore/readback exercise pass; every
  inventory class is counted or has a specific unresolved access limitation.

### M2 Rehearse data migration

Depends on M1. Use a private disposable destination with matching capabilities.

- Pin the chosen importer/tool version and capture its settings and warnings.
  Check Task work items and gate hierarchy explicitly: generic issue support does
  not prove that these relationships transfer.
- If custom tooling is needed, support plan/apply/verify modes, stable source IDs,
  an external checkpoint ledger, pagination, bounded retries and rate-limit
  backoff. Reconcile ambiguous writes before retrying; resuming must not duplicate
  issues or comments. Fail closed on unexpected destination edits.
- Create/map records first, then comments and links, then relationships and final
  states. Prevent imported closing keywords, mentions or automation from causing
  unintended transitions. Control notifications where supported.
- Confirm original user attribution through supported identity reclamation, or
  clearly identify original attribution in imported text. Do not assume matching
  display names proves identity.
- Compare every record, all 17 current user comments, all CT mappings, all blocker
  edges and both merged MRs. Retain system-event and original-diff archives even
  where native presentation is simplified. Produce a concrete fidelity report.
- Acceptance: resumability and reconciliation pass; all unsupported fields have
  a readable destination/archive representation and an explicit decision.

### M3 Replace GitLab CI with GitHub Actions

Can run alongside M2 once the destination is selected. Work on
`agent/github-migration`, created after the owner's implementation approval.

Add `.github/workflows/ci.yml`, initially preserving the Linux matrix and command
semantics from `.gitlab-ci.yml`: Node `22.15.0`, maintained `22`, and `24`.
Use the corresponding official Bookworm images on an Ubuntu runner for parity;
explicitly provision Python rather than assuming its availability in an image.

Each matrix entry must run:

```sh
npm ci --ignore-scripts --engine-strict --cache .npm-cache --prefer-offline
npm run validate
npm run verify:installed
node tools/verify-accounting-fixtures.mjs
python3 -B -m unittest discover -s test -p '*_test.py'
```

Use PR and default-branch push triggers with deliberate branch coverage, stable
required-check names, read-only default token permissions, pinned third-party
actions and lockfile/runtime-keyed npm caches. Keep untrusted PR execution away
from secrets and privileged triggers. Test cache misses, all matrix entries and
an intentional failure in the disposable rehearsal. Retain concise run/artifact
evidence with source SHA and explicit retention.

Keep GitLab validation active until GitHub CI and protection pass. Additional
Windows hosted CI can be a separate improvement; native Windows and development
WSL `Ubuntu` validation remain mandatory under existing project policy. Neither
CI service substitutes for actual target qualification. No live credential or
container experiment is needed solely for the hosting change.

Acceptance: the same validation contract passes locally on Windows and Ubuntu
and on the exact GitHub candidate; a failing required check prevents merge where
the target plan supports enforcement. Any plan limitation remains visible.

### M4 Update repository and agent workflows

Depends on verified mappings from M2; can prepare alongside M3.

| Files                                                                                         | Planned change                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `AGENTS.md`, `docs/agents/issue-tracker.md`                                                   | GitHub becomes the active tracker; use `gh` or the GitHub connector, read issues plus comments, map children/dependencies, use pagination and avoid duplicate writes.          |
| `docs/agents/triage-labels.md`                                                                | Preserve all live labels and meanings; reconcile the existing undocumented `feature` label without silently deleting it.                                                       |
| `.codex/agents/tandem-delivery.toml`                                                          | PR and Actions delivery, GitHub authentication, exact-head check verification, post-merge checks and authorized issue closure. Remove the GitLab credential-helper workaround. |
| `.codex/agents/tandem-gate-reviewer.toml`                                                     | Read the active tracker map and GitHub child state, preserving all qualification limits.                                                                                       |
| `.codex/agents/tandem-standards-reviewer.toml`, `docs/agents/custom-agents.md`                | Update platform-specific terminology and examples. Preserve model assignments, routing and the bounded review loop.                                                            |
| `CONTRIBUTING.md`, `docs/README.md`, root `README.md` where applicable                        | GitHub URLs, checks, contribution and clone instructions.                                                                                                                      |
| `docs/planning/central-tracker.md`, `implementation-spec.md`, `ticket-plan.md`, draft tickets | Update active links using the migration map while retaining approved product content and CT IDs.                                                                               |
| `docs/agents/planning-decisions.md`                                                           | Append the accepted hosting/tracker decision; preserve historical decisions.                                                                                                   |
| `docs/planning/tracker-map.json`                                                              | Active GitHub IDs and URLs with durable CT/gate keys and source provenance.                                                                                                    |

No GitLab references were found in `src/`, `scripts/`, `tools/` or `test/` in
the current tracked search. Product behavior should therefore need no hosting
refactor. Recheck rather than assuming a repository-wide replacement is safe.

`docs/qualification/g0/audit.mjs` deliberately reads the historical
`gitlab-map.json`. Keep that audit and its recorded evidence reproducible; add a
separate current-tracker reconciliation check instead of rewriting the G0 record.
Preserve requirements, fixture bytes, checksums and all historical qualification
files. Add a source-to-destination evidence index for old links. Do not rewrite
successful GitLab pipeline URLs as if they were GitHub Actions results.

Acceptance: active instructions use GitHub; remaining GitLab references are
classified historical/source references. Agent TOMLs parse on Windows and
Ubuntu, Markdown formatting and links pass, historical G0 audit still passes,
and a read-only agent exercise selects the same ready/blocked work from GitHub.

### M5 Production migration and cutover

Depends on M2–M4 and approval of the rehearsal's concrete fidelity report.

1. Announce and enforce a short source write freeze covering pushes, issue edits,
   automation and merges. Take a fresh final export and inventory. GitHub's
   importer does not support delta imports; the rehearsal is not the final copy.
   [Production migration guidance](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/migrate-your-repositories).
2. Import into the final private destination, reconcile objects/relationships,
   restore approved permissions and protected-branch checks, and apply the tested
   CI/docs changes. Avoid enabling workflows or external webhooks before their
   inputs and permissions have been checked.
3. Validate the final revision, required checks and all migrated records. Complete
   one real PR/check workflow for the migration changes, within the authorized
   merge scope. Do not close or implement a product ticket merely to test tooling.
4. Make GitHub authoritative. Rename the old local remote to `gitlab`, add GitHub
   as `origin`, update tracking/default refs and document the cutover SHA/time.
   Check Windows and Ubuntu clones, managed worktrees and the Codex project's
   integrations. Preserve unpublished local refs and ignored evidence.
5. Publish the destination and migration map in the source project, then archive
   GitLab after verification and authorization. Keep source access and the
   independent archive for the agreed retention period; do not delete GitLab as
   part of initial cutover. Revoke migration-only credentials and remove temporary
   staging copies according to the recorded retention policy.

### M6 Reconcile and close the migration

- Source Git SHAs match destination before the new migration commits; every
  expected branch/tag and LFS object is accounted for.
- Freeze-time issue/task/comment counts, content, states, labels, CT identifiers,
  hierarchy and blocker graph reconcile. Migration-generated records are counted
  separately. Both MRs retain their original merge-commit references and final
  state in the agreed representation.
- All eight currently observed pipelines and any later runs have an archive
  index; unavailable logs/artifacts are declared, never reported copied.
- Immutable requirements/evidence hashes remain unchanged. G0 remains closed for
  its approved bounded scope; broader legacy/acceptance gaps remain unqualified.
- Private visibility, collaborator access, required checks, Actions execution,
  agent routing and independent Windows/Ubuntu validation are demonstrated.
- Every inventory category has migrated, archived or explicitly accepted-excluded
  status; zero unresolved objects or unexplained count/content differences.

## Rollback and ownership

Before cutover, GitLab remains authoritative and a failed rehearsal is disposable.
Keep the production source frozen until final verification. If verification
fails before opening GitHub for work, restore local remotes/settings and resume
GitLab; retain failed-destination diagnostics for a corrected migration.

After GitHub receives new work, rollback requires a fresh inventory and explicit
reconciliation of those new commits/issues/comments before resuming GitLab.
Never overwrite new destination work with a mirror push or silently run two
authoritative trackers. A documented owner decision ends the freeze.

Use `tandem-implementer` for migration tooling/CI/docs, `tandem-validator` for
reconciliation and platform checks, and `tandem-delivery` for authorized remote
operations. Independent standards/spec review evaluates the fixed candidate and
fidelity report; Astra owns the final acceptance assessment. Apply the existing
one-full-review and bounded confirmation policy, not a new review loop per phase.

## Decisions needed before execution

- Destination GitHub owner/repository and Enterprise Cloud availability.
- Acceptance of any archive-only history if native full-fidelity import is not
  available; otherwise use an eligible destination/import service before moving.
- Private backup location, retention period and the production freeze window.

The recommended execution order is M1, then M2/M3 preparation in parallel, M4,
then M5 and M6. Estimate the freeze from the rehearsal rather than promising a
duration before export size, importer behavior and destination limits are known.
