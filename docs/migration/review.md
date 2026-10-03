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

Automatic repair/confirmation rounds used: 2 of 2; S1 and C1 resolved.

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
verification passed within the migration scope. The subsequent evidence
confirmation below completes the hosted and tracker-selection coverage without
restarting the full code review.

M4 selection confirmation: PASS. The read-only exercise in `selection.json`
preserves the same ready set (CT-09 and CT-22), selects CT-09 first and checks
38 tickets, 47 blocker edges and seven relevant comments. No new findings.

C1 accepted from hosted CI: the Python isolation test inherited GitHub's
`HOME=/github/home` into its synthetic container child, producing the intended
`HOME_USER_MISMATCH` rejection instead of a successful isolation probe. The fixer
reproduced the failure on development Ubuntu by injecting that HOME; normal
execution passed. Repair is limited to the test's simulated target environment,
with explicit coverage retaining rejection of a mismatched HOME and unchanged
poison sentinel. Product and workflow behavior remain unchanged. Native Windows
and development Ubuntu discovery suites each passed 14 tests with two platform
skips; Ubuntu's focused test also passed with injected `HOME=/github/home`.
Scoped formatting, lint and type checks passed on both hosts. Repaired test
SHA-256: `1639525574375cd4e2ce0efffc17fd1bea81ef3f59b7d85dafad9ab3355dc469`.
C1 independent confirmation: RESOLVED with no direct regression. The intentional
formatting failure in rehearsal run `37098012007` remains valid: all three jobs
rejected the malformed JSON and uploaded their artifacts. C1 affects a later test,
not that failure path. This demonstrates failure propagation, not enforced branch
protection. Initial failed runs remain part of the evidence.

Final Spec evidence reconciliation: PASS at
`5b638816c05064090b46c2efca426ed54f4530af`. The production push, PR merge-ref and
positive rehearsal each passed all three Node jobs with cache misses and retained
result artifacts; run identities and outcomes are in `github-ci.json`. The reviewer
matched all nine downloaded result files with the delivery report, including PR
head/base/merge-source binding, and confirmed the reviewed tool, workflow, test,
selection and local-evidence hashes. Its own CLI context could not reread the
private runs, so remote conclusions rely on the authenticated delivery evidence
and matching downloaded artifacts, not an independent API read claim.

Final documentation adds this verdict, the hosted evidence record and a README
verification index only. The README hash in the earlier local validation record
identifies the pre-index document; executable inputs are unchanged. Delivery must
verify Actions on that final documentation commit before handoff. No further
product checks, repair rounds or full reviews are required for this evidence-only
delta. Merge, public visibility, protection setup and GitLab cutover remain with
the owner; current private-repository protection is unavailable (HTTP 403).
