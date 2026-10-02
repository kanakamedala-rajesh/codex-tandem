# Codex Tandem

## System Requirements Specification

**Version 1.0 | September 30, 2026**

Prepared for **Rajesh Kanakamedala**.

Architecture decision and requirements baseline - Astra Workbench workflow 03.

**Product implementation and acceptance tests: not executed in this authoring task.**

## Contents

- 1. Purpose, status, and scope
- 2. Operating environment and minimum technology capabilities
- 3. Architecture and decision record
- 4. Command-line and profile experience
- 5. Credentials, activation, and crash recovery
- 6. Process ownership, background servers, and user-approved stopping
- 7. Docker target: modern host, unchanged legacy build container
- 8. Identity attribution: the primary correctness requirement
- 9. Hook capture and event transport
- 10. Collection, accounting, and persistent data
- 11. Dashboard and reporting requirements
- 12. Security, privacy, and Windows distribution
- 13. Reliability, lifecycle, maintenance, and migration
- 14. Nonfunctional requirements and measurement
- 15. Public interfaces, configuration, and failure contracts
- 16. Acceptance verification and traceability
- 17. Delivery work packages and release gates
- 18. Source provenance and interpretation
- Appendix A. Requirement-to-test traceability
- Appendix B. Glossary and invariant checklist

## 1. Purpose, status, and scope

Codex Tandem is a local-first companion that selects a saved authenticated identity, safely activates that identity in an existing CODEX_HOME, launches the existing Codex CLI without a perceptible wrapper delay, and attributes observed local usage to the correct identity across sessions, turns, execution attempts, and subagents. The application is a launcher and observer, not a replacement for Codex, its authentication service, or its terminal interface.

> **Specification status**
> Version 1.0 requirements baseline, prepared September 30, 2026 for Rajesh Kanakamedala. The user approved decisions A-F in the conversation. Implementation details below operationalize those decisions; they are not evidence of a working product, measured performance, Windows security compatibility, or successful end-to-end attribution. All acceptance tests remain NOT EXECUTED.

MUST and SHALL identify release requirements. SHOULD identifies a recommended implementation default that may be replaced only with equivalent behavior and a documented rationale. MAY identifies an optional behavior. The requirements register is authoritative; examples illustrate contracts and do not authorize changing a live machine. Numerical nonfunctional thresholds are engineering acceptance targets, not observed results.

### 1.1 Approved product decisions

| Decision | Baseline |
| --- | --- |
| A - execution placement | Modern Node runs in Windows, modern WSL, or native Linux. For the work scenario, Tandem runs in Ubuntu 24.x WSL 2 and launches the already-working Codex binary inside the existing Ubuntu 14.04 container. |
| B - instrumentation | Install only minimal reviewed lifecycle hooks. Keep hook and launch overhead small; retain existing user hooks and Codex trust requirements. |
| C - speed and degraded operation | Accept bounded pre-launch safety work and a durable identity record. Background collector failure does not block a safely attributable launch; essential record failure requires an explicit untracked-launch choice. |
| D - concurrency and stopping | One active managed launch per shared credential scope. Offer to stop identified conflicting Codex processes only after specific user approval; leaving them running cancels the conflicting identity switch. |
| E - identity of the product | Display name: Codex Tandem. Proposed npm package: @venkatasudhalabs/codex-tandem. Command: codex-tandem. Publication availability and scope permission are release checks, not assumed. |
| F - useful additions | Project-aware resume, stable identity history, replay-safe collection, visible health, redacted diagnostics, safe updates and uninstall. Manual account switching; local data; independent Windows/WSL stores. |

### 1.2 Included and excluded work

The MVP includes local launch targets, a Linux-host Docker execution target, profile CRUD, credential refresh preservation, scoped process control, durable attribution capture, a background collector, an authenticated local browser dashboard, reporting, backup/export, and migration of useful existing logic. Native Windows x64 and modern WSL 2 x64 are first-class targets; native glibc-based Linux x64 is also an MVP target.

The MVP excludes automatic account rotation, quota-avoidance automation, simultaneous different identities through one shared authentication file, a cross-device credential sync system, remote Docker daemons, Kubernetes/SSH targets, native desktop shells, provider proxies, custom OAuth/token refresh, cloud-wide usage inference, compulsory boot-time services, and redesigning Codex itself. Windows-to-WSL-to-Docker chaining is not required; run the Docker adapter from the Linux WSL host. ARM64 and macOS are future qualification targets, not implied supported platforms.

**SCP-001 - Single focused application [MUST]**

The implementation SHALL ship as one application package with a foreground launcher role and a background collector/dashboard role. It SHALL NOT introduce a generic plugin platform, microservice deployment, message broker, or separate database server.

*Verification: T01, T43.*

**SCP-002 - Authorized identities only [MUST]**

Profiles SHALL represent accounts the operator is authorized to use. Tandem SHALL preserve organizational authentication, hook, sandbox, and configuration policy and SHALL NOT imply that a subscription permits credential sharing.

*Verification: T06, T37.*

**SCP-003 - Evidence boundaries [MUST]**

The product SHALL distinguish supported-and-tested, capability-unverified, degraded, and unsupported target states. Successful codex --version output SHALL NOT be treated as proof of hooks, attribution, or background-server isolation.

*Verification: T02, T14, T45.*

## 2. Operating environment and minimum technology capabilities

### 2.1 Confirmed work environment

| Layer | Evidence provided by the user | Implication |
| --- | --- | --- |
| Host | WSL 2 using an Ubuntu 24.x distribution | Install and run Tandem and its modern Node runtime here. |
| Kernel | 6.6.87.2-microsoft-standard-WSL2 | The container uses the WSL kernel; its userspace remains separate. |
| Build container | Ubuntu 14.04.6; glibc 2.19; PID 1 docker-init; /.dockerenv present | Do not upgrade or replace this build environment as a Tandem prerequisite. |
| Node inside container | /home/cnh/.nvm/versions/node/v26.1.0/bin/node fails with missing GLIBC symbols | Do not use this Node/npm installation for Tandem or container hooks. |
| Codex inside container | /home/cnh/.local/bin/codex reports codex-cli 0.159.0 | Use the existing executable after setup validates launch and instrumentation capabilities. |
| Container instance | 26937387b82b appears in the provided shell prompt | Treat it as observed context, not a permanent identifier or proof of Docker context. Resolve and bind the actual instance during setup. |

The modern host resolves the Node ABI problem without changing the build container. Official Node Linux binary requirements include glibc and libstdc++ constraints; a newer kernel alone does not supply a newer container userspace C library. Tandem support for WSL is an application-level tested commitment, not a claim that upstream Node gives WSL a separate support tier. [S01]

### 2.2 Minimum dependency policy

| Component | Minimum / capability floor | Use and support policy |
| --- | --- | --- |
| Node.js on the host | >=22.15.0 | Capability floor for built-in SQLite without the old enabling flag and built-in Zstandard. Recommend a maintained, security-patched compatible release. Do not cap users to a particular major. |
| node:sqlite | Included with qualifying Node; required APIs available at the floor | Use a small internal adapter; no optional native database package and no loadable SQLite extensions. Active-development status must be tracked. [S02] |
| node:zlib | Zstandard APIs introduced in 22.15.0 | Use bounded streaming decoding. Experimental Zstandard API status is an accepted, tested integration risk. [S03] |
| TypeScript - build only | >=5.8.3 | A project-selected minimum consistent with the donor codebase. Build ordinary JavaScript before publishing. Consumers do not need TypeScript. |
| Node type definitions - build only | >=22.15.0, with API checks against runtime floor | Do not call newer runtime APIs merely because a newer type package compiles them. The selected resolved package must pass minimum-runtime CI. |
| npm | Bundled npm compatible with the selected Node runtime | No additional npm-specific runtime API floor. Package tarball installation and bin-shim behavior must pass tests. pnpm is optional contributor tooling, not a consumer prerequisite. |
| Docker - Docker target only | Engine API >=1.35 and compatible CLI | Required exec user, environment, working-directory, and interactive options; API 1.35 is needed for --workdir. No requirement to install Docker for local launch targets. [S04] |
| Existing Codex CLI | >=0.159.0 initial qualification floor plus capability probe | This is the user-observed candidate baseline, not a universal compatibility assertion. Release must prove required events/fields and server behavior on the floor; any higher minimum needs a compatibility decision before publication. [S08] |
| Legacy container hook bridge | Existing /bin/sh and verified metadata-filtering capability | Recommended small stdlib-only bridge can use an already-present Python interpreter >=2.7, written for both 2.7 and 3.x. Prefer available Python 3. Do not install an obsolete interpreter or add pip dependencies. This interpreter is not needed for ordinary host/local mode. |
| Browser | Desktop browser supporting ES2020, Fetch, and standard accessible HTML controls | Qualify current supported Edge, Chrome, and Firefox releases. No browser download is part of normal application installation. |
| Browser automation - test only | Playwright >=1.56.1 when retained from donor tests | Selected project floor, not a consumer dependency. Native browser artifacts remain isolated test tooling and must be assessed on the Windows validation machine. |

> **Versions are floors, not pins**
> Use engines.node >=22.15.0 as the initial package contract. An exact lockfile is still required for reproducible development and CI; it is not an instruction that end users must use one exact Node version. The oldest capability floor may be exercised in isolated CI while a release can require patched versions for known security issues. New major releases are allowed when compatible and gain an explicit tested status after validation.

No default runtime dependency on Rust, Go, a C/C++ compiler, Python on Windows, node-gyp, libsql, better-sqlite3, node-pty, a bundled zstd executable, Electron, Tauri, or an installer framework is permitted. An additional pure-JavaScript dependency requires a concrete need, license review, a documented minimum, and a package-content review. The small legacy bridge is a target adapter, not a second analytics implementation.

**ENV-001 - Host execution boundary [MUST]**

Tandem SHALL execute Node-based launch management, database work, reporting, and dashboard service outside the Ubuntu 14.04 container. The existing in-container Codex executable and project toolchain SHALL remain the execution environment for agent build/test commands.

*Verification: T03, T13.*

**ENV-002 - Minimum and newer runtimes [MUST]**

The build SHALL execute on the documented minimum host Node capability level and maintained compatible newer releases. No artificial maximum major version SHALL be imposed merely to match the development machine.

*Verification: T02, T43.*

**ENV-003 - No implicit system modifications [MUST]**

Setup SHALL NOT replace glibc, upgrade the container OS, install a compiler, modify Windows application-control policy, enable developer mode, grant Docker permissions, or recreate/start/stop a container without an explicitly scoped separate user action.

*Verification: T13, T37, T44.*

**ENV-004 - Bridge capability gate [MUST]**

Container setup SHALL detect a safe existing mechanism for metadata-only JSON projection and durable capture. A Python-compatible bridge is a recommended implementation, not an assumption that Python exists. Without a verified mechanism, fully tracked container mode SHALL remain unavailable with a precise diagnostic; no silent raw-payload logging or inaccurate attribution is allowed.

*Verification: T14, T37, T45.*

## 3. Architecture and decision record

### 3.1 Host-controlled, target-executed design

```text
Modern Windows / WSL / Linux host
  codex-tandem CLI
    |-- arrow-key selector + profiles + launch transaction
    |-- local target -----------------> existing local Codex CLI
    |-- Docker target -> docker exec -> existing container Codex CLI
    |                                     |-- project build/test tools
    |                                     `-- small metadata hook bridge
    `-- collector/dashboard process
          |-- collector worker + one SQLite writer
          |-- target event inbox + read-only rollout readers
          `-- authenticated loopback HTTP API -> local browser

