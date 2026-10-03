# Bounded review and repair

The parent keeps one ledger for each ticket/candidate scope: fixed base, reviewed
identity, covered contracts/files, finding IDs, evidence, dispositions and repair
count. Reuse it across handoffs and resumed sessions.

## Full review

Mark assignments `full` or `confirmation`; infer confirmation for repairs already
covered by a ledger. Full review inspects the complete assigned delta and evidence.
Standards and Spec remain independent; the parent deduplicates their findings.

In that review, check each added file's lasting purpose and caller or supported
command. Identify unused scaffolding, duplicate records, speculative abstractions
and tests that merely repeat implementation. Verify public API documentation
explains the actual contract and that future-spec inputs remain available. Record
concrete violations in the existing ledger; do not launch a separate cleanup
review or generate another report. Policy, hook or CI exceptions require explicit
owner review and cannot be introduced to make a failing candidate pass.

A blocker needs an existing contract or demonstrated regression, concrete failing
behavior and evidence. Questions and heuristic smells are advisory until proved.
The parent accepts, dismisses with a reason, or defers each finding. Only accepted
blockers enter automatic repair; unrelated improvements do not expand the scope.

## Confirmation

One round is a repair followed by confirmation. The fixer changes accepted IDs and
necessary affected code/tests. The reviewer checks those IDs, the repair delta and
its direct impact on reviewed contracts, reusing unaffected evidence. Report each
ID as RESOLVED, UNRESOLVED or NOT VERIFIED.

A new automatic blocker must be caused by the repair: cite the causal change,
existing contract and failing case. Serious pre-existing defects go to the parent
for disposition. Confirmation does not restart a full review of unchanged code.

## Stop conditions

- Resolved blockers and passing affected checks complete confirmation. Zero findings
  is a valid result; proceed to authorized delivery.
- Limit automatic repair/confirmation to **two rounds**. A new role, handoff or gate
  stage does not reset the count. After round two, return unresolved evidence and
  the decision needed to the parent.
- Changed requirements or material new implementation invalidate affected coverage
  only. The parent records the new scope and reason before further review.
- Gate review covers integration and missing gate obligations; it reuses child
  reviews rather than reopening them for polish.

Return the verdict, finding changes, evidence and next action. Material unresolved
correctness or security defects prevent a clean verdict.
