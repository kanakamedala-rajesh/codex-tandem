# GitLab to GitHub migration research

Researched 2026-10-03 against current first-party documentation. This is a
capability assessment, not an executed migration or an approved hosting decision.
No credentials were accessed and no remote resources were changed.

## Tool choice

GitHub's official `github/gh-gl2gh` extension became generally available in
August 2026. Older guidance requiring a partner engagement for GitLab migrations
is therefore stale. It targets GitHub Enterprise Cloud, including data-residency
tenants. [Official release history](https://github.com/github/gh-gl2gh/releases)

For this small project, prefer a trial with Enterprise Importer if the selected
destination is an eligible Enterprise Cloud organization. For a personal or
non-enterprise destination, plan a Git transfer plus explicit API reconstruction
and a preserved source archive; that route cannot promise equivalent history.
Destination eligibility remains to be established.

| Route                        | Code                                     | Collaboration data                                                                             | Main constraint                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Importer              | Source and commit history                | No issues or PRs                                                                               | Internet-accessible source; LFS objects separate. [Importer](https://docs.github.com/en/migrations/importing-source-code/using-github-importer/about-github-importer)                                                                                                                                               |
| Git CLI                      | Mirror includes remote branches and tags | None                                                                                           | Separately fetch and push all LFS objects. Use a fresh destination and verify refs before any mirror push. [Duplication](https://docs.github.com/en/repositories/creating-and-managing-repositories/duplicating-a-repository)                                                                                       |
| Enterprise Importer / GL2GH  | Git history and wiki                     | Issues/comments; MRs become PRs; milestones; attachments; reactions; timeline; releases/assets | Enterprise Cloud organization; export-dependent. [Supported data](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/understand-migrations)                                                                                                                                 |
| Standard REST reconstruction | Separate Git transfer                    | Current issues, labels, milestones, comments and PRs can be created                            | Public creation APIs lack historical authors, timestamps and chosen numbers. [Issues](https://docs.github.com/en/rest/issues/issues#create-an-issue), [comments](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment), [PRs](https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request) |

## Fidelity and mapping

| Source item                       | Evidence and treatment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Issue discussions                 | GEI flattens threads while retaining context. [Supported data](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/understand-migrations)                                                                                                                                                                                                                                                                                                                                                                                                                                |
| All MR states, review history     | GEI includes state events, reviewers and approvers. Inline comments require diff data; otherwise they become ordinary comments. Only the latest diff survives. [Supported data](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/understand-migrations)                                                                                                                                                                                                                                                                                                               |
| Labels and milestones             | GitLab exports both. GEI describes labels in archive metadata and explicitly supports milestones. Verify label definitions and assignments in the trial. [Export contents](https://docs.gitlab.com/user/project/settings/import_export/#project-items-that-are-exported), [Supported data](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/understand-migrations)                                                                                                                                                                                                    |
| Authors                           | GEI attributes non-commit activity to mannequins. Organization owners can reclaim them for members; repository access is a separate task. [Follow-up](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/follow-up-tasks#reclaiming-mannequins)                                                                                                                                                                                                                                                                                                                         |
| Historical timestamps and numbers | The reviewed GL2GH documentation gives no explicit comprehensive preservation guarantee. Test actual created/updated/closed/merged dates and numbering. Ordinary issue/comment/PR creation exposes no original-author or historical-time parameters; issue creation exposes no chosen-number parameter. Retain a source-kind/IID-to-destination map regardless. [Issue API](https://docs.github.com/en/rest/issues/issues#create-an-issue), [Comment API](https://docs.github.com/en/rest/issues/comments#create-an-issue-comment), [PR API](https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request) |
| Parent Tasks and blockers         | GitLab explicitly excludes links between issues/linked items and related-MR links from project exports. Parent-child work-item preservation is not clearly promised by the reviewed GEI docs; inventory and verify it independently. GitHub has native sub-issue and dependency APIs for reconstruction after IDs exist. [Export exclusions](https://docs.gitlab.com/user/project/settings/import_export/#project-items-that-are-not-exported), [sub-issues API](https://docs.github.com/en/rest/issues/sub-issues), [dependencies API](https://docs.github.com/en/rest/issues/issue-dependencies)              |
| Attachments                       | GEI supports uploads. Verify checksums and rewritten links; a copied Markdown URL alone does not establish a transferred asset. [Supported data](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/understand-migrations)                                                                                                                                                                                                                                                                                                                                              |
| Permissions                       | Recreate repository access, teams and group membership; source roles do not map directly. [Planning](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/plan-your-migration#configuring-repository-permissions)                                                                                                                                                                                                                                                                                                                                                         |

For the accepted Tandem model, retain the central tracker, specification, five
gates and all 38 child Tasks as individually mapped issues, retaining each
stable CT ID independently of any new GitHub number. The parent inventory found
45 records (7 Issues and 38 Tasks); GEI's documented support for "issues" does
not explicitly establish coverage of Task work items. Rebuild gate-to-task edges
as sub-issues and description-based blockers as verified dependencies. GitHub
supports 100 sub-issues per parent and eight nesting levels, comfortably beyond
the recorded 38-task plan. This mapping is a recommendation, not a change to the
accepted tracker decision. [Sub-issue limits](https://docs.github.com/en/issues/tracking-your-work-with-issues/using-issues/adding-sub-issues)

If reconstructing through standard APIs, preserve original author, UTC timestamp,
source URL, state and review position as explicit provenance text/archive data.
For already-merged MRs, do not perform new merges to imitate history: the public
merge endpoint actually changes the base branch. A historical record with clear
provenance is preferable to inventing equivalent native review events. Open MRs
can be recreated as PRs when their head and base branches exist; validate them
individually. These are recommendations inferred from the documented
[PR creation and merge interfaces](https://docs.github.com/en/rest/pulls/pulls).

## CI and missing operational state

GEI omits CI, policies, boards, time tracking and vulnerabilities; LFS requires
separate transfer. [Supported data](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/understand-migrations)

GitLab project exports omit variables, webhooks, job logs/artifacts, package and
container registries, encrypted tokens and several other operational resources.
Exports are incomplete snapshots, not full backups. Exported MR history retains
only the latest diff. Preserve required evidence separately before any source
retirement. [GitLab export behavior](https://docs.gitlab.com/user/project/settings/import_export/)

GitHub Actions Importer can produce workflow YAML using `dry-run`, then open a PR
using `migrate`. It needs GitHub CLI and Linux containers. GitLab authentication
uses `read_api`; GitHub requires a classic token with `workflow`. Its audit mode
requires an organization account, while dry-run/migrate also support user
accounts. Masked variable values and artifact reports need manual migration;
cross-workflow automatic caching is unsupported. For Tandem, inspect the existing
CI first and choose manual translation if it is simpler. Converted YAML still
needs meaningful Windows/Linux execution; old successful runs are not new
qualification. [Actions Importer](https://docs.github.com/en/actions/tutorials/migrate-to-github-actions/automated-migrations/gitlab-migration)

## Access, limits and acceptance checks

GEI requires an organization owner or designated migrator. GitHub classic-token
scopes are `repo`, `workflow`, plus `admin:org` for an owner or `read:org` for a
migrator; fine-grained tokens are unsupported. GitLab requires `api` and
`read_repository`. Account policy, IP restrictions and repository rulesets may
need specific migration access. Do not print tokens or include them in saved
commands. [Access requirements](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/manage-access)

Published GEI limits include 40 GiB source, 400 MiB files during import, 100 MiB
files afterward, 2 GiB pushes/commits, 255-byte refs and a 40 GB GitLab.com export.
[Size limits](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/understand-migrations#limitations-on-migrated-data)

Standard REST authentication normally permits 5,000 requests/hour; content
creation generally allows at most 80/minute and 500/hour, with stricter or
undisclosed secondary limits possible. Serialize writes, paginate reads, persist
mapping after each success, and obey rate-limit/retry headers.
[REST limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

Recommended acceptance procedure:

1. Inventory every issue/work-item type and every MR state, including closed and
   merged records, comments/discussions, approvals, assets, labels, milestones,
   parent edges, blockers, refs and LFS. Preserve a sanitized manifest and
   confidential raw export separately.
2. Trial the chosen route into a disposable destination. GEI supports trials but
   does not support delta migrations; schedule a final source-write freeze.
   [Migration procedure](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/migrate-your-repositories)
3. Compare branch/tag OIDs and LFS hashes; item counts by type/state; bodies,
   comments and attachment hashes; authors/timestamps; labels/milestones; MR
   states/reviews; every parent and blocker edge. Validate Tasks explicitly so
   a successful ordinary-issue import cannot hide missing work items.
4. Read every migration warning, reclaim identities, rebuild access/settings,
   verify links and run replacement CI. GitHub exposes a Migration Log issue;
   migration success alone is insufficient. [Follow-up tasks](https://docs.github.com/en/migrations/using-github-enterprise-importer/migrate-from-gitlab/follow-up-tasks)
5. Reconcile source/destination mappings in repository docs and agent workflows.
   Preserve original references as provenance. Retain GitLab read-only until the
   user accepts the measured gaps and cutover result.

Not executed: source export, destination eligibility/authentication checks,
trial import, number/timestamp comparison, attachment transfer, CI conversion
or cutover. The parent inventory should supply the project-specific counts and
the migration owner should resolve these checks before promising full fidelity.
