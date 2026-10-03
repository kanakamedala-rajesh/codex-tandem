# Codex Tandem implementation specification

**Status:** Approved and published as [GitHub #2](https://github.com/kanakamedala-rajesh/codex-tandem/issues/2). Central tracker: [GitHub #1](https://github.com/kanakamedala-rajesh/codex-tandem/issues/1). Product acceptance tests remain NOT EXECUTED.

**Review order:** Read this specification, then the [ticket overview](ticket-plan.md). Each ticket links to a separate task with acceptance criteria and evidence requirements. The [traceability matrix](traceability.md) maps all 119 requirements and all 45 acceptance-test families.

## Problem Statement

The user already has a Go-based profile switcher, codex-as-go. They need its useful workflow extended into one maintainable application that safely selects an authorized identity, launches the existing Codex installation, and attributes observed usage to the identity that actually performed each execution attempt.

A session may continue under multiple identities, spawn child work, crash before completion, and produce delayed or duplicated source records. A session-level account label or the currently active credential cannot explain that history correctly. The application must preserve credential refreshes and the existing work toolchain while providing accurate local reporting without perceptible wrapper delays.

The work environment includes native Windows, modern WSL2, native glibc Linux and an existing Ubuntu 14.04 container reached from the modern Linux host. Modern host runtimes must not be forced into that legacy container.

## Solution

Build Codex Tandem as one TypeScript application distributed as precompiled JavaScript and browser assets. Reimplement the recorded profile-switching behavior in this stack; do not wrap, ship, compile or require the Go project. Selectively port proven accounting and presentation behavior from the pinned codex-report reference.

The foreground launcher owns safe activation, immutable launch records and child lifecycle. Small target adapters execute the existing Codex locally or in the existing container. Minimal hooks publish sanitized metadata; a separate host collector normalizes evidence and usage into one local SQLite database. An authenticated loopback dashboard and CLI report the same accounting results.

Keep the approved requirements baseline unchanged. This specification supplies implementation sequencing and accepted clarifications; it does not weaken the register or replace its complete requirement text.

## User Stories

1. As an operator, I want to install a prebuilt package without native companion binaries or install-time compilation, so that it works within my workstation policy.
2. As an operator, I want capability diagnostics for my runtime and target, so that unsupported configurations fail clearly.
3. As an operator, I want Windows and WSL2 to keep independent private stores, so that credentials and a live database are not accidentally shared.
4. As an operator, I want to choose a saved profile with arrow keys, so that my daily launch is quick and familiar.
5. As an operator, I want zero, one or many profiles and stable selections, so that labels and list order do not alter identity.
6. As a script author, I want explicit noninteractive identity/target resolution and clean JSON, so that automation never hangs or selects an account silently.
7. As an operator, I want Codex arguments, streams and exit results preserved, so that wrapping Codex does not change normal command behavior.
8. As an operator, I want project- and target-scoped resume, so that I do not reopen an unrelated session.
9. As an operator, I want add/import and isolated reauthentication, so that failed or canceled login does not destroy valid credentials.
10. As an operator, I want rename and removal to preserve historical identity, so that reports remain meaningful.
11. As an operator, I want account/workspace replacement distinguished from same-account reauthentication, so that earlier work keeps its original owner.
12. As an operator, I want storage-policy changes previewed and consented, so that organizational restrictions are respected.
13. As an operator, I want refreshed credentials saved before switching and after exit, so that returning to an account retains its newest valid state.
14. As an operator, I want crash-recoverable activation, so that interrupted writes do not strand authentication or invent a successful launch.
15. As an operator, I want competing launchers and aliased credential scopes guarded, so that only one controller mutates shared credentials.
16. As an operator, I want relevant processes identified accurately, so that unrelated processes are never treated as mine.
17. As an operator, I want scoped graceful-stop consent and separate force-stop consent, so that switching cannot silently terminate work.
18. As an operator, I want the selected identity to remain active after exit, so that plain Codex remains usable.
19. As a container user, I want the existing Codex binary, user, project and build environment preserved, so that my legacy toolchain continues to work.
20. As a container user, I want only selected credentials transferred privately, so that the complete credential vault is never exposed to the target.
21. As a container user, I want stopped or replaced targets detected without automatic restart, so that the launcher cannot change infrastructure unexpectedly.
22. As a container user, I want actual remote process state checked after client loss, so that an orphaned process cannot race a later identity switch.
23. As an operator, I want capture using existing compatible container facilities, so that no modern Node or obsolete-runtime installation is required inside it.
24. As an operator, I want essential identity evidence captured before completion, so that a crash does not erase ownership.
25. As an operator, I want mixed-identity sessions represented at attempt/observation level, so that A's work never becomes B's after resume.
26. As an operator, I want child work linked through verified execution relationships, so that nested usage belongs to the right attempt.
27. As an operator, I want delayed events and repeated source copies reconciled deterministically, so that replay changes neither ownership nor totals.
28. As an operator, I want unknown, imported and conflicting attribution visibly distinguished, so that uncertainty is never represented as verified fact.
29. As an operator, I want external identity changes detected, so that stale launch metadata cannot misattribute later work.
30. As an operator, I want capture to continue during collector outages, so that safely launched work can be reconciled later.
31. As an operator, I want bounded, read-only collection of active and archived sources, so that history processing does not damage Codex state or stall launch.
32. As an operator, I want validated native and legacy accounting, so that inherited history, cached subsets and repeated records are not counted twice.
33. As an operator, I want API-equivalent estimates with pricing provenance and explicit refresh, so that estimates remain separate from subscription bills and unknown prices.
34. As an operator, I want quotas tied to their observed identity and freshness, so that switching profiles cannot move quota state.
35. As an operator, I want the same timezone, filters and totals in CLI and dashboard, so that the two reporting surfaces agree.
36. As an operator, I want safe JSON and CSV exports, so that report sharing does not leak secrets or execute spreadsheet formulas.
37. As an operator, I want expandable sessions, attempts and child contributions, so that mixed-identity work is understandable.
38. As an operator, I want keyboard access, themes, font scaling and stable live refresh, so that the dashboard remains usable.
39. As an operator, I want presentation settings independent of source records and ownership, so that renaming a session cannot rewrite evidence.
40. As an operator, I want collector health, backlog and incomplete sources visible, so that missing records are not mistaken for zero usage.
41. As an operator, I want an authenticated local dashboard without credential or process-control powers, so that opening a browser does not expose privileged operations.
42. As an operator, I want redacted diagnostics, explicit repair and bounded retention, so that troubleshooting does not expose content or silently discard pending evidence.
43. As an existing user, I want previewed, backed-up migration from my existing tools, so that labels, settings and uncertain history are retained without changing donor state.
44. As an operator, I want consistent backup/restore, upgrade rollback and safe integration cleanup, so that lifecycle changes preserve my data and latest credentials.
45. As an operator, I want measured compatibility and performance on my actual platforms, so that support claims reflect executed evidence.

## Implementation Decisions

### Application shape and module contracts

| Responsibility           | Public behavior and boundary                                                                                                                                                      |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CLI and selector         | Parse reserved Tandem options, collect scoped consent, display saved profiles, restore terminal state and preserve Codex passthrough. Reporting imports stay off the launch path. |
| Profiles and activation  | Separate stable profiles/bindings, detect credential-storage policy, stage login, preserve refreshes, protect canonical scopes and recover interrupted activation.                |
| Launcher                 | Acquire ownership, record immutable target/identity context before child execution, supervise lifecycle and propagate exit results.                                               |
| Local and Docker targets | Resolve execution scope, run the existing binary, inspect owned processes, transfer selected files privately and enforce canonical project/source roots.                          |
| Capture                  | Validate bounded versioned input, project allowed metadata and publish durable events with neutral hook output. It does not calculate accounting or start collection.             |
| Collector and storage    | Own one analytics writer, cursor/receipt transactions, normalization, deduplication, evidence resolution, migrations and shared report computation.                               |
| Local API and browser    | Serve authenticated read-only reports and validated presentation settings. Credentials, login, arbitrary execution and process stopping remain CLI responsibilities.              |

Use the SRS logical entities: Profile, IdentityBinding, Target, Launch, Thread/Session, TurnAttempt, AgentRelation, UsageObservation, QuotaObservation, CaptureReceipt/Cursor, AttributionEvidence/Audit and Settings. Physical tables may combine entities only when their invariants stay explicit. Use versioned schemas, stable keys, foreign-key/uniqueness constraints and coordinated migrations.

### Runtime and distribution

Retain the initial Node capability floor of 22.15.0, build-only TypeScript floor from the SRS, built-in SQLite and built-in gzip/Zstandard. Resolve and lock compatible development packages during implementation. Validate the floor and maintained compatible newer versions; package types compiling successfully are not proof of runtime compatibility.

Ship precompiled JavaScript and browser assets with necessary text helpers. Consumers must not need Go, TypeScript, pnpm, compilers or companion-owned native artifacts. The Go archive and its historical checksum discrepancy are reference provenance, not a dependency or a blocker to implementing documented behavior. The existing container bridge may use only verified compatible facilities already on the target.

### Credential and execution invariants

Preserve one active managed launch per installation, plus canonical-home and shared-binding protection. Prove ownership with nonce and process-creation evidence where available; ambiguous ownership blocks unsafe switching.

Activation preserves the latest verified outgoing credentials, stages/replaces recoverably, and durably records immutable launch identity before execution. External identity changes produce evidence warnings/conflicts; they do not rewrite earlier ownership. Neither recovery nor migration may blindly restore obsolete credentials.

Stopping requires displayed scoped consent, fresh ownership checks and separate approval before force. A lost Docker client is not proof that the remote process stopped. Reuse of background servers requires tested per-launch context; otherwise offer approved stop or cancel.

### Capture, accounting and failure behavior

Qualify actual installed lifecycle events and propagation before choosing the exact adapter. Metadata envelopes require version, event, launch and target-generation identity with bounded fields and canonical containment. Discard content and secrets before persistence. Use atomic committed publication and durable host acknowledgment after effects/receipts commit.

Use actual thread/turn/attempt evidence for ownership. Child inheritance requires verified relationships. Imported operator assertions remain lower assurance; the MVP adds no manual correction interface. Stronger evidence may reconcile deterministically with an audit trail. Contradictions, absent edges and ambiguous cumulative boundaries remain explicit.

Bound decompression, parsing, batching and disk use. Collector absence does not block a safely attributable launch while durable evidence remains available. Essential pre-launch record failure cancels by default and requires an explicit untracked choice. A schema/source failure must not become a valid empty report.

### Reporting and local browser behavior

Store timestamps in UTC. Initialize one saved reporting timezone from the host and let the user configure it. CLI and browser share that setting and inclusive-start/exclusive-end ranges. Verify daylight-saving and calendar boundaries where relevant.

Ship a versioned pricing snapshot and an explicit refresh command. Show source/date and unpriced portions; unknown model aliases stay unpriced. Prices describe API-equivalent estimates, never verified subscription bills. Quota samples retain their observed binding/window and freshness. Default network activity excludes telemetry and automatic price checks; all network checks stay off the launch path.

The dashboard displays sessions with identity sets, attempts and children, supported outcomes, evidence status and completeness. Identity filters charge only matching observations, even if contextual rows remain visible. Persist presentation separately; keep launch receipts quiet by default.

Bind the API to loopback and authenticate it with a private per-installation mechanism. Validate Host/Origin and cross-site mutation behavior and restrict browser powers. The owning ticket must document/test the exact bootstrap/session contract before browser integration depends on it; it must not invent a new remote administration surface.

### Migration and lifecycle

Treat migration as a separate backed-up, previewed read of existing state. Preserve historical labels as assertions where evidence is absent, and keep only one live credential controller per scope. Reimplement the Go workflow using the documented behavior reference; selectively port accounting from the pinned codex-report base, retaining notices.

Backup/restore and upgrade must validate versions and preserve rollback state. Diagnostic repairs and destructive operations require their documented preview/consent. Uninstall removes only unchanged managed integration by default and retains credentials/analytics unless a separately confirmed purge is requested.

### Sequencing and discovery-dependent choices

G0 proves packed host compatibility, selector/passthrough, target discovery, bridge feasibility and a bounded A-to-B resume experiment. Controlled experimental activation must not pretend to be the finished G1 credential transaction. Full production attribution qualification stays in G2.

Independent fixture work can proceed while real-machine qualification is blocked. Keep G0 incomplete and defer dashboard migration until Windows/container feasibility is established. Tickets declare actual blockers rather than imposing blanket gate ordering on unrelated groundwork.

Exact event limits, process/ACL replacement mechanics, decoder formats, physical schemas and dependency resolutions are engineering work in their owning tickets. Qualification results constrain them. Record the selected contract and its tests before dependent behavior relies on it; any required departure from an approved invariant returns to the owner as a named decision.

## Testing Decisions

The user accepted the installed package's CLI as the principal integration boundary, supplemented by focused credential-recovery, capture and accounting-replay contract tests and actual browser tests.

Test externally observable outcomes: files remain recoverable, only verified owned processes stop, arguments pass unchanged, events survive/replay once, totals remain deterministic and browser/CLI output agrees. Avoid tests that merely mirror an internal function's implementation. Each behavior slice should follow the implementation workflow's test-first loop and be reviewed against both the baseline and repository instructions.

This repository has no existing product tests. Prior art consists of inspected Go behavior/test cases and pinned codex-report accounting behavior; their existence is not a passed test for Tandem.

### Required execution environments

| Environment                     | Required evidence                                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local native Windows            | Actual applicable package, source-build, terminal, credential/ACL/recovery, capture, storage, browser, migration and cleanup validation. Smart App Control enforcing for required Windows qualification. |
| Local WSL2                      | Actual applicable package, terminal, credential/recovery, capture, storage, browser and lifecycle validation in its independent store.                                                                   |
| WSL2 to actual legacy container | Existing Codex/build environment, bridge, target mappings, A/B resume, child linkage, scoped stopping, lifecycle and measured overhead.                                                                  |
| Native glibc Linux x64          | Required local workflows and available Docker integration; WSL2 is not a substitute for this environment.                                                                                                |
| Runtime/browser matrix          | Initial minimum capability floor plus maintained compatible newer runtimes; required Edge/Chrome/Firefox behavior on applicable platforms.                                                               |

**CI cannot replace the explicitly required local Windows and WSL2 runs.** Fixture checks, inventory observations, available runner names and successful compilation are not actual platform qualification. Platform-specific cases require the relevant platform, with any genuine non-applicability explained explicitly. Missing access stays BLOCKED or NOT EXECUTED, never PASS.

### Evidence and performance

Record application commit, tarball checksum, runtime/platform/target, fixture provenance, commands/results and manual steps. Version sanitized fixtures/manifests and summaries; link temporary CI artifacts as supplementary evidence. Exclude credentials, raw transcripts, source content, tool payloads and full process command lines from evidence exports.

Use the SRS benchmark protocol: at least 50 warmups and 1,000 alternating direct/wrapped harmless launches; compare equivalent Docker transport and count every Tandem-added guard/RPC/hook. Separately validate the real Codex UI-ready boundary without retaining conversation content.

Preserve the approved targets: added-launch p95 <=100 ms/p99 <=250 ms; hook p95 <=50 ms/p99 <=100 ms; initial selector p95 <=200 ms; local freshness p95 2 seconds and no-mount pull freshness p95 5 seconds; dashboard query p95 <=300 ms. Use at least 100,000 observations across 1,000 sessions and a 1 GiB mixed rollout corpus. Verify idle CPU <=1 percent of one logical CPU, idle RSS <=150 MiB and bounded import RSS <=300 MiB with the SRS measurement conditions. These are targets, not current results.

The traceability matrix lists test families per requirement and ticket. A ticket's relevant subcases do not imply that the entire referenced acceptance test has passed. Gate/final qualification aggregates the complete required procedures and platform results.

## Out of Scope

Retain all baseline exclusions: automatic account rotation/quota avoidance, concurrent different identities in one credential scope, cross-device credential sync, remote Docker/Kubernetes/SSH targets, native desktop shells, custom OAuth/token refresh, provider proxies, cloud-wide billing claims, mandatory boot services, and redesign of Codex. Windows-to-WSL-to-Docker chaining is not an MVP requirement. macOS and ARM64 remain future qualification targets.

Also exclude wrapping the Go executable, requiring its archive/toolchain, a new manual attribution editor, automatic background pricing requests, and a mandatory dashboard visual redesign. This review phase excludes product implementation, pushes, issue/sub-issue creation and package publication.

## Further Notes

The candidate target floor and discovery inventory are not tested support claims. All 45 application acceptance-test families remain NOT EXECUTED.

G0–G4 remain the delivery gates; the [38 draft tickets](ticket-plan.md) make their dependency graph concrete. Preparation of a release candidate does not authorize publishing it. Final release readiness requires all MUST evidence, measured support/performance, migration/rollback documentation and explicit handling of each remaining failure or owner-approved named waiver.

Sources:

- [Approved SRS](../requirements/Codex-Tandem-SRS-v1.0.md)
- [Authoritative requirements register](../requirements/Codex-Tandem-Requirements-Register.json)
- [Accepted planning decisions](../agents/planning-decisions.md)
- [Profile-switching behavior reference](../agents/profile-switching-reference.md)
- [Domain glossary](../../GLOSSARY.md)
- [Existing architecture decision](../adr/0001-host-application-existing-codex-target.md)
