# Codex Tandem

Domain vocabulary from the approved version 1.0 requirements baseline,
[SRS Appendix B](docs/requirements/Codex-Tandem-SRS-v1.0.md#appendix-b-glossary-and-invariant-checklist).

## Language

**Profile**:
A stable local selectable label and configuration representing an identity choice.
_Avoid_: Codex model profile, Codex configuration profile.

**Identity binding**:
A stable reference to the authenticated provider account and workspace represented by credentials, independent of mutable profile labels.
_Avoid_: Display name, profile label.

**Target**:
The execution environment for Codex: the local host or a configured existing Docker container.

**Credential scope**:
The canonical shared Codex home together with its target and identity-binding ownership boundaries.

**Launch**:
One managed Codex execution with immutable target and identity metadata.
_Avoid_: Session, turn.

**Turn attempt**:
An execution segment of an upstream logical turn under one evidenced identity and launch.
_Avoid_: Logical turn.

**Child relation**:
An evidenced relationship between parent work and a subagent.

**Observation**:
A normalized fact about recorded usage, distinct from its source copies or the order in which it was received.
_Avoid_: Source copy.

**Attribution evidence**:
The basis for assigning an observation to an identity binding, without implying provider billing verification.
_Avoid_: Verified bill.

**Capture inbox**:
A durable queue of sanitized events awaiting collection.
_Avoid_: Transcript archive.

**Capability floor**:
The minimum capabilities required by the design, without implying qualification of every later version or environment.
_Avoid_: Version pin, tested support matrix.

**Qualification**:
A recorded successful test for a stated application, runtime, platform, and target combination.
_Avoid_: Assumed compatibility.
