# Issue tracker

Use GitHub Issues in
[kanakamedala-rajesh/codex-tandem](https://github.com/kanakamedala-rajesh/codex-tandem/issues)
with `gh` or the GitHub connector. The default branch is `master`; inspect local
remotes before delivery. The [central tracker](https://github.com/kanakamedala-rajesh/codex-tandem/issues/1)
links the specification and G0–G4 gates.

Resolve CT-01–CT-38 and gate IDs through `docs/planning/tracker-map.json`.
CT identifiers are stable keys; GitHub issue and PR numbers share a sequence.
Read a ticket and all comments before work, including qualification limits.
Check explicit “Blocked by” links and current prerequisite state; `ready-for-agent`
does not override blockers.

Implementation tickets contain behavior/scope, requirement IDs, acceptance-test IDs,
observable criteria, explicit blockers (or “None”), and required platform evidence.
The approved baseline remains in `docs/requirements/`. Identify conflicting IDs
when proposing changes; unperformed acceptance tests remain NOT EXECUTED.

Use paginated reads for comments and relationships:

```sh
gh issue view NUMBER --repo kanakamedala-rajesh/codex-tandem --comments
gh api --paginate repos/kanakamedala-rajesh/codex-tandem/issues/NUMBER/comments
```

REST issue listings include PRs; distinguish the `pull_request` field. Inspect the
current body before changing authorized checklist rows. After an ambiguous write,
check remote state and comments before retrying. Ticket closure requires verified
criterion evidence and authorization; closure alone does not prove a gate passed.
