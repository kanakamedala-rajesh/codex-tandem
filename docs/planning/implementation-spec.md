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

## Profile storage and isolated login contract

CT-09 owns the version-1 private profile manifest and per-binding credential files.
Profiles and bindings have separate immutable IDs; label/description changes never
alter binding history. Explicit replacement retires the previous binding and
removes its selected saved credential after the manifest preserves the historical
record. Confirmed removal marks a profile deleted before removing its credentials;
an interrupted removal remains unavailable and can be retried. There is no analytics
mutation or live-home activation in these operations.

Explicit import stores existing credentials without choosing or qualifying a target.
Every login and later activation must revalidate the selected target's effective
storage and organizational policy. Staged login supports only policy that can be
proved through the existing Codex RPC contract; unknown/cloud/managed provenance
blocks staging rather than dropping restrictions. Preview and consent cover only
the staging file-mode override, with a private recoverable configuration backup;
target setup/activation changes remain the activation ticket's responsibility.
The supported auth adapter uses opaque ChatGPT credentials and local account/workspace
plus user consistency hints, never provider billing or remote-identity verification.

The installed-package verifier runs profile CLI outcomes and focused isolated-login
credential-file tests against the packed code. Synthetic fixtures and private
Windows/POSIX permission checks do not qualify real login, native Linux, Docker,
Smart App Control release behavior or complete T06/T07/T08/T23/T30/T37/T44 families.

## Local guard lease contract

`acquireGuard` protects an installation root, a physically canonical existing native
Codex home and a mutable binding file. Callers retain the lease across their protected
operation and revalidate immediately before switching; activation and launch
orchestration are subsequent ticket responsibilities. `registerProcess(pid)` accepts
only a fresh native descendant chain with compatible creation chronology, executable
and physical home evidence. Persisted records bind that evidence to the manager
nonce. A surviving registered process blocks release and stale-manager recovery.
Recovery also verifies the recorded home's physical identity and fresh native scope
inventory, even when the requested home differs; unregistered survivors, unknown
ownership and inaccessible or changed prior scopes block reclamation. Each guard
record preserves its original inventory selector: default native-name matching or
the canonical explicit executable and its physical file identity. Recovery uses
that stored selector; missing legacy context, malformed metadata and changed or
inaccessible explicit executables block recovery. A PID reused
since its recorded creation also blocks recovery. Recovery mutexes carry native
owner evidence and a nonce; release verifies their directory and exact ownership.
No elapsed-time
expiration or caller-supplied process inventory can authorize acquisition/recovery.

`processesForScope` is the read-only `processes` command boundary. Process names and
arguments select candidates/roles; they do not prove ownership or unrelatedness.
Unreadable scope, incomplete metadata and unresolved locks fail closed. A vanished
Linux name entry is omitted only after native process identity proves absence;
live, reappeared or inaccessible evidence remains an inventory error. Failed
multi-lock acquisition removes only directories still proved to belong to that
attempt; replaced owners are preserved. A retained lease must be diagnosed rather
than dropped after a release error. The `guard --hold` diagnostic and packed verifier
exercise the current lease consumer without implementing activation or stopping.

Private installation and native-home claims persist their native operating
environment. Both profile root entrypoints and guard acquisition check the
installation claim before permissions or store access; a separate analytics path
does not bypass it. Native-home first adoption follows scoped process inspection.
Unmarked state with unresolved legacy ownership is not adopted. Foreign claims and
partial first claims require explicit diagnosis/migration; no environment is inferred
from a mounted filesystem or numeric UID. These local claims do not define the later
Docker target-home adapter, whose target identity/generation and shared bindings
remain governed by the SRS.