Credentials: private files, outside the analytics database
Analytics: host-local SQLite; never a shared Windows/WSL live database
```

An identity answers "which authorized account?" A target answers "where does Codex run?" A CODEX_HOME is the shared mutable authentication/session/configuration scope within that target. These are separate concepts. Do not duplicate every identity just because the same user has a local target and a container target. Credential bindings and locks must nevertheless account for refresh conflicts across targets.

### 3.2 Module boundaries

| Module | Responsibility | Must not do |
| --- | --- | --- |
| cli | Commands, selector, consent prompts, terminal restoration | Import reporting/database modules on the launch fast path. |
| profiles | Stable IDs, credential bindings, activation and recovery | Implement provider OAuth refresh or expose secrets to HTTP. |
| launcher | Lease, launch journal, child lifecycle, exit status | Parse history or wait for dashboard readiness. |
| targets/local and targets/docker | Execution, scoped process inspection, files, target paths | Provide arbitrary remote shell control to the browser. |
| capture | Minimal event projection and durable inbox transport | Calculate totals, call cloud APIs, or retain conversation content. |
| collector + storage | Normalize sources, evidence, deduplication, migrations and reports | Change source Codex records or activation credentials. |
| server + web | Authenticated local reporting and presentation | Run arbitrary commands, modify hooks, or stop processes through browser input. |

### 3.3 ADR-001: Node host application with an existing Codex target

Decision: perform a selective migration into a fresh TypeScript project, retaining the useful codex-as interaction model and codex-report accounting behavior. Ship precompiled JavaScript and browser assets. Use built-in Node SQLite and compression. Add exactly one exceptional execution adapter for the Linux-host Docker scenario.

Alternatives considered: Rust as the primary application does not eliminate the custom Windows executable trust problem and would require an accounting port. Running modern Node inside the old container conflicts with the observed ABI. Running Codex only on the host would not preserve the requested build-tool environment. Creating isolated profile homes plus a synchronization engine would expand scope unnecessarily. Keeping codex-report unchanged retains native components inconsistent with the installation objective. [P01, P02]

Consequences: Node is a host prerequisite, the legacy bridge must be qualified, upstream lifecycle behavior must be version-tested, and Windows installation remains an empirical security-policy gate. The architecture is reversible at the target and storage adapter boundaries without replacing the identity/usage model. Reconsider Rust only after measured resource constraints or a deliberate signed-native distribution requirement; reconsider container capture if the existing environment lacks a safe bridge.

**ARC-001 - Minimal fast-path dependency graph [MUST]**

The selection and launch modules SHALL load only the code required for configuration, credentials, locking, target execution, and the launch journal. SQLite, compression, collectors, large pricing tables, and web assets SHALL be loaded lazily outside that path.

*Verification: T18, T43.*

**ARC-002 - Single source of accounting logic [MUST]**

CLI and browser totals SHALL be produced from the same normalized usage and evidence model. The container bridge SHALL transport metadata rather than implement a second set of accounting rules.

*Verification: T26, T32.*

**ARC-003 - Independent operating environments [MUST]**

Native Windows and WSL installations SHALL keep independent application stores and CODEX_HOME state. Tandem SHALL detect and reject an accidentally shared live analytics database. Docker capture is a local target integration, not cross-device synchronization.

*Verification: T12, T36.*

## 4. Command-line and profile experience

### 4.1 Default interaction

Running codex-tandem opens the profile selector for the selected/default target. A concise heading identifies the target and project. Up/Down changes the highlighted profile, Enter launches, and Escape or Ctrl+C exits without changing the identity. The default highlight may be the last selected profile, but automatic launch without confirmation is forbidden. A clearly labeled Manage profiles entry exposes CRUD without making routine startup a multi-screen wizard.

```text
Codex Tandem | target: work-build | project: activations

  Personal
> Work
  Manage profiles...

Up/Down: choose   Enter: launch   Esc: cancel
```

**CLI-001 - Arrow-key selector [MUST]**

The interactive selector SHALL use Up/Down and Enter as the primary interaction. It SHALL NOT require numeric option entry. It SHALL restore raw mode, cursor visibility, and terminal state on cancellation, error, or launch handoff.

*Verification: T04.*

**CLI-002 - Explicit noninteractive behavior [MUST]**

When no usable TTY exists, the command SHALL require an explicit --identity and target resolution or return a concise actionable error. It SHALL not wait for input, choose the first identity, or perform a destructive confirmation implicitly.

*Verification: T05.*

**CLI-003 - Identity and Codex profile distinction [MUST]**

Use --identity for Tandem authentication selection and --target for execution placement. Arguments after -- SHALL pass to Codex unchanged; Codex configuration profiles and its -p/--profile flags SHALL not be consumed as Tandem identities.

*Verification: T05, T17.*

**CLI-004 - Project-aware resume [MUST]**

The launcher SHALL support explicit session resume and an opt-in last-session lookup scoped to target and canonical project directory. It SHALL not silently resume a session from another project, target, or unavailable path.

*Verification: T17, T25.*

**CLI-005 - No selector network calls [MUST]**

The selector SHALL render local saved identity labels without quota lookups, token refresh requests, registry checks, or network calls. Cached health may be shown with its age but SHALL not hold up selection.

*Verification: T18.*

**CLI-006 - Useful account scale [MUST]**

Profile storage and UI SHALL support zero, one, two, and multiple identities without a two-profile hard limit. Duplicate display names SHALL be rejected or disambiguated; selection SHALL resolve a stable ID rather than a mutable row number.

*Verification: T04, T06.*

**PRO-001 - Profile CRUD [MUST]**

The CLI SHALL provide add/import, list/show, rename/update display metadata, reauthenticate, and delete operations, through commands and the management screen. Secret token values SHALL never be printed. Creation and login require explicit user initiation.

*Verification: T06, T07.*

**PRO-002 - Stable history [MUST]**

Every profile SHALL have an immutable profile ID. Credential/account bindings SHALL have separate stable IDs. Rename SHALL preserve history; deletion SHALL remove selected local credentials after confirmation while retaining a non-secret historical identity record and analytics.

*Verification: T07, T30.*

**PRO-003 - Reauthentication versus replacement [MUST]**

Reauthentication of the same provider account SHALL preserve its identity binding. A different account or organization selected during login SHALL require an explicit new binding; it SHALL NOT retroactively change ownership of previous usage.

*Verification: T07, T23.*

**PRO-004 - Login isolation [MUST]**

Profile addition or reauthentication SHALL use the existing Codex login flow in a temporary, restricted staging home when supported, or a recoverable guarded activation flow. It SHALL not destroy the currently valid profile when login is canceled or fails.

*Verification: T06, T08.*

**PRO-005 - Direct Codex compatibility [MUST]**

The chosen identity SHALL remain active in the target CODEX_HOME after exit, matching the simple codex-as workflow. Subsequent plain Codex use SHALL remain possible. Tandem SHALL preserve detected refreshed credentials before switching, but SHALL not promise exact attribution for external launches.

*Verification: T08, T29.*

## 5. Credentials, activation, and crash recovery

### 5.1 Security and identity boundary

Codex owns authentication. Tandem stores opaque file-backed credentials, not an independently refreshed token cache. The design requires effective file-backed storage for the managed target and must honor managed-policy restrictions. Authentication files are secret; access should be restricted to the user/target identity. Stable provider account/workspace identifiers, when available through a validated local format, are consistency hints rather than remotely verified identity claims. [S05]

### 5.2 Activation state machine

```text
IDLE -> INSPECT -> LOCKED -> OUTGOING_SAVED -> PREPARED
     -> AUTH_ACTIVATED -> LAUNCH_RECORDED -> CHILD_STARTED
     -> RUNNING -> CHILD_EXITED -> REFRESH_SAVED -> CLOSED

Any uncertain write/ownership state -> RECOVERY_REQUIRED
Collector unavailable + journal valid -> RUNNING_WITH_BACKLOG
Essential journal unavailable -> CANCEL or explicit UNTRACKED choice
```

A switch is a small recoverable transaction across files, not a claim that a multi-file update is atomically committed by the filesystem. Prepare restricted temporary files on the destination filesystem, flush required data, replace safely, and record transaction phases. Never delete the only valid destination before a replacement is safely available. On restart, reconcile transaction state before any new activation. Windows replacement and permission behavior require a real Windows test.

**AUTH-001 - File mode with policy consent [MUST]**

Setup SHALL detect the effective credential storage mode and policy. Any proposed change to file mode SHALL be previewed and approved, with a recoverable configuration backup. If policy prohibits file-backed switching, the target SHALL be blocked rather than silently overridden.

*Verification: T06, T37.*

**AUTH-002 - Outgoing refresh preservation [MUST]**

Before activating a different identity, Tandem SHALL save the current target credentials to the verified outgoing binding. It SHALL also attempt this after process exit. A missing or mismatched binding SHALL lead to recovery, not copying credentials into whichever profile label is current.

*Verification: T08, T09.*

**AUTH-003 - Recoverable replacement [MUST]**

Credential activation SHALL use restricted staging, validation, same-filesystem replacement where available, and a phase journal. A crash at any phase SHALL preserve at least one recoverable valid credential version and SHALL never yield a false successful launch record.

*Verification: T09.*

**AUTH-004 - Immutable launch binding [MUST]**

Before the child can execute, Tandem SHALL durably write a launch ID bound to identity-binding ID, profile ID, target generation, project path, effective CODEX_HOME, intended Codex executable, and tracked/untracked mode. The credential bytes or token-derived fingerprints SHALL not enter the analytics journal.

*Verification: T09, T19, T37.*

**AUTH-005 - Scope locking [MUST]**

Activation and launch SHALL be serialized for a canonical physical CODEX_HOME and for a shared mutable credential binding. Aliased target paths SHALL not bypass the same-home lock. The MVP SHALL expose only one active managed launch per Tandem installation.

*Verification: T10, T12.*

**AUTH-006 - Lock ownership proof [MUST]**

Locks SHALL contain a nonce and process identity evidence including creation identity where available. Stale-lock recovery SHALL require evidence that the owner is gone; PID existence alone SHALL not justify deletion or process termination.

*Verification: T10, T11.*

**AUTH-007 - External authentication changes [MUST]**

If external login, a workspace change, or another process changes the active identity during a managed launch, Tandem SHALL flag the affected evidence range and avoid assigning later usage from a stale launch identity. It SHALL not retroactively relabel previously verified observations.

*Verification: T23, T29.*

**AUTH-008 - No auto-restore of obsolete tokens [MUST]**

Rollback, uninstall, and migration SHALL not blindly restore an old authentication snapshot after Codex has refreshed it. Recovery SHALL prefer the most recent validated matching binding and explain unresolved alternatives without showing secrets.

*Verification: T08, T09, T40.*

## 6. Process ownership, background servers, and user-approved stopping

The user reports that background Codex server processes can remain after the terminal UI exits. This is an observed deployment concern, not an assumption that every Codex version behaves identically. A persisted backend can retain credentials or an old launch environment. Therefore, "no visible terminal" is not equivalent to "safe to change identity". Process role, ownership, target namespace, and credential scope must be established before switching.

### 6.1 Stop interaction

When a conflict is found, show the process role, sanitized executable name/path, host or container scope, PID plus creation identity, known related session, and reason it blocks switching. Offer Leave running and cancel switch as the default, or Stop these identified processes and continue. Graceful stop is attempted first. A timeout may lead to a separate force-stop confirmation; there is no blanket kill-all-Codex command in the default flow.

**PROC-001 - Scoped inventory [MUST]**

The launch guard SHALL inspect relevant foreground, worker, and background Codex processes within the selected target and credential scope. It SHALL identify known managed processes and distinguish unrelated or ownership-unknown processes.

*Verification: T10, T11, T15.*

**PROC-002 - Explicit stop consent [MUST]**

Tandem SHALL not terminate a process without a displayed, scoped confirmation. Consent SHALL identify the process set and consequences. Choosing leave/cancel SHALL leave both those processes and the selected target credentials unchanged.

*Verification: T11.*

**PROC-003 - Graceful before forced stop [MUST]**

Prefer a verified graceful shutdown mechanism or normal signal for the owned process scope. Forced termination SHALL require a second explicit approval and a fresh identity check. Never use an indiscriminate process-name kill, terminate Docker PID 1, or stop/restart the container as a shortcut.

*Verification: T11, T15.*

**PROC-004 - Do not trust stale PID lists [MUST]**

Immediately before stopping or switching, revalidate process creation identity, target generation, and ownership. A PID reused by an unrelated process SHALL not be terminated. An inaccessible/ambiguous owner SHALL block unsafe switching with an explanation.

*Verification: T10, T11.*

**PROC-005 - Verify remote termination [MUST]**

For Docker launches, losing or killing the host docker exec client SHALL not be treated as proof that Codex or its children stopped. Validate in-container process state and retained server processes before releasing the credential scope.

*Verification: T15, T28.*

**PROC-006 - No stale server context [MUST]**

A new tracked launch SHALL not reuse a background server that retains an unverified prior identity or launch context. Reuse is allowed only when a version-tested adapter proves correct per-launch context; otherwise the user must approve stopping the conflict or cancel.

*Verification: T11, T20.*

**PROC-007 - Collector is a separate process role [MUST]**

Stopping the Tandem collector SHALL not stop Codex. Stopping Codex SHALL not delete or reset analytics. Idle Tandem collection SHALL not itself be considered a credential-switch conflict.

*Verification: T28, T39.*

## 7. Docker target: modern host, unchanged legacy build container

### 7.1 Target setup and execution

The target is an already-running, explicitly selected local Docker container. Setup records the Docker context, resolved container ID/generation, non-root target user, HOME, effective CODEX_HOME, absolute Codex executable, workspace mapping, environment initialization, and collection transport. Use the existing /home/cnh/.local/bin/codex only after validating it in the selected instance. Do not assume that docker exec automatically loads interactive shell startup files or the environment used in the original terminal.

```bash
# Shape only: the application resolves actual values during target setup.
docker exec -it \
  --user cnh \
  --workdir /container/path/to/project \
  --env HOME=/home/cnh \
  --env CODEX_HOME=/home/cnh/.codex \
  --env TANDEM_LAUNCH_ID=<non-secret-launch-id> \
  <resolved-container> /home/cnh/.local/bin/codex
