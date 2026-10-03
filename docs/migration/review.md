# Migration review ledger

Base: `5330dbd397772b3b247f0e754c9516dce26b91a2`.
Scope: approved GitLab-to-GitHub migration tooling, CI, active agent/docs updates,
preserved source records and destination reconciliation. The owner retains merge,
public visibility and GitLab deprecation. Raw CI logs stay in GitLab by the owner's
explicit decision; metadata is migrated.

One full standards review covers the static implementation while the rehearsal
and data reconciliation complete. One full spec review covers the integrated
candidate and migration evidence. Generated maps/reports and final links are
expected in-progress work until that candidate is pinned. Confirmation is limited
to accepted findings and directly caused regressions under the shared review policy.

Automatic repair/confirmation rounds used: 1 of 2.

S1 accepted: a removed body marker could cause a duplicate POST despite a saved
destination ID. Repair uses the checkpointed ID as a guard before issue/comment
creation, failing on removed markers, deleted IDs or conflicting markers.
Regression coverage checks both issue and comment recovery. Standards full review
reported no other findings. S1 confirmation: RESOLVED; six mocked integration
cases (removed marker, deleted ID and reassigned marker for issues/comments) each
failed with zero mutations. Seven focused tests passed. Reviewed script SHA-256:
`d1bca3d21b60a2955ef0a0e35e735d6eb7a41bfcc2c59babc9e8bbe740f70a4d`.
Full static Spec review reported zero demonstrated defects. It independently
compared every retained archive field with the private source backup, checked
export/bundle checksums, all 38 link-only draft changes, unchanged historical
evidence and the six source hashes in `validation.json`. Windows and Ubuntu
verification passed within the migration scope. Final acceptance requires only
the pinned GitHub Actions/rehearsal and tracker-selection evidence; reviewing
those results does not restart the full code review.
