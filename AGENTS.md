## Agent skills

### Issue tracker

Specs and tickets live in GitHub Issues. Before creating, reading,
or updating tickets, read docs/agents/issue-tracker.md.

### Triage labels

Before labeling issues, read docs/agents/triage-labels.md.

### Domain docs

Use one root GLOSSARY.md and docs/adr/. Before planning or implementation,
read docs/agents/domain.md.

### Project agents

The top-level agent routes ticket implementation, fixes, validation, reviews,
gate decisions and GitHub delivery through docs/agents/custom-agents.md without
requiring the user to name a role. "Implement next open issue" selects a ready,
unblocked ticket and delegates it to tandem-implementer. Small ad hoc edits stay
with the current agent. Specialists return to the parent; they do not route again.
Before review or remediation, follow docs/agents/review-loop.md. Each role reads
docs/agents/agent-contract.md before starting.
