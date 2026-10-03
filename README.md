# Codex Tandem

Codex Tandem is a TypeScript host companion for an existing Codex installation.
It is being built against the [approved requirements](docs/README.md) in
[kanakamedala-rajesh/codex-tandem](https://github.com/kanakamedala-rajesh/codex-tandem).

The current package provides host capability checks, read-only target discovery,
a synthetic G0 selector/child wrapper, and bounded metadata capture groundwork.
Production credential activation returns `G1_ACTIVATION_UNAVAILABLE`. These
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
replacement. Probes pin the immutable container ID and recheck its name. Context
aliases on one daemon share a credential-scope key. No lifecycle, credential,
permission or security changes occur; container Node and Codex are not executed.

Schema version 1 adds `targetDiscovery`: `ok`, `target`, `user`, canonical
`paths`, `credentialScope` and Docker `context`/`generation`. Bridge metadata
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

## Local scope guards

```sh
codex-tandem processes --codex-home /existing/codex-home --json
codex-tandem guard --state-home /private/tandem-state --codex-home /existing/codex-home --binding /private/saved-binding.json --hold --json
```

`processes` reports foreground, worker and background Codex candidates as managed,
unrelated or unknown. Only positive native evidence of a different physical home
proves unrelatedness; inaccessible evidence stays blocking. JSON returns bounded
process metadata, without command lines, environment values or credential bytes.
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
These guards currently accept local homes and existing binding files. Docker target
ownership and transfer remain separate work.

The compiler-free Windows text helper currently reads supported native AMD64
processes. Unsupported architecture, inaccessible memory or inconsistent native
layout/creation evidence stays unknown. Linux uses native `/proc` evidence. Native
platform checks and packed-package checks qualify individual guard cases; complete
stop, Docker, containment and launch performance acceptance remain separate. Native
Windows guard acquisition currently takes seconds and does not meet SRS §14's
100 ms/250 ms latency budgets.
