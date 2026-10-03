# Issue tracker: GitHub

Specs and tickets live in
[kanakamedala-rajesh/codex-tandem](https://github.com/kanakamedala-rajesh/codex-tandem/issues).
Use `gh` or the GitHub connector with this explicit repository; discover the local
remotes rather than assuming `origin` has completed cutover. The default branch
remains `master`. Read each ticket and all comments before working on it. The
[central tracker](https://github.com/kanakamedala-rajesh/codex-tandem/issues/1) links
the approved specification and five gates.

Resolve the central tracker, specification, G0–G4 gates and CT-01–CT-38 tickets
through `docs/planning/tracker-map.json`. CT identifiers are durable planning keys;
GitHub issue and PR numbers share a sequence and must come from the map. Preserve
source provenance in that map and keep `gitlab-map.json` for historical evidence.
Discover all gate children through the map and explicit issue links; use native
sub-issues only when their destination relationships have been verified.

Every implementation ticket must contain:

- End-to-end behavior and scope.
- Requirement IDs from the authoritative requirements register.
- Acceptance-test IDs and ticket-specific acceptance criteria.
- Explicit blockers, or "None".
- Required verification evidence and applicable platforms.

Explicit "Blocked by" links and the `blocked` label preserve the imported blocker
graph. Verify current prerequisite state and qualification comments before selecting
work. Adopt native dependencies only after verifying destination support and the
same edges. A `ready-for-agent` label does not override an unresolved blocker.

Use paginated reads for issues, comments, labels and relationships. For example,
`gh issue view NUMBER --repo kanakamedala-rajesh/codex-tandem --comments` reads a
ticket, and `gh api --paginate repos/kanakamedala-rajesh/codex-tandem/issues/NUMBER/comments`
retrieves every comment. REST issue listings also contain PRs; distinguish their
`pull_request` field when counting or selecting tickets. Inspect the existing body
before patching only authorized checklist rows. Check remote state and paginated
comments before retrying an ambiguous write so resumed work avoids duplicates.

Imported comments retain their original attribution/date as provenance, with new
GitHub creation timestamps. Historical merged MRs and CI runs are archives linked
from the migration manifest; they are not new PR approvals or Actions evidence.
Preserve original closing language in the archive and use ordinary reference links
in migration PRs so the migration does not auto-close imported product issues.

Preserve `docs/requirements/` as the approved baseline. Record proposed changes
separately and identify conflicting requirement IDs. Plan G0–G4, detailing G0
first; tests not performed remain NOT EXECUTED. PRs are delivery and review records;
product requests and acceptance criteria belong in mapped issues.

The destination is private initially. The user owns merging the migration PR,
making GitHub public and later deprecating GitLab. GitLab CI remains active until
the user completes cutover; retaining it does not authorize duplicate tracker writes.
