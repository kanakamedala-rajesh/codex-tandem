# Issue tracker: GitLab

Specs and tickets live in venkata-sudha/codex-tandem on GitLab.
Use glab from this repository.

Read tickets with their comments before working on them.
The central implementation tracker is
[GitLab #1](https://gitlab.com/venkata-sudha/codex-tandem/-/work_items/1).
Link G0–G4 gate Issues from this central tracker. Each gate owns native child
Tasks for its implementation tickets. This namespace has no available Epic type;
Issue children can only be Tasks. Preserve CT-to-GitLab mappings in
`docs/planning/gitlab-map.json` and publish in dependency order.

Every implementation ticket must contain:

- End-to-end behavior and scope.
- Requirement IDs from the authoritative requirements register.
- Acceptance-test IDs and ticket-specific acceptance criteria.
- Explicit blockers, or "None".
- Required verification evidence and applicable platforms.

The current license does not support native blocking links (verified HTTP 403).
Maintain explicit "Blocked by: #..." references in task descriptions and the
blocked label while prerequisites are unresolved. Recheck license capabilities
before adopting native blocking links.
A ready-for-agent label does not override unresolved blockers.

Preserve docs/requirements/ as the approved baseline. Record proposed
changes separately and identify any conflicting requirement IDs.

Plan G0–G4, detailing G0 first. Record tests not performed as NOT EXECUTED.

MRs as a request surface: no.
