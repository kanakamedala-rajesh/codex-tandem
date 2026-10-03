# Project Codex agents

These project-scoped roles live in `.codex/agents/`. They are a toolbox for repeated
Tandem work, not a requirement to launch seven agents. The top-level agent selects
the relevant role from the request; small ad hoc changes stay with the current agent.

## Request routing

You do not need to name an agent. AGENTS.md instructs the parent to use this mapping:

| Request intent                                                              | Routing                                                                             |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Implement an issue, including "Implement next open issue"                   | Read tracker/dependencies, select one ready issue, delegate to `tandem-implementer` |
| Diagnose a failure or fix accepted findings                                 | `tandem-fixer`                                                                      |
| Run builds, tests or platform qualification                                 | `tandem-validator`                                                                  |
| Review a ticket implementation                                              | Independent Standards and Spec roles, with the bounded review contract              |
| Verify a whole gate or milestone                                            | `tandem-gate-reviewer`                                                              |
| Push, track CI, close a verified ticket, or perform requested merge/wrap-up | `tandem-delivery`, limited to authorized actions                                    |

For the next issue, respect the user's gate/priority and explicit blockers; within
equally ready work use planning order. Read the selected ticket and comments before
dispatch. Resolve the ticket and gate through `docs/planning/tracker-map.json` and
the GitHub guidance in [issue-tracker.md](issue-tracker.md). A label alone does not
make an issue ready. Discover routine handoff details
instead of asking the user to fill out a form. The request to implement does not by
itself authorize a merge, publication or unrelated tracker changes.

This is model-directed routing via project instructions, not a background hook or
a keyword scheduler. Descriptions help Codex choose; TOML files alone do not force
a launch. Reuse an active specialist for the same responsibility. A specialist
receiving a task executes it and returns, avoiding recursive routing. If the client
cannot select custom roles, report that limitation instead of claiming the pinned
model or role was activated. The user can still name a role to override selection.

## Choose a role

| Agent                       | Use for                                                              | Completion handoff                                       |
| --------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `tandem-implementer`        | One ready ticket in its assigned worktree                            | Implementation and criterion evidence, with review needs |
| `tandem-fixer`              | A reproduced failure or accepted review findings                     | Each finding resolved or explicitly unverified           |
| `tandem-validator`          | Windows, Ubuntu, packed artifacts and approved actual-target checks  | Separate platform results and sanitized evidence         |
| `tandem-standards-reviewer` | Independent standards and maintainability review                     | Findings tied to documented rules or concrete costs      |
| `tandem-spec-reviewer`      | Independent ticket/contract and evidence review                      | Criterion coverage and demonstrated gaps                 |
| `tandem-gate-reviewer`      | Integrated G0–G4 feasibility/completion decision                     | Gate matrix, verdict and downstream limitations          |
| `tandem-delivery`           | Authorized integration, push, CI, GitHub bookkeeping, PR and wrap-up | Verified remote state and first unfinished step          |

Every role reads [agent-contract.md](agent-contract.md). The top-level agent owns
coordination and user communication. Standards and Spec remain independent axes;
use both when the invoked review workflow requires them. A fixer does not approve
its own repair. A gate reviewer reports its decision; delivery records an authorized
closure after checking that evidence belongs to the delivered revision.

## GPT-6 use and delegation

Each role explicitly sets a GPT-6 family model and reasoning effort:

| Work                                          | Model         | Effort   |
| --------------------------------------------- | ------------- | -------- |
| Implementation, fixes, standards review       | `gpt-6.1-sol` | `high`   |
| Validation execution, builds, GitHub delivery | `gpt-6-luna`  | `medium` |
| Final spec/evidence verification, gate review | `gpt-6-astra` | `high`   |

Luna runs the scoped checks and reports observations; Astra decides whether the
evidence establishes acceptance and gate readiness. Complex diagnosis returns to
the fixer rather than turning the delivery operator into an architect. This is a
workload choice, not a measured claim that one model always outperforms another.

Custom-agent `model` and `model_reasoning_effort` are supported settings. Values
in the role file take precedence over resolved spawn/default/parent settings.
Without a file value, the documented order is explicit spawn, subagent default,
then parent; model changes without an effort may select that model's default.
Change the role file to change its pinned model. If a model is unavailable, report
that mismatch rather than silently using another family. Parent session settings,
concurrency and permission policy remain unchanged.

Start with the one role needed for the request. Add another only for independent
work or required review. Keep dependent edits sequential, give writers separate
file ownership/worktrees, and avoid parallel npm operations in one checkout. When
an explicitly invoked implementation skill requires implementer/merger agents,
honor that workflow without adding extra layers. Specialists do not form nested
teams. Use a fresh bounded task context where supported, with outcome, constraints
and evidence pointers; pass history only when it materially helps.