Analytics ownership is checked at the canonical destination, including an absent
file below an aliased parent, before opening a database. Existing unmarked databases
are refused without adopting them. New claims require an absent destination,
recheck canonical paths and absence during publication, and remove only their own
verified marker on failure. Valid same-environment markers permit existing stores;
foreign or ambiguous ownership requires explicit diagnosis or migration.
Hardlinked mutable binding
or analytics files are unsupported. Canonicalization preserves case and uses native
physical filesystem identity; it never lowercases WSL UNC paths. Platform permission
or canonicalization failures block the operation rather than imply separation.
Windows process inspection uses a packaged compiler-free text helper and checks
same-handle native creation evidence against CIM. Its tested native AMD64 layout
is not universal architecture/build qualification. The native guard cost remains
part of SRS §14 launch latency; current Windows acquisition takes seconds and is
not budget-qualified. Full T11 stop, T15 Docker and T36 containment are not implied
by these CT-10 guard subcases.

Profile credential mutations consume the same canonical binding lock directory.
The lock order is the verified `profiles.lock` mutex followed by binding leases;
removal acquires all historical bindings in ID order before publishing deletion.
Reauthentication protects the old binding before login/import and keeps both old
and new leases through replacement publication and retired-file removal. Addition
protects its new destination, while label/display operations need only the profile
mutex. None of these CRUD operations requires a full launch inventory. A held or
orphaned guard record cannot be recovered by CRUD, even if its manager exited.

Mutation-only records identify their kind, canonical scope, nonce and native
creation. Only the manager writes saved bindings or metadata; staged-login children
write their isolated staging files. Known dead mutation owners can recover through
fresh native absence, nonce and physical directory checks under an owned recovery
mutex, bounded to two nested recovery locks. Partial, legacy empty, inaccessible,
foreign-environment or reused-PID records remain blocking. Mutex recovery restores
concurrency only; it does not repair an interrupted credential transaction or restore
older token bytes. A guard can transfer a proved-dead mutation on its canonical
binding through this same lease boundary, releasing its own recovery mutex first
and retrying binding acquisition once. Live or ambiguous mutation owners still
block; guard-record prior-scope and survivor checks remain unchanged. Every release
checks the exact owned nonce and directory.

## Local activation and launch preparation contract

CT-11's `activateIdentity` holds the profile mutex, CT-10 installation/home/selected
binding guard and any verified outgoing binding lease. It rechecks effective Codex
file-storage/workspace policy before mutation. The existing shared home must be
private; links, hardlinked credential files, foreign environments, active processes
and uncertain ownership block the operation. The canonical native home filesystem
identity plus operating environment defines this local target generation; it is
not a Docker generation or a qualification claim.

The private target `.tandem-activation` directory owns the phase journal, active
binding reference and validated staging credential. Phases are begun,
outgoing-saved, staged, replaced, active and complete. Outgoing bytes are validated
against immutable binding hints and saved before selected credentials are staged
on the target filesystem. Ownership and outgoing bytes are checked again at the
replacement boundary. A detected external refresh interrupts replacement; its
current target file remains recoverable. This does not make external programs
participate in Tandem's cooperative locks or claim external-launch attribution.

Replacement never deletes the only valid destination first. Private writes restrict
temporary files before writing, flush bytes, publish, verify protection and apply a
publication barrier. POSIX replacement uses rename (exclusive records use link)
and parent-directory fsync. Windows uses compiler-free native MoveFileExW with
write-through, with replacement disabled for exclusive records, then flushes the
published file. Unsupported permissions, publication or flushes fail explicitly.
Abrupt process termination exercises these barriers; hardware power loss and other
filesystems are not thereby qualified.

Restart reconciles an incomplete journal before another activation. Recovery prefers
current validated target bytes matching the transaction's selected or verified
outgoing binding, synchronizes that saved binding and records reconciliation.
Completed transactions distinguish the intended selection from the resolved
binding; reconciliation to outgoing credentials never claims the selected identity
was installed. A stale
transaction whose predecessor no longer matches the active reference is refused.
Missing/corrupt target files, missing/retired bindings and contradictory identities
remain explicit recovery errors with saved/staged alternatives retained. Recovery
also blocks indistinguishable selected/outgoing binding IDs unless a committed
active reference proves the selection; matching account hints alone cannot choose
between distinct binding histories. Recovery
does not install saved snapshots or staging bytes automatically. Explicit `activate
recover` may adopt an unmarked existing target only when it matches the requested
available binding. `activate sync` saves the recorded active binding's refreshes.

