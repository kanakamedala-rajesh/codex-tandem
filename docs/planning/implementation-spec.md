# Implementation specification

[GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2) records the
approved implementation scope. The [SRS](../requirements/Codex-Tandem-SRS-v1.0.md)
and [register](../requirements/Codex-Tandem-Requirements-Register.json) remain
authoritative. Use [traceability.md](traceability.md) for requirement/test-to-ticket
coverage and [tracker-map.json](tracker-map.json) for live issue identities.

## Application boundaries

Build one TypeScript host application, distributed as precompiled JavaScript and
browser assets with built-in Node SQLite/compression. Port useful Go interaction
and pinned codex-report accounting behavior selectively; preserve donor notices.
Consumers require no Go/compiler, TypeScript, pnpm or companion-owned native
artifacts. Existing container facilities must be verified compatible; retain the
legacy Codex/build environment (SRS §§2–3, 7; [ADR](../adr/0001-host-application-existing-codex-target.md)).

| Module               | Responsibility                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI/selector         | Reserved options, scoped consent, profiles, terminal recovery and passthrough; reporting imports stay off launch.                                  |
| Profiles/activation  | Stable profiles/bindings, storage policy, staged login, refresh preservation, canonical-scope locks and recovery.                                  |
| Launcher             | Ownership, immutable target/identity records before execution, child supervision and exit propagation.                                             |
| Local/Docker targets | Existing executable, owned processes, private selected-file transfer and canonical project/source containment.                                     |
| Capture              | Bounded versioned inputs, allowed metadata, durable publication and neutral hook output; no accounting/collection.                                 |
| Collector/storage    | One analytics writer, transactional cursors/receipts, normalization, deduplication, evidence resolution, migrations and shared report computation. |
| Local API/browser    | Authenticated read-only reporting and validated presentation settings; privileged credential/process operations stay in CLI.                       |

Keep SRS logical entities/invariants explicit even if physical tables combine them.
Use versioned schemas, stable keys, foreign-key/uniqueness constraints and coordinated
migrations. Resolve exact event limits, decoder formats, schemas, dependencies,
ACL/replacement mechanics and browser session/bootstrap contracts in their owning
tickets before dependent work. Qualification constrains these choices; departures
from approved invariants require a named owner decision.

## Execution and evidence invariants

Activation preserves verified outgoing refreshes, stages/replaces recoverably and
records launch identity before execution. One active managed launch per installation
also respects canonical-home/shared-binding protection. Ownership uses nonce and
process-creation evidence; ambiguity blocks unsafe switching (SRS §§5–6).

Stop consent is scoped and freshly verified; force requires separate consent.
Docker client loss does not prove process death. Background-server reuse needs
tested per-launch context; otherwise offer approved stop or cancellation.

Discard content/secrets before durable capture. Atomic publication and host
acknowledgment follow committed effects/receipts. Attribute by actual attempt and
verified child relation; preserve lower-assurance imports and visible contradictions.
Bound parsing, decompression, batching and disk use. Collector absence may coexist
with safe launch if evidence remains durable. Essential pre-launch record failure
cancels by default unless explicitly choosing untracked operation. Schema/source
failure must remain a failure rather than an empty report (SRS §§8–10, 15).

## Reporting and lifecycle

CLI/browser share accounting, saved timezone and inclusive-start/exclusive-end
ranges. Identity filters charge only matching observations even when context rows
remain visible; keep presentation state separate and launch receipts quiet by
default. Prices, quotas and uncertainty retain provenance. See
[accepted decisions](../agents/planning-decisions.md) and SRS §11.

The loopback API authenticates with a private installation mechanism and validates
Host/Origin and cross-site mutations. Document/test its bootstrap/session contract
before browser integration; browser access does not provide remote administration
(SRS §§11–12).

Migration reads donor state through explicit preview/backup and retains historical
labels as assertions where evidence is absent. Only one manager controls a live
credential scope. Restore/upgrade validates versions and rollback without restoring
obsolete credentials. Uninstall removes unchanged managed integration by default;
credential/analytics purge needs separate confirmation (SRS §13).

## Sequencing and validation

G0–G4 are the delivery gates (SRS §17). G0's bounded selector, discovery, bridge and
A-to-B experiment do not implement the G1 production activation transaction or full
G2 attribution. Follow the accepted scope/qualification decisions in
[planning-decisions.md](../agents/planning-decisions.md). Declare actual ticket
blockers while allowing independent fixture groundwork.

The installed-package CLI is the principal integration boundary, supplemented by
focused credential recovery, capture/accounting replay and browser tests. Define
observable cases first: recoverable files, verified process stops, unchanged
arguments, durable/replay-safe events, deterministic totals and CLI/browser parity.
Inspected donor tests are reference cases rather than Tandem test results.

Applicable checks run on native Windows and development WSL Ubuntu; SRS §16.1
additionally requires native glibc Linux x64, actual legacy target and the runtime/
browser matrix. Preserve Windows Smart App Control for its required qualification.
Record distinct platform results; CI, fixtures and compilation are supplementary.

SRS §14, including §14.2, defines performance budgets, alternating direct/wrapped
launch measurements, warmups, sample counts, equivalent Docker transport,
UI-ready boundary and dataset/resource conditions. T18/T33 exercise them; safety
guards remain included. Evidence follows SRS §16 and the
[agent contract](../agents/agent-contract.md).

SRS §17.2 governs release completion: all MUST evidence, tested support matrix,
measured performance, package checksum, migration/rollback instructions and explicit
remaining failures or named owner waivers. Ticket subcases do not pass entire
acceptance families. Release preparation does not authorize publication.

Baseline exclusions remain SRS §1.2. No Go runtime wrapper, manual attribution
editor, automatic background pricing or mandatory dashboard redesign is added.