Continue useful independent work while a delegate runs, then wait with the available
event-driven mechanism instead of repeatedly polling unchanged state. Reuse an
existing specialist for a focused follow-up when it retains useful context. Creating
or messaging separate user-visible chats remains a user-authorized operation, not
an automatic optimization. The role catalog alone does not schedule agents.

The prompts specify project constraints and observable outcomes. They leave routine
tool choice and problem solving to GPT-6. Safe in-scope edits and disposable local
checks proceed without repeated approval. Match verification to the change and
stop once the required evidence is adequate. Keep reports short while retaining
failures, evidence and decisions that affect completion.

## Example requests

Ordinary requests route automatically under this project's instructions:

> Implement next open issue.

> Verify the current ticket on Windows and Ubuntu.

Explicit names remain useful for precise delegation, with real ticket/revisions:

> Use tandem-implementer for #16 in its own worktree from the integration branch.
> Implement the ticket and run applicable local checks. Return for independent review.

> Have tandem-standards-reviewer and tandem-spec-reviewer independently review
> BASE_SHA through HEAD for #16. Keep their findings separate.

> Use tandem-validator to verify this candidate on native Windows and development
> Ubuntu. Use only the disposable container identified in the handoff for actual-target checks.

> Use tandem-delivery to push the reviewed commit, verify its Actions run, record the
> supplied acceptance evidence and close #16. Do not merge a request in this task.

> Use tandem-delivery to create and merge the reviewed PR into the confirmed default
> branch, verify post-merge CI, then remove the merged local task branches.

Include the ticket/gate, base and candidate, assigned path, owned files, evidence
paths, expected result and authorized mutations. For a confirmation review include
the original finding IDs and repair delta. Derive missing paths/refs from the repo;
resolve material ambiguity such as `main` requested when only `master` exists.

## Review without churn

[review-loop.md](review-loop.md) is the authority for all review/fix handoffs.
One full review produces accepted finding IDs. Fixes receive confirmation reviews,
not another hunt for improvements. Only proven repair-caused regressions can add
automatic blockers during confirmation. Two repair/confirmation rounds are the
limit; unresolved defects remain visible and require a parent decision. Required
checks still apply, and a clean review proceeds directly to authorized delivery.

## Installation and maintenance

The [Codex custom-agent format](https://learn.chatgpt.com/docs/agent-configuration/subagents#custom-agents)
uses one standalone TOML file per role with `name`, `description` and
`developer_instructions`. Names match filenames here. There is no duplicate role
registry in `.codex/config.toml`. Open a fresh Codex session in the trusted project
after changing definitions if the current session retains its old agent catalog.
Selection depends on the client's custom-agent support; merely reading a TOML
file in a generic subagent is not proof that its configuration was loaded.

Reviewers default to `read-only`; other roles default to `workspace-write`.
Live parent permission overrides and connector access still govern execution.
These defaults are not an independent security boundary or access to credentials.

When modifying roles, parse TOML on Windows and Ubuntu, check unique names and
context pointers, and format maintained Markdown. Use a local Codex loader check
when available. Distinguish syntax/loading validation from behavioral evaluation;
exercise a representative workflow before claiming improved model performance.
Do not run live authentication/build experiments just to test prompt wording.

Initial checks on 2026-10-03 passed on native Windows and development Ubuntu:
seven TOML definitions, unique matching names, explicit GPT-6 models/efforts,
valid shared-context links and Markdown formatting. The installed Windows debug
prompt command completed but did not expose the custom-role catalog, so it does
not establish discovery. Live role spawning and comparative model performance
remain unverified; check the selected role/model in a fresh supported session.

## Design references

Reviewed 2026-10-03. Original Tandem prompts; the
[CodexFolio agents](https://github.com/kanakamedala-rajesh/codex-folio/tree/main/.codex/agents)
inspired role separation, not copied instructions or its GitHub/DCO policies.

- [Rethinking skills and prompts for GPT-6 Astra](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra): short triggers, conditional references and outcome-driven instructions.
- [Using GPT-6: prompting guidance](https://developers.openai.com/api/docs/guides/latest-model#prompting-best-practices): continued execution within scope, clear authority, deliberate delegation and proportionate verification.
- [Provencher: efficient delegation](https://x.com/pvncher/status/2098841379837260144): public syndication exposed only a truncated excerpt about planning and dispatching to another thread. The unretrieved continuation is not treated as an instruction; no automatic cross-chat messaging is configured.
- [Provencher: avoid unnecessary subagents](https://x.com/pvncher/status/2105385364240408612): informs the single-agent default and optional specialist selection.

Keep the catalog and shared contract small. Revise prompts when a repeated measured
failure justifies a rule; avoid turning every one-off recovery into permanent policy.