The retained lease's `prepareLaunch(mode)` exclusively persists an immutable
`prepared` record containing launch/profile/binding IDs, canonical home, local
target generation, project, executable/entrypoint and tracked/untracked mode. A
prepared record proves intended binding, never that a child started or succeeded.
Tracked record failure throws before the caller releases a child. An explicit
untracked choice writes the same intended binding to the private target journal;
failure there also cancels. No credentials, local account/user hints or token-derived
fingerprints enter these records. `registerProcess` consumes CT-10 native ownership
proof, and surviving/ambiguous children block `syncAfterExit` and release. Exit sync
requires this lease's active reference and matching target binding, preserves target
bytes on failure and leaves the selected identity active. The installed-package
verifier consumes this API with a harmless synthetic child; full production
launch/resume and capture context are CT-13 responsibilities.

CT-13 connects local `run`/`resume` to this lease. `revalidateBeforeLaunch` checks
native ownership, the active binding and unchanged physical home/project/executable
and entrypoint paths pinned before policy inspection, after durable preparation and immediately before shell-free spawn. The run owner also pins and freshly rechecks the actual spawn cwd and every raw -C/--cd resolution from that cwd, so an alias retarget or cwd replacement cannot silently select another project.
It does not establish an atomic OS check-and-spawn guarantee. A child that exits
before native registration must have an observed exit and independently proved idle
scope; failed registration alone never proves absence. Survivors retain protection.
Inherited streams remain unchanged, POSIX signals are forwarded and Windows uses
the inherited console without implicit forced stopping. Signal observers remain active through post-exit sync, release and failure cleanup, so another interrupt during cleanup does not discard the observed child status or bypass protected-state checks. The run owner removes its listeners after cleanup completes. Observed child exit codes
survive post-exit sync/release errors, which remain explicit stderr health diagnostics.
Untracked mode emits `UNTRACKED_LAUNCH` and records the intended binding privately.
Config/feature overrides are forwarded unchanged to the read-only effective policy
probe. Named Codex profiles fail before activation with
`PROFILE_POLICY_UNVERIFIABLE`: actual Codex 0.160.0 excludes profiles from
app-server, so its base policy cannot prove runtime named-profile policy. CLI-003
named configuration-profile compatibility is owner-deferred from G1; saved Tandem identities remain supported. The refusal remains the safety boundary for these deferred inputs.

Resume is a separate bounded native metadata read, invoked only when requested.
It validates UUID-bearing `session_meta` first lines against the same canonical
home/project; it neither imports history nor attributes it to the selected identity.
Explicit UUID lookup filters filenames before reading metadata. Opt-in last lookup
chooses a unique newest matching metadata timestamp. Reads are bounded to 10,000
entries, three directory levels, 64 KiB per first line and 16 MiB total, with links,
partial/unknown metadata and conflicts refused. Raw explicit Codex resume argv is
validated unchanged, with command/UUID positions distinguished from literal resume prompt tokens. Missing/inaccessible home, project and metadata source boundaries report redacted RESUME_* codes without native paths or causes. Unproved raw last-session grammar requires the top-level
Tandem resolver. The adapter's native upstream metadata/configuration support
requires actual installed-version evidence; synthetic fixtures alone do not qualify it.

