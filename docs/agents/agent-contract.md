# Shared contract for Tandem agents

The parent supplies the outcome, ticket/gate when relevant, assigned checkout and
files, base/candidate identity, evidence pointers and authorized actions. Resolve
missing facts by inspection where possible. Work through the assigned outcome;
ask only when a missing decision changes scope, correctness or authority. Existing
user authorization carries through the handoff. A role is not new authorization.

## Context and ownership

Read applicable AGENTS.md. Follow its issue-tracker, label and domain pointers when
their conditions apply. Use CONTRIBUTING.md for validation and the approved
requirements plus relevant ADRs for contracts. Skills supplement those sources;
the user's explicit directions take precedence over skill guidelines. If a skill
actually blocks progress, cite its exact instruction and path to the parent.

Choose the method that fits the task; these roles define responsibilities and
completion evidence, not a mandatory sequence of tool calls. Load relevant
material once, using paths and small evidence summaries instead of copying whole
histories. These specialists return to the parent rather than spawning nested
agents. Keep messages readable and handoffs sufficient to resume without redoing
completed work. Preserve other writers' changes and use the assigned checkout.

For review or remediation, [review-loop.md](review-loop.md) governs scope, finding
acceptance, confirmation and the two-round limit. Follow that single ledger rather
than restarting review at each role handoff.

## Environment and privacy

Applicable local validation uses native Windows and `wsl -d Ubuntu`. The work distro
`Ubuntu-24.04` and `ide` container are protected: no execution or mutation there
without a new explicit user instruction changing that boundary. Docker validation
uses an identified, approved disposable target; inspect its current generation.
Keep Windows protection enabled. A prior disposable-container policy approval is
not permission to change another target or host policy.

Authentication experiments require authorization for the identities, destination
and use. Reuse already-approved private local copies within that scope; neither
repeated permission requests nor repeated copying are necessary. Keep credentials,
account identifiers, credential hashes and raw conversations out of Git and tool
output. Prefer synthetic tests; export allowlisted result metadata from live runs.
Never treat the G0 experiment's permission as blanket future credential authority.

## Evidence and handoff

Bind results to the measured source: commit/tree, or base plus a recorded dirty
delta and relevant file hashes. Include artifact checksum when packaging matters,
commands, runtime/platform/target, result, skips and sanitized evidence paths.
Reconcile pre-commit measurements with the committed content before delivery;
changed executable content invalidates the affected results. Preserve old results
and add repair evidence separately. Reuse valid evidence; rerun only for changed
behavior, failures, a required check or an unresolved concern.

Ticket criteria, complete acceptance families and release support are distinct.
Keep PARTIAL, BLOCKED and NOT EXECUTED visible; an approved scope exception does
not prove the omitted behavior. CI supplements actual Windows/Ubuntu/target checks.
Full tracking, server reuse or legacy support need their own demonstrated evidence.

Finish with the outcome, reviewed/tested identity, evidence, changes or remote
mutations performed, remaining gaps and the next owner/action. For a failure after
a partial delivery, identify the first incomplete step. No generic success claim
should hide a pending check or an unperformed platform exercise.