```

The actual launcher must preserve arguments as argument vectors. An optional pre-approved environment wrapper may source a known build setup script and then exec the absolute Codex binary; it must not interpolate arbitrary project text into shell source. The displayed example deliberately omits credential transfer and setup details and is not an installation script. Docker supports environment, user, working-directory and interactive execution options; an exec process also depends on the container main process remaining alive. [S04]

### 7.2 Two transport paths, one preferred

| Transport | When to use it | Constraints |
| --- | --- | --- |
| Existing accessible mount - preferred | A previously configured bind mount exposes the required CODEX_HOME/session paths and a restricted Tandem inbox to the Linux host. | Inspect and validate both sides. Do not assume an existing container can acquire a new mount through exec. Never expose the entire host home merely for convenience. |
| Container-resident spool with host pull - fallback | The current container has no suitable accessible mount and must remain unchanged. | Install only approved small bridge files. Capture metadata inside the container and pull committed event files and bounded rollout ranges through Docker in the background. No host HTTP port or Docker socket inside the container. |

An explicitly configured existing bind mount is the simplest observation path. Docker bind mounts refer to the daemon host, not necessarily the CLI client machine; validate accessibility rather than assuming a Windows path or a Docker Desktop volume is a WSL file. Container recreation or adding mounts is outside normal setup and requires its own approved plan. [S06]

For the no-mount fallback, use a restricted container inbox and an asynchronous host reader. Prefer bounded streaming of rollout ranges into the host parser without retaining raw transcripts. A docker cp-based bootstrap or file transport must account for ownership and must not extract an arbitrary archive unsafely; it is not a reason to copy the whole project/history on every poll. [S07]

### 7.3 Legacy-compatible bridge contract

The bridge has two narrowly scoped duties: project a hook payload into an allowlist of non-content fields and durably commit one event into a private inbox. The preferred implementation is a tiny standard-library script compatible with an already-installed interpreter, invoked by an absolute path. An existing Python >=2.7 can provide JSON parsing, bounded reads, private writes, and fsync; the implementation must prefer Python 3 when present and must never install Python 2 to satisfy this design. The actual interpreter has not been inspected on the user machine.

Do not parse JSON with grep or regular expressions. Do not spool a raw UserPromptSubmit payload, because it may contain the full prompt. The bridge must discard prompt, assistant text, tool arguments/output and credentials before writing. If a chosen alternative uses a host stream, it must still satisfy durable attribution during collector outages; an unacknowledged pipe alone is insufficient. A missing safe bridge is an explicit compatibility failure, not a license to weaken identity attribution.

**DCK-001 - Separate identity and target selection [MUST]**

A Docker target SHALL be a named execution configuration independent of an identity. Selection SHALL not alter the build image or toolchain. Target setup SHALL pin the resolved container instance for each launch and revalidate changes before activation.

*Verification: T13, T16.*

**DCK-002 - Correct user and build environment [MUST]**

Codex SHALL run under the configured user, HOME, CODEX_HOME, working directory, and approved build environment. The same representative build/test command that works from the existing container terminal SHALL work when invoked by Codex through Tandem.

*Verification: T13, T17.*

**DCK-003 - Preserve terminal semantics [MUST]**

The adapter SHALL preserve interactive input, resize, Unicode, cancellation, paste, and exit status. Use a Docker TTY only for a real interactive terminal; noninteractive passthrough SHALL not unconditionally allocate -t.

*Verification: T05, T13, T17.*

**DCK-004 - Safe credential transport [MUST]**

Only the selected credentials and recoverable outgoing refresh state may cross the host-container boundary. Transfer SHALL avoid secret command-line/environment values, preserve restricted ownership and mode, and commit atomically within the target filesystem. The whole credential vault SHALL not be mounted into the container.

*Verification: T08, T13, T37.*

**DCK-005 - No modern Node inside container [MUST]**

Container hook and launch helper code SHALL not invoke the broken Node/npm installation or depend on a modern shared C library. It SHALL use only verified existing compatible facilities; helper deployment changes SHALL be previewed and reversible.

*Verification: T03, T14.*

**DCK-006 - Durable capture with collector absent [MUST]**

Both mounted and no-mount container modes SHALL capture launch/turn/child metadata while the host collector is stopped. Events SHALL be committed individually with bounded size and replayed without duplication after collection resumes.

*Verification: T14, T19, T28.*

**DCK-007 - Background-only collection transport [MUST]**

Reading event spools, fetching rollout ranges, decompressing history, and reconciling analytics SHALL happen after Codex starts or in an already-running collector. Container setup SHALL not recur in full on each launch.

*Verification: T18, T27.*

**DCK-008 - Container lifecycle boundaries [MUST]**

A stopped, paused, replaced, inaccessible, or wrong-context container SHALL produce a precise error without automatic restart. A replacement container using the same name SHALL require identity/path revalidation before receiving credentials.

*Verification: T16.*

**DCK-009 - No broad infrastructure privileges [MUST]**

The adapter SHALL use existing operator access. It SHALL NOT mount the Docker socket inside the container, add privileged mode, change group membership, expose a LAN API, or request root merely to simplify collection.

*Verification: T13, T37.*

**DCK-010 - Physical path mapping [MUST]**

Host and container paths SHALL be mapped through explicit registered roots with canonical containment checks. Case, symlinks, mount boundaries, worktrees, and paths with spaces SHALL not cause source escape or cross-project session selection.

*Verification: T12, T17, T36.*

## 8. Identity attribution: the primary correctness requirement

### 8.1 What is attributed

A session is a conversation/history identity. A turn is an upstream logical unit of work. An attempt is one observed execution segment of a turn under a specific launch and identity binding. A subagent relation links a parent execution context to a child agent/thread when upstream evidence provides that link. A usage observation is the smallest retained accounting fact. These are distinct entities; the account column on a session row cannot replace them.

**ATT-001 - Observation-level ownership [MUST]**

Every observed usage record SHALL carry an identity binding or an explicit unresolved/conflicted state with provenance. Ownership SHALL not be inferred solely from the current auth.json, a session label, latest selected profile, ingestion time, model, or plan.

*Verification: T19, T21, T23, T29.*

**ATT-002 - Multi-identity sessions [MUST]**

The same session SHALL support turns and attempts belonging to different identity bindings. Session-level identity presentation SHALL be a derived set, and account filters SHALL include only matching usage observations rather than all usage in a matching session.

*Verification: T21, T22, T32.*

**ATT-003 - Capture at start [MUST]**

For qualified Codex versions, Tandem SHALL record launch context and bind session/turn identity at the earliest supported lifecycle boundary before work is lost to a crash. It SHALL not depend exclusively on Stop, Interrupt, or SubagentStop to discover identity.

*Verification: T19, T20.*

**ATT-004 - Stable per-launch context [MUST]**

The capture adapter SHALL obtain immutable per-launch identity metadata through a version-tested propagation mechanism. Missing or stale environment variables SHALL be detected. A mutable global active-profile file SHALL not be the only source for a hook arriving late.

*Verification: T20, T24.*

**ATT-005 - Subagent relation correctness [MUST]**

Child usage SHALL inherit identity only through a verified parent-attempt/launch relationship or direct execution evidence. Parent session IDs, child agent IDs, and child thread IDs SHALL remain distinct. Missing edges SHALL remain unresolved until evidence arrives.

*Verification: T22, T24.*

**ATT-006 - Repeated logical turn IDs [MUST]**

A logical turn retried or resumed under a new identity SHALL produce separate attempt-level attribution where evidence establishes the boundary. A single mutable (thread, turn)->account mapping SHALL not overwrite previous ownership.

*Verification: T23.*

**ATT-007 - Late and out-of-order events [MUST]**

Late events from profile A received after profile B starts SHALL retain A through their original launch/attempt evidence. Ingestion order SHALL not determine ownership. Reprocessing with stronger evidence SHALL be deterministic and audited.

*Verification: T24, T26.*

**ATT-008 - Exact, inferred, manual, unknown, conflicted [MUST]**

The data model SHALL distinguish direct launch/event evidence, verified parent inheritance, operator assertion, unresolved identity, and contradictory evidence. These states SHALL be visible in reports; a manually asserted historical label SHALL not be presented as automatically verified.

*Verification: T24, T29, T30.*

**ATT-009 - No duplicated inherited history [MUST]**

Inherited parent history, forks, compaction, archived copies, and subagent transcript prefixes SHALL not be counted as new child usage. Physical source ownership and native response identity SHALL govern normalization, with conservative handling of legacy counters.

*Verification: T25, T26.*

**ATT-010 - Conflicting evidence [MUST]**

Contradictory non-secret account evidence, source ownership, launch binding, or response identity SHALL create a visible conflict. The implementation SHALL not silently choose whichever source arrived last or whichever profile is active.

*Verification: T23, T24, T26.*

**ATT-011 - Identity-safe quotas [MUST]**

A recorded quota observation SHALL belong to the identity binding and scope evidenced when observed. A later identity switch SHALL not move that quota state to another profile. Unknown limit windows and stale samples SHALL remain explicit.

*Verification: T31.*

**ATT-012 - Limits of observation [MUST]**

The product SHALL describe attribution as local evidence for observed work. It SHALL not claim to prove an unobserved provider bill, remote account-wide usage, or tool behavior that bypasses instrumentation. All missing records and unavailable sources SHALL affect completeness indicators.

*Verification: T29, T31, T32.*

**ATT-013 - Cross-account cumulative uncertainty [MUST]**

When a legacy usage delta spans an unproven identity or attempt boundary, the collector SHALL retain an unresolved/conflicted interval rather than assigning the entire delta to the newer profile. Stronger evidence may resolve it later without adding the same tokens twice.

*Verification: T23, T26.*

### 8.2 Attribution evidence precedence

First correlate a usage response to its actual thread/turn and attempt. Then use direct identity evidence tied to that execution, checking it against the immutable launch binding. Where direct evidence is absent, a trusted hook-to-launch binding may establish the attempt; a verified parent-attempt edge may establish a child. A manually supplied historical assertion is lower assurance and must remain labeled. Contradictions become conflicts rather than being hidden by a rigid priority order. Timestamps alone may suggest a candidate but are not proof.

Custom TANDEM_* environment variables are non-secret correlation data, not an authentication mechanism. A same-user process can forge local files; the application protects against accidental contamination and untrusted browser input, not a malicious actor already controlling that OS account. Process identity, target generation, file permissions, nonce correlation, and independent rollout evidence improve confidence without claiming tamper-proof billing evidence.

### 8.3 Required Profile A -> Profile B example

| Observed event | Required identity result | Required dashboard result |
| --- | --- | --- |
| Launch LA activates A; session S starts turn T1 | A for attempt T1/LA | S shows A initially. |
| T1 spawns worker W1; W1 emits usage | A through the verified parent attempt | Worker contributes to A and T1 without counting inherited parent usage twice. |
| T1 reaches usage limit or crashes | Already observed work remains A | Recorded limit is usage exceeded; crash is not misreported as a provider error without evidence. |
| User exits/stops blocking processes, selects B, resumes S | New launch LB and new/retried attempt belong to B | S becomes Multiple identities: A, B. Earlier rows stay A. |
| T2 or retry attempt emits B usage and spawns W2 | B for those observations and verified W2 execution | Identity filter B excludes A usage while showing necessary parent context. |
| A late W1 event arrives after LB starts | A, or unresolved if its relation is missing | Never reassigned to B because of ingestion time. |
| Collector restarts and reimports all sources | Same identities and totals | No new tokens solely because records were replayed. |

### 8.4 Instrumentation qualification

Current Codex documentation lists SessionStart, UserPromptSubmit, SubagentStart, SubagentStop, Stop and SessionEnd hooks; turn-scoped hooks expose turn identifiers and subagent events carry agent identifiers. Subagent hook session_id refers to the parent session. Hook trust is required for non-managed commands. Those documented facts motivate this adapter, but they do not prove that every installed version or server mode propagates custom launch context identically. [S09]

Qualify the existing 0.159.0 binary using real captured, sanitized metadata and a controlled parent/child execution. Discover which lifecycle events are actually present rather than assuming an Interrupt event from the donor code exists everywhere. A release-blocking test must prove crash-before-stop capture, a resumed session under B, agent/thread linkage, and stale background-server behavior. When a feature is unavailable, the UI must state the exact limitation instead of claiming full tracking.

## 9. Hook capture and event transport

**CAP-001 - Minimal hook event set [MUST]**

Install only events required for session, turn-start, child-start/stop, completion and supported interruption capture. Ordinary tool-call hooks SHALL not be enabled just to identify accounts. Existing user/plugin hooks and trust settings SHALL be preserved.

*Verification: T14, T19, T38.*

**CAP-002 - No work amplification [MUST]**

Hooks SHALL perform bounded input validation, metadata projection and durable event publication only. They SHALL not start the collector, open the analytics database, scan sessions, print reports, contact the network, or initiate additional agent turns.

*Verification: T18, T38.*

**CAP-003 - Metadata-only projection [MUST]**

Before persistence, hooks SHALL discard prompt text, assistant messages, tool input/output, environment dumps, cookies and tokens. Allowed metadata includes versioned event kind, launch/target IDs, session/turn/agent relationships, transcript reference, model metadata, status and timestamps.

*Verification: T37, T38.*

**CAP-004 - Atomic event publication [MUST]**

Use one bounded event per committed file or an equivalently crash-safe record protocol. Writers SHALL not share an unprotected append buffer. Publication SHALL use a restricted temporary file and atomic completion marker; readers SHALL ignore unfinished writes.

*Verification: T19, T24, T28.*

**CAP-005 - Acknowledgment after commit [MUST]**

The host SHALL acknowledge an event for deletion only after its normalized effect and event receipt are durably committed. Repeated transport or replay SHALL be idempotent. A crash between database commit and source deletion SHALL not duplicate usage.

*Verification: T24, T26, T28.*

**CAP-006 - Neutral Codex hook response [MUST]**

Each hook SHALL emit only the documented neutral output for that event/version, with no model context, approval decision, continuation request, or user-facing receipt by default. Hook errors SHALL not masquerade as an instruction to Codex.

*Verification: T38.*

**CAP-007 - Bounded failure behavior [MUST]**

Hooks SHALL fail quickly without blocking useful Codex work when later telemetry fails. A visible tracking-degraded state SHALL be raised out of band; the collector SHALL reconcile persisted rollouts without inventing identity evidence. Essential pre-launch record failure follows the explicit untracked policy.

*Verification: T19, T28, T38.*

**CAP-008 - Versioned and restrictive envelopes [MUST]**

All hook envelopes SHALL have a schema version, event ID, launch ID and target generation. Validate size, field types, field lengths and source containment. Unknown fields SHALL be ignored or quarantined without execution; unsupported schema versions SHALL not be treated as valid empty usage.

*Verification: T36, T38, T45.*

### 9.1 Example normalized event envelope

```json
{
  "schemaVersion": 1,
  "eventId": "ev_<random-id>",
  "kind": "turn.started",
  "launchId": "launch_A",
  "targetId": "work-build",
  "targetGeneration": "resolved-container-generation",
  "profileId": "profile_A",
  "identityBindingId": "binding_A",
  "sessionId": "session_S",
  "turnId": "turn_T1",
  "agentId": null,
  "occurredAt": "2026-09-30T06:00:00Z",
  "source": { "adapter": "codex-hooks", "schema": "qualified-schema" }
}
```

This is a Tandem-internal schema, not a payload claimed to be produced natively by Codex. Store timestamp provenance and a receipt timestamp separately. A child-start event must preserve all actual parent/agent fields supplied by the qualified adapter. Do not fabricate a child thread ID from agent_id unless that equivalence is verified for the specific upstream format.

## 10. Collection, accounting, and persistent data

**COL-001 - Read-only source handling [MUST]**

The collector SHALL read registered Codex rollout/session sources without modifying, truncating, deleting, or rewriting them. Hook/configuration installation is a separate consented operation. Collection SHALL include the relevant active and archived sources.

*Verification: T25, T27, T36.*

**COL-002 - Incremental and recoverable parsing [MUST]**

Persist file generation, cursor, parser state and source health. Commit normalized observations and cursor progress together. Incomplete trailing records SHALL wait for more data; rotation, truncation and replacement SHALL trigger bounded revalidation rather than blind offset reuse.

*Verification: T25, T27.*

**COL-003 - Duplicate-safe observation keys [MUST]**

Use stable upstream response identifiers when available, namespaced to their documented uniqueness domain. Source-copy identity and immutable observation facts SHALL support fallback deduplication. Adding a profile or launch ID to an otherwise identical response key SHALL not turn a replay into new usage.

*Verification: T26.*

**COL-004 - Conservative legacy counters [MUST]**

Legacy cumulative counters SHALL use a verified baseline and monotonic validated deltas. Counter resets, inherited baselines and uncertain request boundaries SHALL be flagged. Native and legacy records describing the same work SHALL not both contribute to totals.

*Verification: T25, T26.*

**COL-005 - Bounded decompression [MUST]**

Use host built-in gzip/Zstandard support with streaming input, decompressed-byte and record-size limits, time/cancellation bounds, and explicit corrupt/truncated-source status. No bundled native decoder SHALL be executed.

*Verification: T03, T27.*

**COL-006 - One writer and responsive reads [MUST]**

A collector worker SHALL own the analytics writer. Schema migrations and imports SHALL be coordinated. Dashboard requests SHALL remain responsive while parsing yields in bounded batches. Multiple launcher processes SHALL not become competing database writers.

*Verification: T27, T33, T39.*

**COL-007 - Useful observation fields [MUST]**

Retain supported token categories, recorded model and reasoning effort, service tier, timestamps, duration evidence, terminal outcome, source format/version and provenance. Missing data SHALL be unknown, not zero or a fabricated default.

*Verification: T26, T31, T32.*

**COL-008 - Safe numeric accounting [MUST]**

Token counts SHALL be nonnegative validated integers with overflow protection. Cached-input and reasoning subsets SHALL not be added again to totals that already include them. Monetary estimates SHALL use fixed-point or equivalent decimal-safe arithmetic.

*Verification: T26, T31.*

**COL-009 - Honest local cost estimates [MUST]**

API-equivalent cost estimates SHALL be labeled estimates, retain the pricing source/version and unpriced portions, and remain distinct from actual subscription fees or quota. Unknown model aliases SHALL not be silently mapped to a guessed price.

*Verification: T31.*

**COL-010 - Preserve observed failure [MUST]**

Store original structured failure/outcome metadata without conversation text, plus a presentation status. Exact observed usage-limit errors SHALL display usage exceeded. Process disappearance without a recorded provider failure SHALL display interrupted/unknown termination rather than an invented cause.

*Verification: T21, T28, T32.*

### 10.1 Minimum logical data model

| Entity | Minimum fields / relationships |
| --- | --- |
| Profile | Immutable profileId; display label; created/updated/deleted timestamps; optional local non-secret description. |
| IdentityBinding | Immutable bindingId; profileId; provider/account/workspace consistency metadata when available; first/last seen; retired state. No tokens. |
| Target | targetId; type; path roots; runtime capability record; Docker context/instance generation or local host identity; credential-scope key. |
| Launch | launchId; bindingId; targetId/generation; project; effective home; parent/child process evidence; start/end; tracked mode; journal state. |
| Thread/Session | Upstream thread ID in its validated namespace; physical source owner; parent/root relationships; optional local display name. |
| TurnAttempt | threadId; turnId; attemptId; launchId; start/end/status; boundary evidence; attribution state. |
| AgentRelation | Parent attempt/thread/turn; agent ID; child thread ID when proven; source/provenance; unresolved edge state. |
| UsageObservation | Stable observation key; thread/turn/attempt evidence; token vector; model/tier; binding or unresolved state; pricing snapshot. |
| QuotaObservation | binding evidence; recorded limit/window; percent/remaining if explicit; reset time; observedAt; source freshness. |
| CaptureReceipt / Cursor | Event IDs acknowledged; file generation and offset; parser version/state; completeness and failure details. |
| AttributionEvidence / Audit | Evidence type; referring event/source; non-secret value; resolution revision; operator assertions and corrections. |
| Settings | Dashboard theme/font scale; default filters; target/project defaults; configured time zone; non-secret lifecycle/retention settings. |

This is a logical model, not a requirement for twelve microservices or an ORM. Some entities may share tables where invariants remain explicit. Foreign keys, uniqueness constraints, migration revisions and query indexes must support the acceptance tests. Physical Codex session ownership must not be confused with a profile that changes over time.

### 10.2 Local storage and retention

```text
Tandem home (OS-user private)
  config.json
  profiles/             # private credentials; never in analytics exports
  launches/             # durable non-secret activation/launch journals
  targets/              # setup metadata and bridge manifests
  inbox/                # sanitized committed capture events
  data/usage.sqlite     # host-local analytics only
  backups/              # explicit restricted backups
  logs/                 # bounded redacted diagnostics
