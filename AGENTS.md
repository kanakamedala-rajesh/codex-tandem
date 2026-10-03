# Codex Tandem agent instructions

## Product boundaries

Tandem is a local-first launcher and usage observer for an existing Codex CLI.
It selects saved identities, safely activates credentials, supervises launches,
and attributes observed usage across attempts and subagents. Treat the documented
product scope as requirements, not proof that a feature is implemented or qualified.

- Keep TypeScript/Node management, SQLite, collection and reporting on the modern
  host. Docker targets run their existing Codex and build tools; preserve the
  legacy environment. Ship one application with precompiled JavaScript/assets.
- Keep collection, accounting and dashboard startup off the launch path. Capture
  accepts bounded, sanitized metadata; secrets and conversation content must not
  reach analytics, logs, fixtures or committed evidence.
- Preserve credential refreshes, recoverable activation and verified process
  ownership. Ambiguous ownership blocks switching; stopping processes requires
  scoped consent. Windows and WSL keep independent live state stores.
- Attribute usage from evidence for the actual attempt and child relation. Keep
  unknowns and conflicts visible; neither the active profile nor successful
  `codex --version` output proves attribution or target qualification.

## Establish the task

Before planning or implementation, read [CONTRIBUTING.md](CONTRIBUTING.md) and
[domain.md](docs/agents/domain.md). Use the [docs index](docs/README.md) to locate
the relevant SRS requirements, register entries, accepted decisions and
[module contracts](docs/planning/implementation-spec.md). Read the affected code
and callers; resolve conflicts with approved requirements before dependent edits.

Before reading or changing issues, read [issue-tracker.md](docs/agents/issue-tracker.md);
before labeling them, read [triage-labels.md](docs/agents/triage-labels.md).
For ticket work, identify the observable acceptance cases and blockers before
coding. Implement the requested scope; preserve approved inputs for later specs
without implementing their features early. Small edits need no planning artifact.

The parent routes ticket implementation, fixes, validation, reviews, gate decisions
and GitHub delivery through [custom-agents.md](docs/agents/custom-agents.md).
“Implement next open issue” selects a ready, unblocked issue and delegates it to
tandem-implementer. Small ad hoc edits stay with the current agent; specialists
return to the parent. Each role reads [agent-contract.md](docs/agents/agent-contract.md).

## Keep implementation necessary

- Before adding a file, helper, dependency or abstraction, identify its current
  requirement and caller or maintained command. Reuse an existing module when it
  owns the behavior. Introduce a new boundary only for a concrete responsibility;
  avoid speculative extension points, unused scaffolding and pass-through layers.
- Implement the smallest complete behavior, including its relevant failure paths.
  Keep validation at credential, process, filesystem, capture and external-input
  boundaries. Handle failures explicitly; do not hide them behind success-shaped
  defaults, catch-and-continue paths or unsupported retries.
- Tests must distinguish correct behavior from a plausible defect. Prefer observable
  CLI/package outcomes, recovery, containment, replay safety and deterministic
  accounting over assertions that copy implementation details. Add fixtures only
  for distinct cases; reuse unaffected validation after focused repairs.
- Keep one source of truth for each contract. Update the owning document when
  behavior changes. Issues own task status; temporary scripts, plans, handoffs and
  review output belong in ignored `.scratch/`, CI artifacts or the PR. Add tracked
  scripts only for a recurring supported build, packaging or validation command.
- Before handoff, inspect the complete diff. Remove additions with no current
  consumer, duplicate explanations and unrelated edits. Preserve future-spec
  requirements and reusable fixtures. Every added file must have a lasting purpose
  that can be explained briefly in the handoff, without a separate report.

## Document public contracts while implementing

Write concise JSDoc beside every new or changed exported TypeScript API and public
method, including callable properties. Start with a plain-language sentence saying
what the caller gets. Explain non-obvious inputs, return meaning, errors and side
effects; include an example only when correct use is otherwise unclear.

Update comments with behavior changes. Describe the actual contract and its limits;
avoid restating names/types, filler tags and claims of unverified support. Private
helpers need comments only for non-obvious intent or invariants. Follow the public
API rules in [CONTRIBUTING.md](CONTRIBUTING.md); documentation is part of completion,
not follow-up work. The checker verifies presence; review verifies usefulness.

## Verify and deliver

Use the applicable checks in [CONTRIBUTING.md](CONTRIBUTING.md), including repository
policy. Runtime changes need behavioral evidence on native Windows and development
`wsl -d Ubuntu`; documentation-only edits need formatting and link checks. Additional
native Linux, actual-target and browser obligations come from the ticket/SRS.
Keep `Ubuntu-24.04` and `ide` untouched without new explicit authorization; Docker
validation uses an approved disposable target. Never weaken Windows protection.

Review and repairs follow [review-loop.md](docs/agents/review-loop.md): one full
review per scope, focused confirmation for accepted fixes, at most two automatic
repair rounds. Stop when the requested behavior, applicable checks and accepted
findings are complete; unrelated polish does not restart review.

Before an authorized commit/push, inspect the staged files and outgoing history,
confirm the maintained hook is active and deliver only the reviewed, validated
revision. Do not bypass hooks or weaken policy/CI to pass; enforcement changes need
explicit owner review. Existing authorization applies only within its stated scope.
Report actual checks, skips and qualification limits. Green CI or a closed ticket
does not replace missing platform or acceptance evidence.
