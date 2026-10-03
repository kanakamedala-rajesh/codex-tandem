# GitLab migration record

Destination: [kanakamedala-rajesh/codex-tandem](https://github.com/kanakamedala-rajesh/codex-tandem).
The owner approved migration on October 3, 2026 and reserved the final branch
merge, public visibility change and GitLab deprecation for themselves.

## Verified transfer

Both [rehearsal](rehearsal.json) and [production reconciliation](reconciliation.json)
passed with zero differences. A [resumed rehearsal](rehearsal-resume.json) performed
zero writes. GitHub issue numbers #1–#45 match their source IIDs; merged MR !1 and
!2 are historical records [#46](https://github.com/kanakamedala-rajesh/codex-tandem/issues/46)
and [#47](https://github.com/kanakamedala-rajesh/codex-tandem/issues/47).

| Preserved records                                                | Count     |
| ---------------------------------------------------------------- | --------- |
| Issues/Tasks, with content, labels, states and assignees checked | 45        |
| User comments recreated with original attribution/date           | 17        |
| Native gate/child relationships                                  | 38        |
| Native prerequisite edges                                        | 47        |
| Source label definitions                                         | 11        |
| System notes in the source archive                               | 427       |
| Commit comments and project events in the source archive         | 17 and 92 |
| Historical merged MRs                                            | 2         |
| Historical pipelines and jobs, metadata only                     | 8 and 24  |

GitHub `master` matches source `5330dbd397772b3b247f0e754c9516dce26b91a2`;
`agent/g0-compatibility` matches `0147e46aceda23c16f097c8876a978b558fc7f5c`.
Two added archival tags, `archive/gitlab/mr-1-merge` and
`archive/gitlab/mr-2-merge`, preserve GitLab's synthetic merge refs. These are
historical refs, not new releases or replayed merges. No original tags existed.

The [source inventory](gitlab-inventory.json) records backup checksums, source
drift checks, empty resource collections, hierarchy and configuration metadata.
An active `jira-cloud-app` integration reported zero linked service IDs; its
metadata is preserved, but no GitHub Jira connection is configured or claimed.
Project/group CI variables, hooks, triggers and deploy keys were empty.

## Representation

The destination is a personal repository. The approved API reconstruction route
preserves the 45 issues/Tasks as GitHub issues. Original authors and UTC dates are
recorded as provenance; GitHub's native creation timestamps describe the import.
Both already-merged GitLab MRs are closed historical issue records, not fabricated
GitHub PRs. Their original merge commits remain in the unchanged Git history.

[gitlab-records.json](gitlab-records.json) preserves original issue descriptions,
all issue notes including system events, labels, and both MRs' descriptions,
discussions, approvals, diff versions, commits and final diffs. User email/avatar
fields are omitted. Commit comments, project events and pipeline/job metadata are
also preserved. Original GitLab links in this archive are provenance.
The [active tracker map](../planning/tracker-map.json) resolves source IIDs to
GitHub issues, comments and historical MR records. The original
[gitlab-map.json](../planning/gitlab-map.json) remains unchanged for G0 evidence.

The private raw backup is retained outside Git under the operator's local
`codex-tandem/migration-20261003` application-data directory. Raw exports,
credentials, migration checkpoints and unreviewed logs must not be committed.
Keep this backup until the owner explicitly decides its retention is sufficient.

The owner explicitly selected **metadata only; retain logs in GitLab** for the
24 CI job logs. Pipeline/job metadata is migrated; log payloads are intentionally
not downloaded or uploaded. Preserve access to the archived GitLab project for
those logs. This is an accepted retention boundary, not a claim that Actions
contains historical GitLab logs.

## Verification

[Local validation](validation.json) passed on native Windows and development WSL
`Ubuntu`. [Tracker selection](selection.json) found the same ready work on both
trackers. [Hosted CI evidence](github-ci.json) records successful Node 22.15.0,
22 and 24 runs for candidate `5b638816c05064090b46c2efca426ed54f4530af`, its PR
merge result and the private rehearsal, including cache misses. A separate
deliberately malformed fixture failed all three rehearsal jobs as expected.
The [review ledger](review.md) records both resolved findings and their checks.

Review [migration PR #48](https://github.com/kanakamedala-rajesh/codex-tandem/pull/48)
and its latest exact-head checks before merging. Final evidence-only documentation
commits retain the measured executable content and receive their own Actions runs.
This migration does not expand the product's existing qualification claims.

## Reproduce reconciliation

Offline checks, also run by GitHub Actions:

```sh
python3 -B tools/verify-migration.py
python3 -B -m unittest discover -s test -p '*_test.py'
node docs/qualification/g0/audit.mjs
```

Live migration uses `tools/migrate-github.py` with explicit `--source`, `--repo`,
`--state`, `--report` and optional `--gh` paths. With no mode it only plans;
`--verify` reads the destination; `--apply` writes and then verifies. It requires
a private destination and the matching immutable source snapshot/checkpoint.
Run live checks locally with the authenticated GitHub CLI. Never put tokens in
command arguments. On an ambiguous write, rerun against the same checkpoint;
source-ID markers recover records rather than creating duplicates.

The migration preserves source blocker labels, even when their prerequisites
are now closed. Reassess actual readiness through current criteria/dependencies
when selecting work; migration does not silently change planning decisions.

## Owner cutover

After reviewing the migration PR and its exact-revision checks:

1. Merge `agent/github-migration` into `master` and verify post-merge Actions.
2. Change repository visibility when ready. The current private account returns
   HTTP 403 for branch protection and requires Pro or public visibility. Once
   available, protect `master` and require all three stable validation matrix
   checks, successful PR review as appropriate, and no force pushes/deletion.
   CI passing is not proof that GitHub enforces these policies today.
3. Confirm the final GitLab source has not changed since the recorded snapshot.
   Reconcile any late changes before making GitHub the only active tracker.
4. Update local `origin` to GitHub (retain a `gitlab` remote for provenance),
   refresh branch tracking and Codex project access, then archive/deprecate GitLab.
   Preserve the backup and historical mappings; source deletion is not necessary.

Before owner cutover, GitLab remains available and unchanged. No product issues
were newly completed by this migration. The G0 scope limits and all unqualified
acceptance families remain exactly as recorded.
