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