```

The default Tandem home is %LOCALAPPDATA%/CodexTandem on native Windows and ${XDG_STATE_HOME}/codex-tandem on POSIX when XDG_STATE_HOME is set, otherwise ~/.local/state/codex-tandem. An explicit --home overrides that root after containment and ownership checks. Do not store state inside the npm installation. Keep the SQLite database on one native local filesystem, not a live Windows/WSL shared path or network drive. A registered Docker source can be on a mount, but the analytics database itself stays host-local. Retain aggregate history until explicit deletion; acknowledged transient inbox files can be removed. Unacknowledged events must not be silently discarded under storage pressure.

## 11. Dashboard and reporting requirements

The dashboard is a developer workstation view, not a mobile-first application. Reuse the existing session grouping, readability settings and typed browser code where suitable; a full visual redesign is not a dependency of launcher integration. The essential change is attribution clarity. Session summaries must not mislead users into believing a conversation has one immutable account.

**UI-001 - Session and turn hierarchy [MUST]**

Show sessions with project/target, first/latest activity, observed outcomes, identity set and totals. Expanding a session SHALL show turns, attempt boundaries where necessary, child work and identity-specific contributions.

*Verification: T21, T22, T32.*

**UI-002 - Mixed-identity presentation [MUST]**

A session with more than one binding SHALL show Multiple identities and a breakdown. Each turn/attempt SHALL show its own binding or unresolved state. Filtering to one identity SHALL not charge that identity for contextual rows displayed from another.

*Verification: T21, T22, T32.*

**UI-003 - Visible evidence and health [MUST]**

Show collector state, last successful reconciliation, source completeness, backlog, missing instrumentation, unsupported formats, stale quota data and attribution conflicts. Unknown identity SHALL be a visible selectable category.

*Verification: T29, T32, T39.*

**UI-004 - Readable accessible desktop UI [MUST]**

Provide keyboard-operable controls, visible focus, semantic tables, adequate contrast, light/dark/system themes and a global font-size setting affecting every component. Reduced-motion preferences SHALL be respected; live refresh SHALL not move focus or reset expanded rows.

*Verification: T34.*

**UI-005 - Common filters and exports [MUST]**

Support target, project, profile/binding, model, outcome, attribution status and time-range filtering. CLI and browser SHALL use consistent inclusive/exclusive time-boundary semantics and documented time zone. Export non-secret report data as JSON and CSV.

*Verification: T31, T32, T35.*

**UI-006 - No secrets or destructive browser control [MUST]**

The browser SHALL not expose credentials, initiate login, execute arbitrary commands, change credential ownership, or kill processes. Profile/target names may be displayed; credential CRUD and stopping remain explicit CLI operations.

*Verification: T35, T37.*

**UI-007 - Persisted presentation only [MUST]**

Local session display names, theme, font scale and default filters SHALL persist independently of upstream logs and normalized ownership. Renaming a session SHALL not rewrite Codex transcripts.

*Verification: T30, T34.*

**UI-008 - Quiet default receipts [MUST]**

The launcher SHALL not inject usage receipts into the active Codex terminal or model context by default. A concise post-exit local summary MAY be enabled without delaying exit for a full import; pending work SHALL be stated rather than replaced with zero.

*Verification: T18, T32, T38.*

## 12. Security, privacy, and Windows distribution

### 12.1 Trust boundaries

The relevant boundaries are the local OS user, the selected container user/filesystem, the existing Codex process tree, the host collector, the browser and the npm supply chain. Protect secrets from other unprivileged local users and hostile web pages. Treat rollout contents, paths, imported files, hook payloads and profile labels as untrusted data. An actor controlling the same user account or the Docker daemon is outside the confidentiality boundary; do not advertise protection against that actor.

**SEC-001 - Private credential files [MUST]**

Credential and activation files SHALL be owner-restricted on POSIX and verified with effective user ACLs on Windows. POSIX chmod flags SHALL not be accepted as proof of equivalent Windows protection. Secrets SHALL not appear in command arguments, Docker environment, logs, exports, URLs or crash diagnostics.

*Verification: T08, T37, T44.*

**SEC-002 - Local-only authenticated server [MUST]**

Bind the dashboard API to loopback only. Require a private per-installation capability/session authentication mechanism, validate Host and Origin, use restrictive browser policies and protect state-changing endpoints against cross-site requests. Do not rely on localhost alone as authentication.

*Verification: T35.*

**SEC-003 - Restricted file and input access [MUST]**

All source/inbox/import paths SHALL remain within approved canonical roots. Prevent traversal, unsafe symlink following, decompression/resource abuse, malicious HTML labels and CSV formula execution on export.

*Verification: T27, T35, T36.*

**SEC-004 - Metadata minimization [MUST]**

Analytics and event stores SHALL not contain prompt/response text, source code, tool arguments/output, complete process command lines, or token material. Diagnostics SHALL default to redacted paths and IDs and disclose the fields included before export.

*Verification: T37.*

**SEC-005 - No hidden network activity [MUST]**

Tandem SHALL not send telemetry or usage to external services by default. Login remains an explicitly invoked Codex operation. Registry, update, price and quota network checks SHALL not run on the launch path and SHALL require a documented opt-in or explicit command.

*Verification: T18, T37.*

**SEC-006 - Windows security stays enabled [MUST]**

Installation, source build, launch, capture, compression, database operations, dashboard and uninstall SHALL be tested with Smart App Control enforcing on the target Windows 11 machine. Tandem SHALL not disable security features or claim npm is categorically exempt from policy.

*Verification: T44.*

**PKG-001 - No companion-owned native runtime artifacts [MUST]**

The production npm tarball SHALL contain compiled JavaScript, static browser assets, schemas/data and necessary text helpers only. It SHALL not contain companion-owned .exe/.dll/.node/.so binaries or fetch/compile such artifacts at install time.

*Verification: T01, T43, T44.*

**PKG-002 - Installation without lifecycle compilation [MUST]**

The published package SHALL install and run with lifecycle scripts disabled. It SHALL not require TypeScript, pnpm, Python, Go, Rust, a compiler, or administrator access on a normal local Windows/WSL/Linux installation beyond existing trusted Node and Codex.

*Verification: T01, T43, T44.*

**PKG-003 - Windows launch paths [MUST]**

Validate the installed npm command shim and a documented direct node entrypoint. Distinguish .cmd launch handling from native executable launching. Do not change execution policy to repair a blocked shim; present a policy-compliant diagnostic or already-approved invocation path.

*Verification: T17, T44.*

**PKG-004 - Name and publication verification [MUST]**

Before publishing, confirm npm scope ownership, scoped package availability and command naming conflicts. The SRS name SHALL not be presented as a registered package or trademark clearance. Preserve third-party license notices and inspect the final tarball for secrets and unintended files.

*Verification: T01, T43.*

Microsoft recommends testing all loaded binary and integration paths under Smart App Control. A JavaScript distribution reduces companion-owned executable exposure but does not provide a universal security-policy exemption. No device security setting is changed as part of this specification. [S10]

## 13. Reliability, lifecycle, maintenance, and migration

**OPS-001 - Background lifecycle [MUST]**

After approved setup, a normal launch SHALL start or reconnect the collector without waiting for it. Exactly one collector SHALL own an installation database. start, stop and status commands SHALL operate on that identified collector only.

*Verification: T28, T39.*

**OPS-002 - Offline and backlog mode [MUST]**

Collector absence or failure SHALL not block Codex when the launch journal and capture inbox can still retain essential evidence. On recovery, replay the backlog and reconcile persisted sources. If essential pre-launch recording fails, default to cancel and offer explicit untracked launch.

*Verification: T19, T28.*

**OPS-003 - No implied automatic reboot startup [MUST]**

The MVP SHALL not require an OS service or startup-task installation. After host restart, the next launcher/collector command can recover state. Any future login/boot autostart remains optional and explicitly installed.

*Verification: T39, T40.*

**OPS-004 - Diagnostics and recovery [MUST]**

doctor SHALL report runtime capabilities, executable resolution, target user/path mapping, hooks/trust status where detectable, process conflicts, locks, filesystem permissions, decoder/database self-test, source health and package version without secrets. Repair SHALL be an explicit separate operation with a preview.

*Verification: T03, T16, T37, T39.*

**OPS-005 - Backups and imports [MUST]**

Create consistent analytics backups and validate schema/version before restore or import. Preview destructive operations and preserve a rollback copy. Analytics exports SHALL exclude credentials. Unknown future schema versions SHALL fail clearly rather than mutate the store.

*Verification: T40, T41.*

**OPS-006 - Bounded disk use [MUST]**

Log rotation, completed journal compaction and acknowledged event cleanup SHALL be bounded. Never delete unacknowledged attribution events silently. Disk-full conditions SHALL expose degraded status and follow essential-record failure rules.

*Verification: T27, T28, T39.*

**OPS-007 - Safe uninstall [MUST]**

An explicit uninstall/setup-cleanup command SHALL remove only unchanged Tandem-managed hooks and helper files after preview. Changed user files SHALL remain with a warning. Credentials and analytics SHALL remain by default; purge requires separate confirmation.

*Verification: T38, T40.*

**MIG-001 - Selective reuse [MUST]**

Migrate tested accounting behavior and UI features from codex-report at the pinned base, not its native driver/decoder packaging. Port the codex-as workflow rather than its unsafe process-inspection fallback or remove-before-rename credential replacement.

*Verification: T09, T26, T43.*

**MIG-002 - Read-only donor migration [MUST]**

Migration SHALL back up and read donor state without altering it. Present a preview of profiles, identity mappings, session settings, records and conflicts. Preserve unattested historical labels as assertions rather than manufacturing verified attribution.

*Verification: T29, T30, T41.*

**MIG-003 - One credential controller during transition [MUST]**

During comparison, two collectors may read copied fixtures or read-only sources into separate databases, but only one manager SHALL control each live credential scope. Rollback instructions SHALL preserve the latest valid refresh state and remove only Tandem-managed integration.

*Verification: T08, T10, T41.*

## 14. Nonfunctional requirements and measurement

### 14.1 Startup budget

The approved budget applies to Tandem-added latency after identity confirmation, not to the user reading the selector. It includes credential safety work, required capture setup and any synchronous launch-hook contribution; moving a delay into SessionStart does not satisfy the requirement. No fixed sleeps, network calls or full source scans belong on this path. First-time login, explicit recovery and user-approved process stopping are exceptional workflows and must be reported separately, not hidden in warm-start numbers.

**NFR-001 - Selection-to-Codex latency [MUST]**

For a configured healthy target, Tandem-added latency SHALL be p95 <=100 ms and p99 <=250 ms on agreed validation machines. A repeatable 2-3 second wrapper delay SHALL fail release acceptance. Publish observed values and machine/runtime details; never present these targets as achieved without measurement.

*Verification: T18.*

**NFR-002 - Docker baseline accounting [MUST]**

For Docker mode, compare wrapped launch with an equivalent direct docker exec using the same container, user, working directory, environment and Codex binary. Exclude only transport work inherent to that direct baseline. All extra exec calls, guard checks and hooks introduced by Tandem SHALL count as added overhead.

*Verification: T18.*

**NFR-003 - Hook budget [MUST]**

On qualified target/runtime combinations, capture hooks SHALL target p95 <=50 ms and p99 <=100 ms, with a bounded maximum compatible with Codex hook deadlines. No hook may delay a turn for collector readiness or history import. End-to-end startup remains the stronger gate.

*Verification: T18, T38.*

**NFR-004 - History-independent startup [MUST]**

Launch work SHALL be independent of transcript history size. Compare empty, typical and large stores; the large-store launch path SHALL not parse rollouts, open the analytics database for reporting, or scale with file count.

*Verification: T18, T27.*

**NFR-005 - Freshness and responsiveness [MUST]**

With healthy local sources, display committed new usage within a target p95 of 2 seconds; the no-mount Docker pull adapter targets p95 of 5 seconds. Report source persistence delay separately. A paginated dashboard request SHALL target p95 <=300 ms on the standard synthetic dataset while collection is active.

*Verification: T27, T33.*

**NFR-006 - Resource targets [MUST]**

On the standard validation dataset, idle collector CPU SHALL target <=1 percent of one logical CPU averaged over five minutes, with idle RSS <=150 MiB and bounded import RSS <=300 MiB excluding Codex/browser. Report Docker process overhead separately. Adjustments require measured evidence and an explicit requirements revision.

*Verification: T33.*

**NFR-007 - Durability definition [MUST]**

Successfully acknowledged capture events SHALL survive a collector/process crash and replay without duplication. Local files SHALL use data flush and directory durability where supported. Sudden power loss, device failure, unflushed upstream Codex data and destruction of an unexported container spool SHALL have explicitly documented limits.

*Verification: T09, T19, T28.*

**NFR-008 - Deterministic accounting [MUST]**

For the same supported input records and evidence, replay order, restart count and source copies SHALL not change final normalized totals or ownership. Contradictory data must deterministically produce a conflict instead of a silently different answer.

*Verification: T24, T26.*

**NFR-009 - Maintainability and support [MUST]**

Platform/target adapters and upstream format decoders SHALL have small documented contracts and fixture tests. No generic abstraction SHALL be added without at least one concrete requirement. New upstream formats SHALL be capability-detected and version-qualified.

*Verification: T43, T45.*

**NFR-010 - Selector responsiveness [MUST]**

The initial interactive selector SHALL target p95 <=200 ms on configured local targets, with no network or history work before its first usable frame. Target discovery may show cached status and continue separately; moving a 2-3 second delay ahead of selection SHALL not evade the startup requirement.

*Verification: T04, T18.*

### 14.2 Benchmark protocol

Use at least 50 warm-up iterations and 1,000 measured alternating direct/wrapped launches of a deterministic harmless fixture process. Record absolute direct latency, wrapped latency, and paired overhead distributions. Separately qualify the real Codex UI-ready boundary with instrumented local captures that are not retained as conversation content. Include cold OS/process cache, collector stopped/running/importing, minimum/current supported Node, native Windows with Smart App Control on, Linux/WSL and the actual legacy-container target. Do not subtract additional Tandem RPCs from the result.

Use a documented synthetic dataset of at least 100,000 usage observations across 1,000 sessions for dashboard/query benchmarks, plus a 1 GiB mixed rollout corpus for bounded import behavior. These are test fixtures, not an estimate of the user's actual data. Performance deviations are release findings; they do not authorize removing credential safety or identity capture.

## 15. Public interfaces, configuration, and failure contracts

### 15.1 Proposed CLI surface

```text
codex-tandem                         # arrow-key profile selector
codex-tandem --target work-build     # select identity for container
codex-tandem --identity work -- <codex arguments>
codex-tandem resume [session-id] [--target work-build]
codex-tandem profiles add|list|show|rename|login|remove
codex-tandem targets add|list|show|edit|remove|check
codex-tandem start                   # collector only
codex-tandem stop                    # collector only, never Codex
codex-tandem status
codex-tandem processes [--target work-build]
codex-tandem processes stop [--target work-build]  # confirmation
codex-tandem dashboard
codex-tandem report [--identity work] [--json]
codex-tandem sync                    # explicit reconciliation
codex-tandem doctor [--target work-build] [--json]
codex-tandem export|backup|restore|migrate
codex-tandem uninstall               # managed integration cleanup
```

Command names are an implementation-facing contract baseline; any renaming should occur before public release and update examples/tests together. Identity selection is always arrow-driven in interactive mode even when targets are supplied by flags. The target-setup wizard is not a required step on every launch. Noninteractive operations that can lose work require explicitly scoped consent parameters, not a global environment variable that bypasses all confirmations.

### 15.2 Docker target configuration example

```json
{
  "schemaVersion": 1,
  "defaultTarget": "work-build",
  "targets": [{
    "id": "work-build",
    "type": "docker",
    "dockerContext": "<setup-resolved-local-context>",
    "containerSelector": "<user-selected-name-or-id>",
    "expectedContainerId": "<setup-resolved-full-id>",
    "user": "cnh",
    "home": "/home/cnh",
    "codexExecutable": "/home/cnh/.local/bin/codex",
    "codexHome": "/home/cnh/.codex",
    "workspaceMappings": [{
      "hostRoot": "<approved-host-project-root>",
      "targetRoot": "<approved-container-project-root>"
    }],
    "captureTransport": "<verified-mounted-or-pull-adapter>",
    "bridgeInterpreter": "<detected-existing-absolute-path>"
  }]
}
```

Placeholder paths are intentionally unresolved because the user has not supplied project mount layout, Docker context, the current container's full identity or the available bridge interpreter. Setup must discover/confirm them. The example is not evidence that /home/cnh/.codex is the effective current home; that path must be checked before use. No secret belongs in this configuration.

### 15.3 Internal service and event API

Keep a versioned loopback API for read-only reports, health, source status and non-secret display settings. Mutating presentation settings require validation and optimistic version checks. Use an installation nonce and process identity to identify the correct collector before sending stop or reconnect actions; a recycled port or PID is not sufficient. A lightweight request/revision polling scheme is adequate; no WebSocket or message broker requirement exists.

| Condition | Required behavior |
| --- | --- |
| Unsupported Node or missing capability | Fail early with detected version/capability and required minimum; do not run installation scripts to repair it. |
| Missing profile or ambiguous target | Show explicit resolution error; never silently choose another identity. |
| Conflict or uncertain credential owner | Offer safe review/cancel; do not modify auth state. |
| Collector unavailable; capture durable | Launch normally, retain backlog, show tracking health separately. |
| Essential journal write fails | Cancel by default; explicit continue-untracked selection is required. |
| Hook bridge unavailable | Block full-tracking qualification; any intentional untracked run is clearly marked. |
| Unknown rollout format | Expose unsupported source and incomplete totals; do not show zero as complete. |
| Container exits mid-session | Observe abnormal termination and retain evidence; do not infer a provider error or restart the build container. |
| Credential refresh sync fails | Preserve the active target file, retain recovery context, and warn without printing tokens. |
| Child exits | Preserve the child exit code and distinguish launch failure from child failure in diagnostics. Signal-derived codes must be documented per platform. |

**INT-001 - Argument and exit transparency [MUST]**

Except for explicitly reserved Tandem options, command arguments and standard streams SHALL reach the selected Codex process unchanged. Child exit status SHALL propagate; Tandem launch/validation errors SHALL use documented distinct diagnostics and machine-readable codes.

*Verification: T05, T17.*

**INT-002 - Versioned machine interfaces [MUST]**

Configuration, event, report/export and internal API formats SHALL declare schema versions. JSON output SHALL remain parseable without interleaved progress text or ANSI escapes; human diagnostics belong on stderr.

*Verification: T05, T35, T41.*

**INT-003 - No installer hidden in doctor [MUST]**

Diagnostic commands SHALL be read-only except for explicitly documented disposable self-tests. Fixes to hooks, permissions, targets or configuration SHALL require a separate preview-and-confirm operation.

*Verification: T37, T39.*

## 16. Acceptance verification and traceability

All tests below are specifications. None has been executed against a Codex Tandem implementation. A successful document render is not a software acceptance result. Release evidence must include the exact application commit, package checksum, runtime versions, platform, target mode, fixture provenance, commands/results, and any manual steps. Each MUST requirement maps to at least one acceptance test in the traceability appendix and machine-readable register.

#### T01 - Packed installation and artifact inventory

Procedure: Build and pack the application; inspect every production file and transitive production dependency. Install the tarball with lifecycle scripts disabled into an isolated user prefix. Exercise the actual bin command and direct Node entrypoint.

Acceptance: No native companion artifact, secret, raw transcript, compiler download, or install-time build. CLI works without developer tooling. Publication and license checks are recorded separately.

#### T02 - Minimum and newer host runtimes

Procedure: Run core and package tests at the Node capability floor and maintained newer compatible releases. Disable or mock missing built-in capabilities to exercise diagnostics.

Acceptance: Supported runtimes work; missing APIs yield actionable failure. No use of newer-only APIs hidden by recent type definitions. No artificial Node-major cap.

#### T03 - Database/compression/runtime self-test

Procedure: Use temporary state to open the built-in database and decode known gzip/Zstandard fixtures. Observe executable launches on Windows, WSL and Linux. Include the supplied incompatible container Node example.

Acceptance: Database and compression work entirely on host built-ins. No decoder executable or native addon runs. Broken container Node is never invoked.

#### T04 - Arrow selector and terminal restoration

Procedure: Test zero/one/two/many profiles, Up/Down/Enter/Escape, Ctrl+C, terminal resize, Unicode labels and an exception during selection.

Acceptance: No numeric selection required, no identity change on cancellation, stable selection by ID, and clean restored terminal state.

#### T05 - Non-TTY and machine-readable contracts

Procedure: Pipe stdin, redirect stdout, omit identity, pass explicit identity, use --json, and pass Codex flags after -- including --profile.

Acceptance: No hangs or silent selection. JSON has no ANSI/progress contamination. Codex flags are not consumed as Tandem identity options.

#### T06 - CRUD, login staging and policy

Procedure: Add/import identities; cancel login; simulate keyring/managed file-mode prohibition; inspect proposed configuration changes and existing hooks.

Acceptance: Only consented changes occur, active credentials survive cancellation, secrets stay hidden, and policy restrictions cannot be bypassed.

#### T07 - Rename, deletion and account replacement

Procedure: Create A, record usage, rename A, remove its saved credentials, then log in as a different account under the same display label.

Acceptance: Historical profile/binding IDs and totals remain intact. New account gets a distinct binding; deleted profile shows historical status.

#### T08 - Credential refresh preservation

Procedure: Run a mock/qualified Codex flow that refreshes A credentials, exit, switch to B, then reactivate A. Repeat with a plain external Codex refresh and post-exit sync failure.

Acceptance: Latest valid matching credentials survive; wrong-binding copies are blocked; a sync failure preserves a recoverable target file.

#### T09 - Activation crash fault injection

Procedure: Terminate the launcher at every write/flush/replace/journal phase, including after auth replacement but before child execution. Restart and attempt another switch.

Acceptance: At least one valid credential version remains; incomplete phases are recovered or blocked clearly; no false successful launch or identity record is produced.

#### T10 - Competing launchers and stale locks

Procedure: Start two managers simultaneously; use aliased CODEX_HOME paths and a shared binding across targets; simulate a stale nonce and reused PID.

Acceptance: Only one managed launch obtains the scope, duplicate activation is prevented, and stale locks are not cleared solely on PID assumptions.

#### T11 - Background server stop consent

Procedure: Provide owned and unrelated server processes, including an old launch-context server. Choose cancel, graceful stop, timeout without force approval, then separately approve force. Reuse a listed PID before the stop action.

Acceptance: Cancel changes nothing; only revalidated approved processes stop; unrelated/reused PIDs survive; identity switch waits for safe scope.

#### T12 - Path and credential-scope aliases

Procedure: Register aliases to the same home, different homes, Windows/WSL shared database paths and source mounts. Attempt concurrent activation and cross-environment DB access.

Acceptance: Physical scope aliases share protection; independent sources stay distinct; a live shared Windows/WSL analytics store is rejected.

#### T13 - Actual work-container end-to-end launch

Procedure: From modern WSL, select a profile and launch the existing /home/cnh/.local/bin/codex in the selected legacy container. Confirm user, home, directory, terminal behavior and a representative work build command.

Acceptance: Codex uses the original toolchain as the intended user. No Node/npm/glibc/OS upgrade occurs in the container and no privileged Docker change is made.

#### T14 - Container metadata bridge qualification

Procedure: Test detected existing interpreter/facilities, trusted and untrusted hooks, mounted and no-mount spools, absent host collector, malformed payload, and missing safe bridge.

Acceptance: Metadata-only events survive and replay. No raw prompt is persisted; no modern Node is invoked. Missing capability or trust is explicit, not full-tracking success.

#### T15 - Container process termination and client disconnect

Procedure: Disconnect or kill the host docker exec client while Codex/children remain alive. Exercise scoped approved stopping and leave an unrelated build process and container PID 1 running.

Acceptance: Tandem checks remote state; it does not assume child death or terminate the container/unrelated processes. Credential scope is not released prematurely.

#### T16 - Container state and replacement

Procedure: Pause, stop, remove/recreate, rename and switch Docker context for a configured target. Include inaccessible daemon and unexpected user/path mapping.

Acceptance: No automatic restart/recreation or credential transfer to an unverified replacement. Clear target-state diagnosis and revalidation path.

#### T17 - Arguments, environment, project and exit

Procedure: Use spaces, quotes, Unicode and shell metacharacters in allowed paths/arguments; test exit codes, signals, TTY/no-TTY, Codex config profiles, worktrees and resume.

Acceptance: Arguments are preserved without shell injection, environment initialization is explicit, project scoping is correct and terminal/exit behavior is transparent.

#### T18 - Startup and hook performance

Procedure: Use the benchmark protocol in section 14 across healthy warm/cold conditions, small/large histories, collector states and Docker baseline. Trace filesystem, child-process and network activity.

Acceptance: Reported percentiles meet the approved gates. All Tandem-added work is counted; no history scan/network/DB reporting blocks launch or a lifecycle hook.

#### T19 - Crash before completion event

Procedure: Launch A, capture start and turn identity, emit usage, then terminate Codex before any Stop event. Repeat with collector absent and an essential-journal write failure.

Acceptance: Persisted observed work retains A; collector later catches up. Essential failure defaults to cancel with explicit untracked alternative. No zero-as-complete result.

#### T20 - Stale or missing launch context

Procedure: Resume through a persisted server with old TANDEM metadata; drop custom environment propagation; supply delayed hook data and explicit launch correlation alternatives.

Acceptance: Adapter proves current context or blocks full tracking. A stale global profile pointer never relabels work. Version capability evidence is retained.

#### T21 - A to B within one session

Procedure: Run session S turn T1 under A, record usage-limit termination, stop approved conflicts, relaunch/resume S under B and execute T2.

Acceptance: T1 and its quota remain A; T2 is B; session shows both. Identity-filtered totals exactly match only their observations.

#### T22 - Nested child attribution

Procedure: Create parent/worker/reviewer descendants under A, then additional child work under B in the same conversation. Include a child-start hook whose session ID is the parent ID.

Acceptance: Parent and child identifiers are not conflated, each proven child execution is assigned correctly, and aggregate totals count each observation once.

#### T23 - Same logical turn, new account attempt

Procedure: Retry an upstream turn ID under B after A termination; also simulate account/workspace change during a launch and a legacy cumulative delta spanning the change.

Acceptance: Attempt history remains separate. Unknown cross-boundary deltas are unresolved/conflicted, not entirely charged to B. Earlier confirmed work is unchanged.

#### T24 - Out-of-order evidence and replay

Procedure: Deliver a child usage record before its relation, an A event after B starts, duplicate inbox deliveries, mismatched account evidence and a post-commit pre-ack crash.

Acceptance: Deterministic final attribution; unresolved state resolves only with valid evidence; conflicts remain visible; no duplicate usage.

#### T25 - Forks, archives and incomplete files

Procedure: Import inherited history, forked transcripts, archived and compressed copies, partial lines, truncation, file replacement and compaction fixtures.

Acceptance: Physical source ownership and cursor rebuilds are correct. Parent history is not charged again to children; incomplete records await completion.

#### T26 - Accounting invariants

Procedure: Replay native and legacy records in varied orders with duplicated response IDs, changed content under one ID, resets, cached/reasoning subsets and large integer values.

Acceptance: Stable totals, no double counting, conservative resets, overflow protection and deterministic conflict detection.

#### T27 - Bounded collection and source failures

Procedure: Import the large corpus with corrupt/compression-bomb fixtures, huge records, unavailable paths, locked files and a growing source. Measure memory, cancellation and source modifications.

Acceptance: Bounded resource use, responsive cancellation, visible incomplete/error status, no source writes and no full-history startup scan.

#### T28 - Collector restart, outages and disk full

Procedure: Stop/restart collector, crash between DB commit and acknowledgment, fill the inbox disk, interrupt transport and destroy an unexported container spool.

Acceptance: Replay is idempotent, captured evidence survives supported failures, essential failures are explicit, and destroyed unexported evidence is not claimed recoverable.

#### T29 - External and historical sessions

Procedure: Import old uninstrumented logs and start Codex outside Tandem. Include account-looking labels and files written while another profile is selected.

Acceptance: No invented verified ownership. Historical/manual assertions are labeled; unknown/conflicted usage stays visible and excluded from confident per-account claims.

#### T30 - User metadata survives migration and profile changes

Procedure: Rename sessions/profiles, retire identities, edit display settings, migrate donor labels and rebuild analytics from retained evidence.

Acceptance: Presentation changes do not modify source transcripts or ownership; historical IDs and user metadata survive as designed.

#### T31 - Prices, quotas and periods

Procedure: Use priced/unpriced models, unknown aliases, stale quota snapshots, explicit limit reset times, custom date ranges, billing settings and time-zone boundaries.

Acceptance: Token totals remain separate from subset counters; cost estimates are labeled and partial where needed; quotas stay identity-bound and no plan limits are inferred.

#### T32 - Dashboard/CLI accounting parity

Procedure: Compare dashboard, CLI, JSON and CSV on mixed identities, child work, attempt retries, unknown ownership and all supported filter combinations.

Acceptance: Same selected observations and totals everywhere. Mixed-session summaries and contextual child rows do not charge excluded accounts.

#### T33 - Responsiveness and resource profile

Procedure: Run continuous import and replay against standard query fixtures while issuing paginated reports. Measure idle/import CPU and RSS including Docker adapter overhead.

Acceptance: Performance and resource targets are measured, reproducible and within the documented gates; collector work does not freeze the server.

#### T34 - Desktop accessibility and presentation

Procedure: Operate all UI via keyboard; check focus during refresh, semantic tables, light/dark/system themes, all font scales, zoom, long labels, reduced motion and empty/error states.

Acceptance: Every component respects font scale, controls remain accessible, no clipping blocks information and live updates preserve focus/context.

#### T35 - Local API and export abuse

Procedure: Send unauthenticated and foreign Host/Origin requests; try browser-triggered commands, XSS labels, stale settings revisions and CSV formula cells.

Acceptance: Unauthorized/state-changing attacks fail, no arbitrary command/credential endpoint exists, and exports are safe with consistent schema/version.

#### T36 - Source path and import containment

Procedure: Supply ../ traversal, symlinks escaping approved roots, hostile paths in hook events, aliases, malformed archives and a shared DB destination.

Acceptance: Only registered contained resources are read; no unsafe extraction or live cross-environment DB sharing occurs.

#### T37 - Privacy and policy inspection

Procedure: Seed secrets, prompts and tool output into all input paths. Inspect disk, logs, process arguments, Docker environment, API responses, exports and backups. Test denied OS/organization permissions.

Acceptance: No content/secret leaks; allowed metadata only; no permission/security-policy bypass or automatic installation. Diagnostics are redacted.

#### T38 - Hook coexistence and neutral behavior

Procedure: Install/update/remove Tandem hooks alongside custom/plugin hooks; edit a managed hook manually; test malformed and oversized inputs, unsupported events and output contracts.

Acceptance: Existing hooks survive, modified files are not overwritten/deleted, neutral output does not alter agent flow, and failures stay bounded.

#### T39 - Lifecycle and diagnostics

Procedure: Start the collector twice, recycle a PID/port, stop it, restart the host, run read-only doctor and explicit repair previews.

Acceptance: Only the owned collector is controlled, stale identities are detected, next launch recovers, and doctor does not mutate production configuration.

#### T40 - Upgrade, rollback and uninstall

Procedure: Upgrade the packed package with existing state, restore an analytics backup, run managed cleanup, retain/purge choices and roll back after token refresh.

Acceptance: State remains outside package files; only approved data is removed; schema incompatibility is explicit and obsolete credentials are not blindly restored.

#### T41 - Donor migration and schemas

Procedure: Use copies of codex-as/codex-report state, preview imports, simulate future schema versions, interrupted migration and rollback. Compare donor files byte-for-byte.

Acceptance: Donor state is unchanged, migration is recoverable, unverified labels stay assertions and newer incompatible schema is not modified.

#### T42 - Requirement and evidence completeness

Procedure: Validate every requirement-to-test mapping, every approval A-F, scenario coverage, source provenance and explicit NOT EXECUTED versus passed status.

Acceptance: No orphan MUST requirement or fabricated pass. Each release claim has linked evidence and an identified verification environment.

#### T43 - Build, dependency and upstream boundaries

Procedure: Review architecture, imports and production tarball; build with minimum compiler/runtime and supported newer versions; inspect licenses and dependency floors.

Acceptance: No hidden native runtime dependency, duplicate accounting engine or accidental modern-only API. Reproducible lockfile and package checks are retained.

#### T44 - Windows 11 Smart App Control enforcing

Procedure: On the real qualified Windows 11 environment, keep Smart App Control on and test source build, packed installation, command shim, Codex launch, hooks, SQLite, compression, dashboard and uninstall.

Acceptance: All required flows succeed without disabling protections, installing a signing certificate or compiling native add-ons. Failure is a release blocker, not a claimed npm exemption.

#### T45 - Installed Codex capability matrix

Procedure: Qualify the observed 0.159.0 binary and compatible newer releases using real sanitized lifecycle evidence; test missing hooks, changed payloads and server context reuse.

Acceptance: Support status is per tested capability/target. Full tracking is not advertised when event IDs, inheritance or account boundaries are unproven.

### 16.1 Required platform qualification matrix

| Environment | Required coverage | Release status |
| --- | --- | --- |
| Native Windows 11 x64, Smart App Control ON | Packed install, source build, local launch, profile CRUD, safe stopping, hook capture, compression, UI, update/uninstall | NOT EXECUTED |
| Modern Ubuntu WSL 2 x64 | All local target workflows and desktop browser access | NOT EXECUTED |
| WSL host -> actual Ubuntu 14.04 container | Existing Codex and project build, metadata bridge, A/B resume, scoped server stopping, latency, no-mount or actual existing mount | NOT EXECUTED |
| Native glibc-based Linux x64 | All local workflows; Docker adapter fixtures and integration where available | NOT EXECUTED |
| Minimum host Node plus maintained newer releases | Runtime/package tests, built-in APIs, version diagnostics and build-tool floor | NOT EXECUTED |
| Future macOS / ARM64 / remote targets | Not part of MVP certification; do not mark supported through compilation alone | OUT OF SCOPE |

The user workstation and legacy image are not accessible in this authoring session. Container interpreter, mount layout, actual process/server behavior, hook trust and Windows enforcement must be checked during implementation. These are technical acceptance gates, not unanswered product-scope questions.

## 17. Delivery work packages and release gates

| Gate | Implementation work | Evidence needed to proceed |
| --- | --- | --- |
| G0 - compatibility slice | One packed pure-JS CLI, host SQLite/Zstandard self-test, minimal selector, direct local launch and target discovery. | T01-T05, T13-T14 and initial T44. Establish no-Node-in-container and Windows feasibility before dashboard work. |
| G1 - safe identity launcher | Profile CRUD, recoverable file activation, process ownership, user-approved stopping and fast launch. | T06-T12, T15-T18; crash matrix and performance logs. |
| G2 - attribution backbone | Immutable launches, minimal hooks/bridge, turn attempts, child relationships, inbox replay and evidence states. | T19-T24, T29 and T45 on the actual installed Codex. No full-tracking claim until A/B resume passes. |
| G3 - accounting and dashboard | Port parser invariants; one storage backend; implement mixed-account session/child views and shared reports. | T25-T35; golden totals and actual browser/keyboard checks. |
| G4 - hardening and transition | Privacy, diagnostics, migration, updates, uninstall and final packed artifact. | T36-T44 plus all prior tests; requirement traceability and rollback rehearsal. |

Do not spend the first milestone on a visual redesign or a generalized platform. The smallest useful prototype settles the actual uncertainty: a pure-JavaScript host package that launches the existing container Codex, captures a sanitized turn-start event without container Node, and survives an A-to-B resume with correct ownership. If it fails, record the exact boundary and revise the adapter rather than migrating the whole product blindly.

### 17.1 Risk and unresolved-technical-evidence register

| Risk | Required mitigation | Reevaluation trigger |
| --- | --- | --- |
| Legacy bridge facilities are unverified | Setup probes existing interpreter/JSON projection/durable-write capability; never install an EOL runtime or persist raw prompts as a fallback. | No safe existing bridge: redesign the transport or obtain an explicitly approved environment change before claiming tracked Docker support. |
| Installed Codex differs from current docs | Capability matrix, fixtures from the actual 0.159.0 target, strict server-context checks. | Missing turn/child identity fields or stale server environment: block the unsupported guarantee and establish a tested minimum/adapter. |
| Docker boundary adds visible latency | Measure the true equivalent direct exec baseline and every extra Tandem RPC; keep cached discovery outside routine launch. | Approved latency targets missed: simplify or explicitly revise requirements; do not exclude introduced work. |
| Smart App Control blocks an execution path | Pure-JS runtime package; validate build as well as run on the real enforcing machine; diagnose the exact blocked file. | Any required blocked path: release cannot claim compliant installation until resolved without disabling protections. |
| node:sqlite / Zstandard API evolution | Small adapters, feature checks, minimum-runtime tests and maintained newer-runtime CI. | Breaking behavior or a security issue requires a documented floor or implementation change. |
| Container recreated or local spool destroyed | Generation binding, explicit revalidation, asynchronous durable host commit and visible backlog. | Unexported evidence loss: mark unknown; never promise recovery of destroyed files. |
| External processes mutate credentials | Scope guard, account-consistency checks and explicit process ownership boundaries. | Unsupported shared server/client use: cancel switch or downgrade attribution visibly, not silently. |
| npm naming or scope rights unavailable | Registry and publish-permission checks before release. | Naming collision or missing rights: resolve name/scope with owner before publication. |

### 17.2 Release definition of done

All MUST requirements have passing evidence on their required platforms; full attribution passes A/B resume and nested-child scenarios; no credential safety regression remains; measured launch overhead meets the approved budget; the actual packed artifact works with Windows security enabled; privacy and migration checks pass; and unsupported configurations are explicitly documented. Any exception requires an identified requirement waiver approved by the product owner, not an unexplained green test label.

**REL-001 - No unsupported success claims [MUST]**

The release SHALL include a tested support matrix, measured performance evidence, package checksum, migration/rollback instructions and known limitations. Tests not run SHALL remain not run. Required failures SHALL block the corresponding product claim or release until resolved or explicitly waived.

*Verification: T42, T44, T45.*

## 18. Source provenance and interpretation

External documentation was checked on September 30, 2026. Source versions are evidence snapshots, not exact-version restrictions on consumers. The following source register supports factual platform/API statements; the requirements, budgets, data model and proposed architecture are engineering decisions in this specification. No API credentials, private transcript content or actual authentication file was collected.

[S01] Node.js build/platform requirements. Official platform requirements; glibc/libstdc++ and WSL support-boundary context.

[Source: Node.js build/platform requirements](https://github.com/nodejs/node/blob/main/BUILDING.md)

[S02] Node.js SQLite API, version 22 documentation. SQLite enabling-flag removal at 22.13.0; documented API maturity.

[Source: Node.js SQLite API, version 22 documentation](https://nodejs.org/download/release/latest-v22.x/docs/api/sqlite.html)

[S03] Node.js Zlib API at the proposed capability floor. Zstandard is present at 22.15.0; use bounded built-in decoding.

[Source: Node.js Zlib API at the proposed capability floor](https://nodejs.org/download/release/v22.15.0/docs/api/zlib.html)

[S04] Docker container exec reference. User/environment/TTY/workdir options; API floors and container lifetime relationship.

[Source: Docker container exec reference](https://docs.docker.com/reference/cli/docker/container/exec/)

[S05] OpenAI Codex authentication. Credential storage modes, file sensitivity and existing Codex login ownership.

[Source: OpenAI Codex authentication](https://developers.openai.com/codex/auth/)

[S06] Docker bind mounts. Daemon-host path boundary and explicit mount configuration.

[Source: Docker bind mounts](https://docs.docker.com/engine/storage/bind-mounts/)

[S07] Docker container cp reference. File transport behavior and ownership considerations for fallback setup/pull.

[Source: Docker container cp reference](https://docs.docker.com/reference/cli/docker/container/cp/)

[S08] OpenAI Codex release 0.159.0. Release exists; user reports it running. No hook-compatibility test was performed here.

[Source: OpenAI Codex release 0.159.0](https://github.com/openai/codex/releases/tag/rust-v0.159.0)

[S09] OpenAI Codex hooks. Lifecycle hooks, trust, common identifiers and parent-session semantics for subagents.

[Source: OpenAI Codex hooks](https://developers.openai.com/codex/hooks/)

[S10] Microsoft Smart App Control application testing. Actual execution/integration-path validation under enforcement is required.

[Source: Microsoft Smart App Control application testing](https://learn.microsoft.com/en-us/windows/apps/develop/smart-app-control/test-your-app-with-smart-app-control)

[S11] OpenAI Codex App Server. Server/session/authentication context; not evidence that every user installation has the same background process behavior.

[Source: OpenAI Codex App Server](https://developers.openai.com/codex/app-server/)

[P01] User-provided codex-as-go archive. Inspected README.md; internal/manager/app.go lines 209-304; internal/manager/files.go lines 25-58. Archive SHA-256: fd675029900bfad68382a513b17b415ced49ba51b6a1f388ffa06e5d931be67d.

[P02] codex-report pinned implementation base. Requested branch feat/dashboard-redesign; baseline commit 516a1d6306559d8a607de84c4d76529160349ac8. Relevant files: src/hooks.ts, database.ts, collector.ts, parser.ts, compression.ts, service.ts; package.json and docs/ARCHITECTURE.md. This specification does not silently move to a later branch head.

[Source: codex-report pinned implementation base](https://github.com/kanakamedala-rajesh/codex-report/tree/516a1d6306559d8a607de84c4d76529160349ac8)

[U01] User requirements and approvals. Approved A-F decisions, work-container diagnostics, observed 2-3 second folio delay, and consent requirement for stopping conflicting processes. Diagnostics are user-provided observations, not remotely reproduced measurements.

## Appendix A. Requirement-to-test traceability

Every requirement below is a MUST in this baseline. The linked tests contain procedures and acceptance criteria; their status remains NOT EXECUTED. The included JSON register contains the same requirement and test definitions for implementation planning. T42 checks this traceability itself.

| Requirement | Title | Tests |
| --- | --- | --- |
| SCP-001 | Single focused application | T01, T43 |
| SCP-002 | Authorized identities only | T06, T37 |
| SCP-003 | Evidence boundaries | T02, T14, T45 |
| ENV-001 | Host execution boundary | T03, T13 |
| ENV-002 | Minimum and newer runtimes | T02, T43 |
| ENV-003 | No implicit system modifications | T13, T37, T44 |
| ENV-004 | Bridge capability gate | T14, T37, T45 |
| ARC-001 | Minimal fast-path dependency graph | T18, T43 |
| ARC-002 | Single source of accounting logic | T26, T32 |
| ARC-003 | Independent operating environments | T12, T36 |
| CLI-001 | Arrow-key selector | T04 |
| CLI-002 | Explicit noninteractive behavior | T05 |
| CLI-003 | Identity and Codex profile distinction | T05, T17 |
| CLI-004 | Project-aware resume | T17, T25 |
| CLI-005 | No selector network calls | T18 |
| CLI-006 | Useful account scale | T04, T06 |
| PRO-001 | Profile CRUD | T06, T07 |
| PRO-002 | Stable history | T07, T30 |
| PRO-003 | Reauthentication versus replacement | T07, T23 |
| PRO-004 | Login isolation | T06, T08 |
| PRO-005 | Direct Codex compatibility | T08, T29 |
| AUTH-001 | File mode with policy consent | T06, T37 |
| AUTH-002 | Outgoing refresh preservation | T08, T09 |
| AUTH-003 | Recoverable replacement | T09 |
| AUTH-004 | Immutable launch binding | T09, T19, T37 |
| AUTH-005 | Scope locking | T10, T12 |
| AUTH-006 | Lock ownership proof | T10, T11 |
| AUTH-007 | External authentication changes | T23, T29 |
| AUTH-008 | No auto-restore of obsolete tokens | T08, T09, T40 |
| PROC-001 | Scoped inventory | T10, T11, T15 |
| PROC-002 | Explicit stop consent | T11 |
| PROC-003 | Graceful before forced stop | T11, T15 |
| PROC-004 | Do not trust stale PID lists | T10, T11 |
| PROC-005 | Verify remote termination | T15, T28 |
| PROC-006 | No stale server context | T11, T20 |
| PROC-007 | Collector is a separate process role | T28, T39 |
| DCK-001 | Separate identity and target selection | T13, T16 |
| DCK-002 | Correct user and build environment | T13, T17 |
| DCK-003 | Preserve terminal semantics | T05, T13, T17 |
| DCK-004 | Safe credential transport | T08, T13, T37 |
| DCK-005 | No modern Node inside container | T03, T14 |
| DCK-006 | Durable capture with collector absent | T14, T19, T28 |
| DCK-007 | Background-only collection transport | T18, T27 |
| DCK-008 | Container lifecycle boundaries | T16 |
| DCK-009 | No broad infrastructure privileges | T13, T37 |
| DCK-010 | Physical path mapping | T12, T17, T36 |
| ATT-001 | Observation-level ownership | T19, T21, T23, T29 |
| ATT-002 | Multi-identity sessions | T21, T22, T32 |
| ATT-003 | Capture at start | T19, T20 |
| ATT-004 | Stable per-launch context | T20, T24 |
| ATT-005 | Subagent relation correctness | T22, T24 |
| ATT-006 | Repeated logical turn IDs | T23 |
| ATT-007 | Late and out-of-order events | T24, T26 |
| ATT-008 | Exact, inferred, manual, unknown, conflicted | T24, T29, T30 |
| ATT-009 | No duplicated inherited history | T25, T26 |
| ATT-010 | Conflicting evidence | T23, T24, T26 |
| ATT-011 | Identity-safe quotas | T31 |
| ATT-012 | Limits of observation | T29, T31, T32 |
| ATT-013 | Cross-account cumulative uncertainty | T23, T26 |
| CAP-001 | Minimal hook event set | T14, T19, T38 |
| CAP-002 | No work amplification | T18, T38 |
| CAP-003 | Metadata-only projection | T37, T38 |
| CAP-004 | Atomic event publication | T19, T24, T28 |
| CAP-005 | Acknowledgment after commit | T24, T26, T28 |
| CAP-006 | Neutral Codex hook response | T38 |
| CAP-007 | Bounded failure behavior | T19, T28, T38 |
| CAP-008 | Versioned and restrictive envelopes | T36, T38, T45 |
| COL-001 | Read-only source handling | T25, T27, T36 |
| COL-002 | Incremental and recoverable parsing | T25, T27 |
| COL-003 | Duplicate-safe observation keys | T26 |
| COL-004 | Conservative legacy counters | T25, T26 |
| COL-005 | Bounded decompression | T03, T27 |
| COL-006 | One writer and responsive reads | T27, T33, T39 |
| COL-007 | Useful observation fields | T26, T31, T32 |
| COL-008 | Safe numeric accounting | T26, T31 |
| COL-009 | Honest local cost estimates | T31 |
| COL-010 | Preserve observed failure | T21, T28, T32 |
| UI-001 | Session and turn hierarchy | T21, T22, T32 |
| UI-002 | Mixed-identity presentation | T21, T22, T32 |
| UI-003 | Visible evidence and health | T29, T32, T39 |
| UI-004 | Readable accessible desktop UI | T34 |
| UI-005 | Common filters and exports | T31, T32, T35 |
| UI-006 | No secrets or destructive browser control | T35, T37 |
| UI-007 | Persisted presentation only | T30, T34 |
| UI-008 | Quiet default receipts | T18, T32, T38 |
| SEC-001 | Private credential files | T08, T37, T44 |
| SEC-002 | Local-only authenticated server | T35 |
| SEC-003 | Restricted file and input access | T27, T35, T36 |
| SEC-004 | Metadata minimization | T37 |
| SEC-005 | No hidden network activity | T18, T37 |
| SEC-006 | Windows security stays enabled | T44 |
| PKG-001 | No companion-owned native runtime artifacts | T01, T43, T44 |
| PKG-002 | Installation without lifecycle compilation | T01, T43, T44 |
| PKG-003 | Windows launch paths | T17, T44 |
| PKG-004 | Name and publication verification | T01, T43 |
| OPS-001 | Background lifecycle | T28, T39 |
| OPS-002 | Offline and backlog mode | T19, T28 |
| OPS-003 | No implied automatic reboot startup | T39, T40 |
| OPS-004 | Diagnostics and recovery | T03, T16, T37, T39 |
| OPS-005 | Backups and imports | T40, T41 |
| OPS-006 | Bounded disk use | T27, T28, T39 |
| OPS-007 | Safe uninstall | T38, T40 |
| MIG-001 | Selective reuse | T09, T26, T43 |
| MIG-002 | Read-only donor migration | T29, T30, T41 |
| MIG-003 | One credential controller during transition | T08, T10, T41 |
| NFR-001 | Selection-to-Codex latency | T18 |
| NFR-002 | Docker baseline accounting | T18 |
| NFR-003 | Hook budget | T18, T38 |
| NFR-004 | History-independent startup | T18, T27 |
| NFR-005 | Freshness and responsiveness | T27, T33 |
| NFR-006 | Resource targets | T33 |
| NFR-007 | Durability definition | T09, T19, T28 |
| NFR-008 | Deterministic accounting | T24, T26 |
| NFR-009 | Maintainability and support | T43, T45 |
| NFR-010 | Selector responsiveness | T04, T18 |
| INT-001 | Argument and exit transparency | T05, T17 |
| INT-002 | Versioned machine interfaces | T05, T35, T41 |
| INT-003 | No installer hidden in doctor | T37, T39 |
| REL-001 | No unsupported success claims | T42, T44, T45 |

## Appendix B. Glossary and invariant checklist

| Term | Meaning |
| --- | --- |
| Profile | A stable local selectable label/configuration; not a Codex model/config profile. |
| Identity binding | A stable reference to the authenticated provider account/workspace represented by credentials; separate from mutable labels. |
| Target | Where the Codex process executes: local host or a configured existing Docker container. |
| Credential scope | Canonical shared CODEX_HOME plus target and binding ownership controls. |
| Launch | One managed process execution with immutable target and identity metadata. |
| Turn attempt | An execution segment of an upstream logical turn under one evidenced identity/launch. |
| Child relation | An evidenced link between parent work and a subagent, not an assumption based on a similar title. |
| Observation | A normalized fact about recorded usage, distinct from its source copies or ingestion order. |
| Attribution evidence | The reason an observation belongs to a binding; not a claim of provider billing verification. |
| Capture inbox | A durable queue of sanitized events, not a raw transcript cache. |
| Capability floor | Minimum APIs required by the design; it is not proof that every later runtime/OS combination has been tested. |
| Qualification | A recorded successful test on a stated application/runtime/platform/target combination. |

Core invariants: one credential controller per protected scope; no identity switch while ownership is unsafe; no known work relabeled by the latest profile; no child history counted twice; no raw content in analytics/capture stores; no silent untracked launch after essential recording failure; no process kill without scoped consent; no host-security or legacy-build changes hidden in setup; no claimed pass without execution evidence.
