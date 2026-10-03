# Project agents

The parent selects roles from `.codex/agents/`; small ad hoc edits stay with the
current agent. Specialists execute their assignment and return to the parent.

| Request                                             | Role                        | Model / effort        |
| --------------------------------------------------- | --------------------------- | --------------------- |
| Implement one ready issue                           | `tandem-implementer`        | `gpt-6.1-sol` / high  |
| Diagnose a failure or repair accepted findings      | `tandem-fixer`              | `gpt-6.1-sol` / high  |
| Run scoped builds, tests or platform qualification  | `tandem-validator`          | `gpt-6-luna` / medium |
| Review standards and maintainability                | `tandem-standards-reviewer` | `gpt-6.1-sol` / high  |
| Review requirements and acceptance evidence         | `tandem-spec-reviewer`      | `gpt-6-astra` / high  |
| Assess an integrated G0–G4 gate                     | `tandem-gate-reviewer`      | `gpt-6-astra` / high  |
| Perform authorized push, CI, tracker or PR delivery | `tandem-delivery`           | `gpt-6-luna` / medium |

For “implement next open issue,” read the [tracker guidance](issue-tracker.md),
select an unblocked issue within the requested gate/priority, then delegate it.
Use CT order to break ties. Read its criteria and comments; a readiness label
alone does not resolve blockers.

Each assignment includes the outcome, ticket/gate, checkout, owned files, fixed
base and candidate, evidence pointers and authorized mutations. Derive routine
paths and refs from the repo. Keep dependent edits sequential and writers in
separate files or worktrees. Serialize npm operations in a shared checkout.
Reuse an active specialist for related follow-up work.

All roles follow [agent-contract.md](agent-contract.md). Review assignments use
the [bounded review policy](review-loop.md), with independent Standards and Spec
reviews when required. Validation reports observations; Spec and Gate reviewers
judge acceptance. Delivery closes tickets or merges only within user authorization.

Role files pin `model` and `model_reasoning_effort`. Report an unavailable role or
model rather than claiming it ran. Reading a TOML file in a generic agent does not
establish that the client loaded its configuration. Reviewers default to read-only;
the remaining roles use workspace-write, subject to the live permission policy.

After changing roles, parse TOML on Windows and development Ubuntu, check matching
unique names and context links, and format Markdown. A fresh supported Codex session
may be needed to reload the catalog. Syntax checks do not prove role discovery or
behavior. Keep role prompts limited to project constraints and completion criteria.