`verify:activation-recovery -- --list` enumerates 137 maintained cases and their
coverage mapping. Every role directly injects failures before/after write, flush
and replacement, with abrupt termination after each durable journal/activation
phase and immediately after target replacement before its phase record. Restricted
staging and exclusive launch publication also exercise every open, restriction,
close, verification and publication-barrier edge; the same helper's equivalent
edges for other roles are identified as shared-primitive coverage, not separately
executed cases. Ranges and fault kinds permit serialized resumption; only the full
set establishes this scoped matrix. Synthetic Windows/Ubuntu subcases do not pass
entire T08/T09/T19/T29/T37/T40 families, native Linux/legacy targets, Smart App
Control, hardware-power-loss behavior or the outstanding Windows launch budget.

## Scoped local stopping

CT-12's `stopScopedProcesses` and `processes stop` consume CT-10 private managed
records and native inventory. Unknown owners, unregistered old-context servers,
PID 1 and the caller are never eligible. No per-launch background-server reuse
adapter is qualified; a conflict remains blocked until verified approved stopping
or cancellation. This command neither activates credentials nor releases guard
ownership; the owning manager still must prove idle before release/switch.

The consent callback must display the canonical local home/generation, exact
process identities, sanitized executable paths, blocking reasons and consequences
for each graceful and force decision. The stop inventory uses the recorded selector;
omitting a caller selector cannot hide a registered child, and an incompatible
explicit selector is refused. Every registered child is independently checked, and
stopped success requires native absence for all recorded children. Initial
cancellation performs no process or
credential mutation. After approval, the flow rechecks the unchanged private
owner record/nonce, executable identity, physical home generation and the complete
approved process set. Each action also obtains fresh native creation/ownership
evidence. New, inaccessible or changed owners block action; consent never applies
to additional or reused processes. A vanished approved process is confirmed absent.

POSIX sends normal SIGTERM first and waits a bounded interval (default 1500 ms,
caller range 100–10000 ms). Survivors require a separate displayed force decision
and fresh verification before SIGKILL. Node's Windows SIGTERM is forced and is not
used as a graceful mechanism. The external Windows stop command reports graceful
shutdown unqualified, then separately offers force. Its compiler-free helper
reuses the native reader, checks creation/SID, executable and nonce/home evidence,
and terminates an opened, creation-checked process handle; PID reuse cannot retarget
that handle. Both the process and selected home are opened and checked against the
stored NTFS volume/file ID, so aliases resolve physically; inaccessible homes and
unqualified filesystems such as ReFS remain blocked. POSIX performs the native
creation check immediately before the signal syscall but has no Node-exposed
kernel-pinned PID handle, so it does not establish an atomic lookup-to-signal
guarantee. The owning stdio launch pipe may
support EOF shutdown for a tested Codex version, but this external command does
not own another server's pipe and does not claim that capability.

Consent denial leaves survivors blocking. Successful native termination is still
followed by absence verification; uncertain/live processes remain in the result
and guard release stays blocked. No broad-name/tree kill, container PID 1 action or
container lifecycle shortcut is implemented. Docker generation/remote stopping is
CT-14; local synthetic/installed subcases do not pass complete T10/T11/T15/T20
families or qualify arbitrary Codex server context, native Linux/legacy targets,
Windows Smart App Control, or the outstanding launch latency budget.

## Docker discovery pinning

The read-only `doctor` adapter accepts `--expected-daemon DAEMON_ID` independently
of identity selection, alongside `--expected-generation FULL_CONTAINER_ID`.
A daemon mismatch fails before container inspection or execution. Successful
Docker reports expose `daemonId`; context aliases resolving to that same daemon
and container retain one scope key. Discovery rechecks daemon identity after path
projection and the container state/name before publishing usable paths and scope.
Projected paths must be canonical POSIX paths with the project contained within
its root. Target Python still performs physical symlink and mount checks; lexical
metadata validation on the host does not replace those checks.

These read-only checks are snapshots, without an atomic discovery-to-activation
boundary. Production Docker activation, selected-file transport, remote process
ownership, terminal behavior and legacy build compatibility remain CT-14 work.
Host contract fixtures do not qualify the target's credential durability, policy,
process facilities or actual toolchain; target capability observations are required
before those dependent lifecycle contracts can be established.
