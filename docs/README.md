# Documentation

| Document                                                                      | Purpose                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [System requirements](requirements/Codex-Tandem-SRS-v1.0.md)                  | Approved product scope, architecture and acceptance criteria.    |
| [Requirements register](requirements/Codex-Tandem-Requirements-Register.json) | Requirement-to-test traceability.                                |
| [Glossary](../GLOSSARY.md)                                                    | Domain terminology.                                              |
| [ADRs](adr/0001-host-application-existing-codex-target.md)                    | Approved architecture decisions.                                 |
| [Accepted decisions](agents/planning-decisions.md)                            | Product sequencing, reporting, attribution and pricing choices.  |
| [Implementation specification](planning/implementation-spec.md)               | Approved module boundaries, sequencing and validation contracts. |
| [Traceability](planning/traceability.md)                                      | Requirement and acceptance-family coverage by CT ticket.         |
| [Go switching reference](agents/profile-switching-reference.md)               | Inspected behavior to preserve and safety mechanisms to replace. |
| [Accounting fixtures](../test/fixtures/accounting/README.md)                  | Reproducible accounting cases and provenance.                    |

The [central GitHub tracker](https://github.com/kanakamedala-rajesh/codex-tandem/issues/1)
links G0–G4 and implementation issues.
[tracker-map.json](planning/tracker-map.json) resolves CT and gate identities.
Issues hold current criteria, blockers and verification comments. Ticket completion
does not by itself establish a complete acceptance-family or release qualification.

For later capture/attribution work, local native JSON omitted turn IDs; the observed
B resume started a new turn rather than retrying the same turn. Container hooks
encountered missing/stale environment context. No-daemon probes do not qualify
persistent servers, child linkage or provider identity; the original legacy target
remains unqualified. See the pinned [G0 matrix](https://github.com/kanakamedala-rajesh/codex-tandem/blob/19e798fab9f1500f163cd9a09e915298c7a29f45/docs/qualification/g0/support-matrix.md)
and [CT-06 evidence](https://github.com/kanakamedala-rajesh/codex-tandem/blob/19e798fab9f1500f163cd9a09e915298c7a29f45/docs/qualification/ct06/evidence.md).

Agent workflows start in [AGENTS.md](../AGENTS.md).
