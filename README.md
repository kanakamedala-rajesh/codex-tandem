# Codex Tandem

Codex Tandem is a TypeScript host companion for an existing Codex installation.
It is being built against the [approved requirements](docs/README.md) in
[kanakamedala-rajesh/codex-tandem](https://github.com/kanakamedala-rajesh/codex-tandem).

The current package provides host capability checks, read-only target discovery,
a synthetic G0 selector/child wrapper, private profiles, guarded local credential
activation/recovery, managed local and named Docker launch/resume and bounded metadata capture groundwork. These
features do not establish full tracking, complete G0 acceptance or release support.

## Build and install

Requires host Node >=22.15.0 with built-in SQLite and Zstandard; use a maintained,
patched release. There are no production dependencies or installation scripts.

```sh
npm ci --ignore-scripts --engine-strict
npm run build
npm pack --ignore-scripts
npm install --global --prefix <isolated-prefix> --ignore-scripts <tarball>
codex-tandem doctor --json
```

On Windows, use `<prefix>\codex-tandem.cmd` if PowerShell policy blocks the .ps1
shim; keep execution policy unchanged. Process APIs must invoke .cmd/.bat shims
through the Windows command processor. Direct entrypoints are
`<prefix>/node_modules/codex-tandem/dist/cli.js` on Windows and
`<prefix>/lib/node_modules/codex-tandem/dist/cli.js` on Linux/WSL, run with Node.
See [CONTRIBUTING.md](CONTRIBUTING.md) for checks.

## Host doctor

`codex-tandem doctor --json` checks Node, SQLite, gzip and Zstandard. SQLite uses
a temporary database that is removed; decoders use tiny synthetic fixtures with
a 128-byte output bound. Doctor performs no installation or repair.

JSON stdout uses schema version 1:

```text
{schemaVersion:1,command:"doctor",runtime:{node,platform,arch},ok,
 checks:[{capability,status,code?,action?}]}
```

Diagnostics and Node warnings use stderr. Exit codes: 0 success, 1 capability
failure, 2 invalid arguments. Underlying failure strings are redacted. SQLite and
compression stay off the launch command's import path.

## Local launch and resume

```sh
codex-tandem run --target local --identity PROFILE_ID --codex-executable /existing/codex -- CODEX_ARGUMENTS
codex-tandem --target local --codex-executable /existing/codex
codex-tandem resume SESSION_UUID --target local --identity PROFILE_ID --codex-executable /existing/codex -- PROMPT
codex-tandem resume --last --target local --identity PROFILE_ID --codex-executable /existing/codex
```

An existing native Codex executable can be resolved from PATH. Node entrypoints
use `--codex-executable /existing/node --codex-script /existing/codex.js`; Windows
`.cmd`/`.bat` executable shims are refused. `--state-home`, `--codex-home` and
`--project` choose the private installation, shared native home and project.
The home must already exist with supported file-storage policy. Local target
resolution is explicit with `--target local` outside an interactive terminal; the
interactive default is local. Without stdin/stdout/stderr TTYs,
or with Tandem `--json`, supply an explicit stable `--identity`; input is never
requested implicitly. Interactive selection restores the terminal before spawn.

Supported arguments after `--` reach the existing executable unchanged without a
shell. Codex named `-p`/`--profile` is currently refused before activation with
`PROFILE_POLICY_UNVERIFIABLE`: installed Codex 0.160.0 rejects named profiles for
the app-server policy probe, and base configuration cannot prove the selected
profile's effective policy. Named Codex configuration profiles are owner-deferred
from G1;
Tandem identity selection remains separate from Codex configuration profiles.
Effective Codex `-C`/`--cd` directories are canonicalized
before policy inspection and journaling; an explicit Tandem `--project` must match.
Remote execution, a newly managed worktree, alternate local providers and ignored
user configuration are refused with `CODEX_SCOPE_UNPROVEN` because this local
adapter cannot prove their effective project or policy. Docker launching is separate.

Resume accepts UUIDs from this home's native `sessions`/`archived_sessions` rollouts.
It reads only the first `session_meta` line and checks its physical project path.
`--last` before the passthrough boundary selects the newest matching metadata
timestamp and passes that explicit UUID to Codex. Lookup is bounded to 10,000
directory entries, three dated directory levels, 64 KiB per metadata line and
16 MiB total reads; exceeding a limit fails explicitly. Links, incomplete or
unknown metadata, conflicting copies, tied newest timestamps and unavailable
project paths are refused. Session names and compressed sources are unsupported.
Raw `resume UUID` or `exec resume UUID` is also scoped while its argv stays intact.
Raw `--last` cannot prove the same upstream selection order and fails with
`RESUME_SCOPE_UNPROVEN`; use Tandem `resume --last` instead.

Before execution, guarded activation preserves outgoing refreshes, persists an
immutable intended-launch record and freshly verifies ownership and invocation
paths. This is a cooperative check, not an atomic OS check-and-spawn operation.
Short-lived children need an observed exit and independent native idle proof when
registration loses the race. Surviving or uncertain processes keep switching blocked;
the launcher never implicitly stops them. After exit, only binding-matching refreshes
are saved, and selected credentials remain usable by plain Codex. `--untracked`
explicitly places the intended-launch record in the private target journal; it
emits an `UNTRACKED_LAUNCH` diagnostic and never serves as an automatic fallback
after a tracked write failure. These records
do not establish full capture, attribution or successful child execution.

Child streams and exit status propagate, including status zero when post-exit
sync or release fails. Distinct redacted diagnostics report that failure on stderr;
do not interpret a child status zero as proof of healthy tracking or released guards.
Pre-execution validation/launch errors return 2; selector cancellation returns 130.
POSIX forwards SIGINT/SIGTERM and maps signal exits to 130/143; other signals map
to 1. Windows relies on the inherited console for Ctrl+C and does not turn a
signal-forwarding request into an implicit forced stop. A failure without an
observed child exit returns 2 and reports retained ownership for diagnosis.
`--json` applies only to Tandem diagnostics (schema version 1, `ok:false`, `code`,
`message`); Codex streams remain untouched. SQLite and compression are absent from
the launch imports. Native Linux, actual-target capture, complete acceptance
families and the outstanding Windows launch latency budget remain unqualified.

## Named Docker launch and resume

Named targets select an existing Linux container independently of the saved
identity. Register a JSON configuration with the fields below; use actual observed
daemon/container identities and existing absolute target paths. Host and target
roots are explicit physical mappings, without mounting the host credential store.

```json
{
  "id": "legacy-build",
  "type": "docker",
  "dockerContext": "desktop-linux",
  "daemonId": "OBSERVED_DAEMON_ID",
  "containerSelector": "existing-container",
  "expectedContainerId": "FULL_64_HEX_CONTAINER_ID",
  "user": "cnh",
  "home": "/home/cnh",
  "codexHome": "/home/cnh/.codex",
  "codexExecutable": "/home/cnh/.local/bin/codex",
  "bridgeInterpreter": "/usr/bin/python3",
  "workspaceMappings": [
    { "hostRoot": "/host/project", "targetRoot": "/target/project" }
  ]
}
```

```sh
codex-tandem targets add --config target.json --json
codex-tandem targets list --json
codex-tandem targets check --id legacy-build --json
codex-tandem targets edit --config target.json --confirm-id legacy-build --json
codex-tandem targets remove --id legacy-build --confirm-id legacy-build --json
codex-tandem run --target legacy-build --identity PROFILE_ID --project /host/project -- CODEX_ARGUMENTS
codex-tandem resume --last --target legacy-build --identity PROFILE_ID --project /host/project
codex-tandem processes --target legacy-build --project /host/project --json
codex-tandem processes stop --target legacy-build --project /host/project
```

`--state-home` uses the same private installation as profiles. Registration and
each operation revalidate the local Docker endpoint, daemon, immutable container,
user, home, existing executable and physical project. Stopped, paused, replaced or
inaccessible targets fail; Tandem never starts or recreates containers. A native
Windows Docker context and a WSL context can reach the same daemon through different
local endpoints; each installation retains its own named configuration and live state.
Root targets are refused. Local executable/script/home overrides do not apply to a
named target. An optional absolute `environmentWrapper` in the configuration receives
the existing Codex executable and unchanged arguments without shell interpolation.
Existing target Python 3.5+ and standard-library durability/process facilities are
required; no Node, SQLite, collector or dashboard runs in the container.

Only the selected credentials cross private control stdin. The target writes owner
only staging and `auth.json`, with file fsync, atomic replacement and directory fsync.
Outgoing refreshes are saved before replacement; incomplete journals reconcile current
validated bytes and retain ambiguous alternatives. File-backed effective policy is
checked through the existing target Codex; unsupported managed/provider/storage policy
blocks before activation. Raw directory arguments retain their argv and original spawn
cwd; every resolution is pinned within its registered root. Target resume follows the
same bounded metadata rules as local resume and returns an explicit project-scoped UUID.

A remote supervisor retains verified descendants, including adopted children after
client loss. An unreachable Docker client does not prove those processes exited;
remote and saved-binding ownership remain blocking until remote absence is verified.
The supervisor reaps children rather than using container lifecycle operations. A
persisted child remains owned after supervisor loss; missing roots without a durable
completion record leave descendant absence unproved and block recovery. External
Codex scope comes from its own `CODEX_HOME` or `HOME`; unknown scope blocks switching.
Controllers hold an owner-only, permanent file inode with a non-inherited kernel lock
through recovery and every credential request. Guard protocol 2 is required; legacy
or unknown guard protocols are refused with credentials and journals preserved. Real
interactive launches use Docker TTY; controls and piped launches do not. Codex streams
and observed exit status propagate, with separate diagnostics for sync/release failures.

Process inspection does not acquire or release the remote guard. Unknown Codex,
unproved ownership and PID1 remain blocking. Stop displays the scope, native creation
identities and a process consent key, then asks separately for graceful and force
approval. Noninteractive stop requires `--confirm-scope SCOPE` and
`--confirm-processes CONSENT_KEY` from the preceding inspection; force additionally
requires `--confirm-force CONSENT_KEY` for the surviving set. Changed ownership or
process identities invalidate consent. Supervisors, PID1 and unrelated builds are
excluded from signals; cancellation returns 130 and live/unknown survivors return 2.
Stopping never releases credentials itself.

Host fixtures establish their protocol cases only. Actual legacy credential recovery,
terminal behavior, existing Codex/toolchain execution and native Linux qualification
require separate platform evidence; registration and `codex --version` do not qualify
those acceptance families. Full capture and launch latency remain separate gates.

## Synthetic selector

```sh
codex-tandem [run] --g0-fixture profiles.json --target local [--identity ID] [--json] -- CHILD_ARGS
```

This launches a bundled harmless child. The fixture contains only
`schemaVersion: 1`, `synthetic: true` and `profiles` with unique `{id,label}`
objects. Limits: 64 KiB, 500 profiles, 80 ASCII ID characters and 200 label
characters; control characters are rejected. Credentials, history, quota and
network are not read.

Arrow keys and Enter select; Escape/Ctrl+C cancel with exit 130. Interactive use
requires stdin/stdout/stderr terminals of at least 20 columns and 8 rows.
Otherwise, including `--json`, provide an explicit stable `--identity`.
The full selected ID is shown before confirmation. `--target local` is required.

Everything after `--` passes unchanged to the child. Child streams and exit codes
propagate. Wrapper failures exit 2 and use stderr; `--json` emits one
schema-versioned error object. The child prints arguments, writes a stderr marker,
echoes stdin and supports `--fixture-exit=N`, `--fixture-no-stdin`,
`--fixture-wait` and `--fixture-read-line`.

## Read-only target discovery

```sh
codex-tandem doctor --json --target local
codex-tandem doctor --json --target docker --container NAME --docker-context CONTEXT --user USER --project-root /project
```

Local discovery resolves the OS user, home, Codex home, executable and physical
project root. Overrides: `--project-root PATH --project PATH --codex-home PATH
--codex-executable PATH`. The root defaults to cwd; a project must exist within
that canonical root. Missing Codex homes are reported without creation.

Docker discovery supports an existing Linux container through a local Unix socket
or Windows named pipe. `--expected-generation FULL_CONTAINER_ID` rejects container
replacement. `--expected-daemon DAEMON_ID` also rejects a context resolving to a
different daemon before container inspection. Probes pin the immutable container
ID, recheck the daemon identity after path projection and recheck the container
name. Project metadata must remain canonical and contained within its root. Context
aliases on one daemon share a credential-scope key. No lifecycle, credential,
permission or security changes occur; container Node and Codex are not executed.

Schema version 1 adds `targetDiscovery`: `ok`, `target`, `user`, canonical
`paths`, `credentialScope` and Docker `context`/`daemonId`/`generation`. Bridge metadata
reports existing JSON/durable-capture facilities without proving durable writes
or hook trust. `fullTracking` remains false and `trust` unverified. Discovery
scope keys do not implement activation locks.

Python probes use isolated startup and interpreter standard-library paths, excluding
project modules and startup customization; unsupported layouts fail closed.
Errors distinguish inaccessible, stopped, paused, replaced or racing containers,
remote endpoints, missing bridges, invalid paths and project/mount escape.
Read-only access observations do not qualify Windows credential ACLs.

## Profile management

```sh
codex-tandem profiles manage
codex-tandem profiles add --label Work --import /private/copied-auth.json
codex-tandem profiles list --json
codex-tandem profiles show --identity PROFILE_ID --json
codex-tandem profiles rename --identity PROFILE_ID --label New-name --description Description
codex-tandem profiles policy --codex-home /existing/codex-home --codex-executable /existing/codex
codex-tandem profiles add --label Personal --codex-executable /existing/codex
codex-tandem profiles login --identity PROFILE_ID --codex-executable /existing/codex
codex-tandem profiles remove --identity PROFILE_ID --confirm PROFILE_ID
```

Manage profiles uses Up/Down and Enter to select profiles; Escape cancels selection.
It asks for confirmation before deletion, different-account replacement and login.
Commands use immutable profile IDs. Names are presentation metadata; available
profiles cannot share a
name. Reauthentication keeps a binding only when the local account/workspace and
user consistency hints match. `--new-binding PROFILE_ID` explicitly approves a
replacement; previous bindings remain retired historical records. Removing saved
credentials requires `--confirm PROFILE_ID`, retains historical metadata and never
changes the live Codex home or analytics. Retired credentials are removed.

Only explicitly imported ChatGPT file credentials with supported local identity
hints are accepted. Hints are not remotely verified identities; API-key, agent,
unknown or inconsistent formats are blocked. Imports store an existing file and do
not qualify its use on any target. Target policy must be checked before login or
activation. JSON results contain profile labels and stable binding references,
never credential values or provider account identifiers.

Stores default to `~/.codex-tandem-windows` on Windows and `~/.codex-tandem` on
POSIX, with `--state-home PATH` for an explicit private directory. Windows and WSL
keep separate state. Credential files use effective current-user Windows ACL
verification (SYSTEM and Administrators also allowed) or owner-only POSIX access.
An insecure store, symlink, corrupt metadata or unresolved mutation lock blocks the
operation. New profile mutexes and binding leases carry nonce and native creation
evidence. Known mutation owners recover only after native absence and fresh owner
checks; legacy empty locks and guard-owned binding locks remain blocking. Recovery
restores concurrency, without restoring credentials or repairing transactions.
Reauthentication holds the old binding through replacement/removal; removal holds
all profile bindings before changing metadata. Other profiles and label changes
remain available while a managed launch protects one binding.

Login invokes the existing Codex in a restricted temporary home. First run
`profiles policy` to inspect the proposed staging storage choice. A non-file mode
requires `--approve-file-mode staging-file`; this approves a staging-only file-mode
override and a restricted backup of the original configuration. Live configuration
and credentials stay in their existing home. Cancellation/failure discards staging
and preserves saved credentials. Login output uses stderr; JSON results stay on
stdout. Native executables work directly. For a Node-hosted existing Codex entry,
use `--codex-executable /path/to/node --codex-script /path/to/codex.js`; Windows
command-processor shims require an explicit native executable or Node entry.

Effective policy inspection uses bounded `config/read` and
`configRequirements/read` RPCs on the existing Codex, with the same project and
environment. It requires a supported explicit storage mode, compares staging auth
constraints and blocks non-file managed requirements. Non-null managed/cloud
requirements, enterprise-managed layers, custom provider routes, API login and
unknown policy contracts remain unsupported; `POLICY_UNVERIFIABLE` distinguishes
incomplete policy from `FILE_STORAGE_PROHIBITED`. Copying user configuration does
not prove complete cloud-policy preservation. Real login and full platform/target
qualification remain separate acceptance evidence.

## Local credential activation

```sh
codex-tandem activate --identity PROFILE_ID --codex-home /existing/private/home --codex-executable /existing/codex --json
codex-tandem activate recover --identity PROFILE_ID --codex-home /existing/private/home --codex-executable /existing/codex --json
codex-tandem activate sync --identity PROFILE_ID --codex-home /existing/private/home --codex-executable /existing/codex --json
```

These operations use an existing Codex executable and effective file-backed policy;
they start no interactive Codex launch. A Node-hosted entrypoint can use
`--codex-script /existing/codex.js` with its Node `--codex-executable`.
`--state-home` selects the private native installation and `--project` supplies
the policy inspection directory (default cwd). Native scoped processes or uncertain
ownership block switching and sync; the commands never stop processes.

Activation saves the current home credentials to their recorded binding before
replacing `auth.json` with the selected saved credentials. The chosen identity
remains active. `sync` preserves refreshes from plain Codex after it exits, without
claiming attribution for that external launch. `recover` reconciles an interrupted
transaction using the current validated target file; it never restores a staging
snapshot. Explicit recovery can adopt an existing unmarked target only when it
matches the requested binding. Missing, invalid or contradictory alternatives
remain recovery errors and preserve saved versions for diagnosis.

Exit 0 reports `activated`, `recovered` or `synced`; failure exits 2 with a redacted
code and recovery status. These outcomes describe credentials, not a successful
Codex launch. Docker activation and release
qualification remain separate work.

## Local scope guards

```sh
codex-tandem processes --codex-home /existing/codex-home --json
codex-tandem processes stop --codex-home /existing/codex-home --json
codex-tandem guard --state-home /private/tandem-state --codex-home /existing/codex-home --binding /private/saved-binding.json --hold --json
```

`processes` reports foreground, worker and background Codex candidates as managed,
unrelated or unknown. Only positive native evidence of a different physical home
proves unrelatedness; inaccessible evidence stays blocking. JSON returns bounded
process metadata, without command lines, environment values or credential bytes.
`processes stop` displays the canonical local home, generation and verified process
set, then requires `stop` approval. Cancel or EOF returns 130 without changing
credentials or processes. POSIX requests SIGTERM first; a surviving process needs
a separate `force` confirmation before SIGKILL. This external Windows command has
no qualified graceful mechanism and explains that before separately offering
handle-bound force. Declining force leaves survivors blocking activation (exit 2).
Successful stopping returns 0 and leaves guard ownership for its manager to release.
Unknown/unregistered servers are refused, including stale launch contexts. Stop
rechecks native creation identity, private ownership and physical home/executable
generation after each decision; it never kills by name or assumes server reuse.
Windows force verifies both home handles against the stored NTFS directory identity,
including aliases; other filesystems remain unqualified and blocked. POSIX signals
follow fresh identity checks but do not use a kernel-pinned PID handle.
`guard --hold` exercises the same installation, canonical home and binding lease
used by the host API. Enter, EOF or interruption requests release. A changed owner
or surviving registered child retains protection and reports recovery required.
This diagnostic command does not activate credentials or launch or stop Codex.

Native installation state, native Codex homes and analytics destinations retain
operating-environment ownership markers after release. Windows and WSL cannot
reuse these stores, including with a different `--analytics-path`. First adoption
claims unmarked, unlocked state; unresolved existing locks or incomplete markers
block adoption. There is no automatic relabeling or migration. Physical path aliases
are resolved without changing case; hardlinked binding/database files are refused.
Local guards accept native homes and existing binding files. Named Docker process
inspection and ownership use the separate remote adapter described above.

The compiler-free Windows text helper currently reads supported native AMD64
processes. Unsupported architecture, inaccessible memory or inconsistent native
layout/creation evidence stays unknown. Linux uses native `/proc` evidence. Native
platform checks and packed-package checks qualify individual guard and stop cases;
complete Docker, containment and launch performance acceptance remain separate. Native
Windows guard acquisition currently takes seconds and does not meet SRS §14's
100 ms/250 ms latency budgets.
