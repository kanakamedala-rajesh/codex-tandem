# Bounded review and repair

The parent owns one review ledger per ticket/candidate scope. Record the fixed
base, reviewed content identity, covered files/contracts, finding IDs, evidence,
disposition and repair-round count in a concise task note or evidence file. Reuse
it across reviewers, handoffs and resumed sessions. Do not create a new report
file for every message.

## Full review once

Specify `full` or `confirmation` in each review handoff. Infer a missing mode from
an existing ledger; a request to re-review fixes means confirmation. If scope is
unclear, resolve it with the parent rather than silently restarting full review.

In full mode, inspect the complete assigned delta and required evidence, collecting
all demonstrated issues in that scope before returning. Standards and Spec run
independently when required; the parent combines duplicate findings without
merging their conclusions. A finding needs an existing contract or a demonstrated
regression, a concrete failing behavior and evidence. A plausible question without
proof is uncertainty to investigate, not a demand for new implementation.

The parent accepts, dismisses with a reason, or defers each finding. Only accepted
blockers enter automatic repair. Subjective cleanup, alternative abstractions,
renaming, speculative hardening and additional tests without a contract-relevant
failure are not blockers. A heuristic smell is advisory unless it demonstrates a
real violation. Omit low-value suggestions; material out-of-scope observations can
be reported briefly without changing code or creating tickets automatically.

## Confirm the repair

One round is a fix followed by confirmation. The fixer changes only accepted IDs
and necessary directly affected code/tests. The reviewer checks those IDs, the
repair delta and its impact on previously reviewed contracts. Reuse unaffected
evidence. Report RESOLVED, UNRESOLVED or NOT VERIFIED with a short reason.

A new blocker during confirmation must show a direct regression caused by the
repair: identify the causal change, existing contract and failing behavior/test.
Do not search unchanged code for new improvements or reopen dismissed preferences.
An independently noticed serious pre-existing defect must still be reported, but
it goes to the parent for disposition rather than silently expanding the loop.
Any material unresolved correctness/security issue prevents a clean verdict.

## Stop conditions

- Accepted blockers resolved and affected checks passed: finish confirmation and
  continue authorized delivery. Zero findings is a valid result; there is no quota.
- At most **two automatic repair/confirmation rounds** for the scope. A new reviewer,
  handoff, renamed finding or gate stage does not reset this budget. After the second
  unsuccessful round, stop automatic rewrites and return the remaining evidence and
  smallest decision needed. The parent resolves it directly or requests a specific
  user decision; neither a false PASS nor another autonomous review cycle is allowed.
- Changed requirements or a material new implementation invalidate only affected
  coverage. The parent explicitly records the new scope and reason before further
  review; ordinary fixes and subjective preferences are not a scope reset.
- Gate review checks integration and gate obligations not already covered by child
  reviews. A gate finding needs cross-ticket or missing gate evidence; it cannot
  restart completed child reviews to seek more polish.

Keep outputs to the verdict, finding deltas, supporting evidence and next action.
Avoid repeated summaries, invented risk lists, boilerplate recommendations and
unrelated documentation churn. The aim is demonstrated correctness, not a growing
diff or an arbitrary number of reviews.
