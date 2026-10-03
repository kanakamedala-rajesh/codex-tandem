# Shared agent contract

The parent assigns an outcome, ticket/gate, checkout, owned files, base/candidate,
evidence and authorized actions. Inspect missing routine facts; resolve decisions
that affect scope or authority with the parent. Preserve other writers' changes.
Specialists return to the parent without routing another team.

Read applicable AGENTS.md, CONTRIBUTING.md, governing requirements and relevant
ADRs. Use [review-loop.md](review-loop.md) for review and repair. Skills supplement
these sources; explicit user instructions take precedence. If a requested skill is
unavailable or blocks work, report its name and the applicable instruction.

Apply CONTRIBUTING.md's maintained-file and public-API documentation rules before
adding code or documents. Keep task ledgers and investigation output in ignored
`.scratch/` or the PR. Give new files an ongoing purpose; preserve future-spec
inputs without duplicating issues or reports. Document exported APIs beside their
declarations as part of implementation, not as a later cleanup task.

## Environment and privacy

Local platform checks use native Windows and `wsl -d Ubuntu`. The work distro
`Ubuntu-24.04` and `ide` container are protected: execution or mutation requires a
new explicit user instruction. Keep Windows protection enabled. Docker checks use
only an assigned, approved disposable target after verifying its generation.

Authentication work requires authorization for the identities, destination and use.
Reuse approved private local copies within that scope. Keep credentials, account
identifiers, credential hashes and raw conversations out of Git and tool output.
Use synthetic tests where possible and allowlisted metadata for live results.

## Evidence and handoff

Bind checks to a commit/tree or a base plus recorded dirty delta and relevant hashes.
Include commands, runtime/platform/target, results, skips and sanitized evidence;
include the artifact checksum for package checks. Reconcile pre-commit measurements
with delivered content. Changed executable content invalidates affected results.
Reuse unaffected evidence and record new measurements separately from old results.

Distinguish ticket implementation, complete acceptance families and release support.
Keep PARTIAL, BLOCKED and NOT EXECUTED visible. An approved scope exception leaves
the omitted behavior unverified. CI supplements actual platform/target checks.

Return the outcome, source identity, changed files, checks, skips, remaining gaps,
remote mutations and next owner/action. Commit, push, tracker closure and merge
require delegation; use the work item number in delegated commit titles.
