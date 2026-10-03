# Accepted product decisions

These decisions supplement the approved SRS in `docs/requirements/`.

## Sequencing and qualification

G0 includes a bounded actual-target experiment for sanitized turn-start capture
and ownership across controlled A-to-B resume. Complete attribution remains G2;
this experiment does not establish full tracking or waive G1 safety work (SRS §17;
T14, T19–T23, T45).

Independent fixture work may continue while actual-platform qualification is
blocked. Record that limit; dependent tickets need their applicable criterion evidence.
Defer dashboard porting until Windows and container feasibility is established.
Installed-package CLI, focused contract, browser and actual-target tests cover
their respective boundaries. Native Linux and legacy-container qualification are
required where specified by the SRS; CI and generic fixtures cannot replace them.

G0 was closed within the owner-approved bounded feasibility scope recorded in
[GitHub #3](https://github.com/kanakamedala-rajesh/codex-tandem/issues/3) and
[#15](https://github.com/kanakamedala-rajesh/codex-tandem/issues/15). Native Linux,
the original legacy target and full attribution remain unqualified. That scope
decision does not supply missing evidence for later tickets or full release support.

Before dependent implementation, qualify installed Codex lifecycle fields,
launch-context propagation, child linkage and background-server behavior; actual
target paths/bridge transport; Windows ownership, ACLs, recovery and security; and
the runtime/browser support matrix. Resolve parser limits, schemas and dashboard
authentication in their owning tickets within the SRS invariants.

## Profile switching

Tandem extends the user's codex-as-go behavior in the approved TypeScript stack.
The Go executable is not a dependency. Use
[profile-switching-reference.md](profile-switching-reference.md); consult the donor
archive only for undocumented details. Explicit state migration remains separate.

## Reporting and attribution

Store timestamps in UTC. Use one configurable reporting timezone per installation,
initialized from the host and shared by CLI/dashboard. Report ranges include the
start and exclude the end; expose the timezone and test daylight-saving/calendar
boundaries (UI-005; T31/T32).

The MVP preserves imported operator assertions at lower assurance without adding
a manual identity-assignment/correction interface. Reconciliation is deterministic
and audited. Stronger evidence may resolve unknowns; contradictions remain visible
conflicts (ATT-007/008/010; T24/T29/T30).

Ship a versioned pricing snapshot and explicit refresh command. Show its date/source,
leave unknown models unpriced, and label API-equivalent estimates distinctly from
subscription bills or quota. Keep pricing network work off the launch path and
avoid automatic background requests (COL-009, SEC-005; T31/T37).
