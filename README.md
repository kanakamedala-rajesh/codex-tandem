# Codex Tandem

Requires trusted host Node >=22.15.0, including built-in SQLite and Zstandard.
Newer compatible Node majors are allowed; use a maintained, patched release.

Development: `npm ci --ignore-scripts`, `npm run build`, `npm test`.
The compiler and Node type definitions are exact locked development dependencies.
There are no production dependencies or installation lifecycle scripts.

Build before `npm pack --ignore-scripts`. Install the resulting tarball with
`npm install --global --prefix <isolated-prefix> --ignore-scripts <tarball>`.
Run `codex-tandem doctor --json`. On Windows use the installed
`<prefix>\codex-tandem.cmd doctor --json` when PowerShell policy blocks its .ps1
shim; do not change execution policy. Direct entrypoint:
`node <prefix>/node_modules/codex-tandem/dist/cli.js doctor --json` on Windows,
`node <prefix>/lib/node_modules/codex-tandem/dist/cli.js doctor --json` on Linux/WSL.
A .cmd shim must be invoked through the Windows command processor, not passed
as a native executable to an execFile-style process API.

Doctor only writes a uniquely named temporary SQLite database, queries it,
closes it and removes its temporary directory. gzip/Zstandard checks decode
fixed tiny synthetic fixtures in memory with a 128-byte output bound. No Codex,
Docker (unless target discovery is requested), container Node, decoder process, network request, installation or repair
is performed. JSON stdout is schemaVersion 1; diagnostics and Node experimental
warnings go to stderr. Exit status is 0 on success, 1 on capability failure,
2 on invalid arguments. Capability failures redact underlying error strings.

The CLI dispatches commands in src/cli.ts, with doctor loaded lazily. Future
launch commands must keep SQLite/compression off their import path. The doctor
contract is `{schemaVersion:1,command:"doctor",runtime:{node,platform,arch},ok,
checks:[{capability,status,code?,action?}]}`. Capabilities are node, sqlite, gzip,
zstandard. This reports host capability, never target or release qualification.

Package publication, license approval, native Linux, actual legacy-container
and full Smart App Control qualification remain separate work.

## G0 synthetic selector

`codex-tandem [run] --g0-fixture profiles.json --target local [--identity ID] [--json] -- CHILD_ARGS`

This compatibility slice always launches the bundled harmless child, never Codex.
The fixture must contain only `schemaVersion: 1`, `synthetic: true`, and a
`profiles` array of `{ "id": "stable-id", "label": "Display label" }` objects.
IDs are unique; the full selected ID is shown before confirmation, including
wrapped details for long IDs. Interactive terminals need at least 20 columns and
8 rows; use explicit --identity on smaller terminals. Files are limited to
64 KiB, 500 profiles, 80 ASCII ID characters and 200 label characters. Control
characters are rejected. No credentials, history, quota or network are read.
Production invocation returns `G1_ACTIVATION_UNAVAILABLE` until G1 activation.

Interactive terminals use arrows and Enter; Escape/Ctrl+C cancel (exit 130).
Without usable stdin/stdout/stderr terminals, or with `--json`, supply an explicit
stable `--identity`. `--target local` is always required. Wrapper failures exit 2
and print a diagnostic on stderr; `--json` makes that diagnostic a single
schema-versioned JSON object. Successful child stdout/stderr remain untouched.
Everything after `--`, including Codex `--profile`, passes unchanged to the child.
The child prints its arguments as JSON, writes a harmless stderr marker, echoes
stdin, and supports `--fixture-exit=N`, `--fixture-no-stdin`, `--fixture-wait`, and
`--fixture-read-line` (echo one terminal input line as JSON, then exit).
Child exits propagate; terminal Ctrl+C exits 130 on Windows and POSIX.

Run installed-package tests by setting `TANDEM_TEST_PACKAGE` to the installed
package directory before `node --test test/run.test.mjs`. Terminal qualification
is `python tools/qualify-selector.py NODE INSTALLED_PACKAGE`; Windows uses
pywinpty and pyte in a separate test-only environment; Ubuntu uses pyte.
These are never production dependencies. The terminal harness requires natural
expected exits and fails any timeout requiring forced cleanup.

## Read-only target discovery

`codex-tandem doctor --json --target local` resolves the current OS user, effective
home and Codex home, existing executable, and physical project root. Override
paths with `--project-root PATH --project PATH --codex-home PATH
--codex-executable PATH`. The root defaults to the invocation directory; a project
must exist and remain within that canonical root. Nonexistent Codex homes are
reported without creation. A root is an explicit discovery input, not a persistent
registration or permission to read sessions.

For an existing Linux Docker container, use `doctor --json --target docker
--container NAME --docker-context CONTEXT --user USER --project-root /project`.
Optional `--expected-generation FULL_CONTAINER_ID` rejects name replacements.
Only local Unix-socket or Windows named-pipe Docker endpoints are accepted.
Discovery reads the daemon ID and selected state fields, pins subsequent probes
to the immutable container ID, then rechecks the configured name. Context aliases
on the same daemon share a physical credential-scope key. Docker operations use
existing access; no lifecycle, installation, credential, permission or security
changes occur. Existing Python is probed with bounded metadata-only output;
container Node and Codex are never executed by discovery.

With target options, schema version 1 adds `targetDiscovery` containing `ok`,
`target`, `user`, canonical `paths`, `credentialScope`, and, for Docker, `context`
and `generation`. `ok` means this read-only discovery passed, not that launches
or tracking are qualified. `fullTracking` remains false and `trust` unverified.
`bridge.jsonProjection` reports the host built-in or tested Python JSON facility;
`bridge.durableCapture` reports an existing facility without claiming a successful
durable write. Doctor intentionally does not write the target to qualify it.
Hook trust, lifecycle behavior and durable capture require separate qualification.
The scope key is discovery metadata and does not itself implement activation locks.

Errors distinguish stopped, paused, replaced or racing containers; inaccessible
Docker context/container; unsupported remote Docker; missing bridge; invalid Codex
home; unavailable executable; and canonical project escape or mount mismatch.
Unknown process errors are redacted. No target repair is implicit. Missing bridge
or trust never permits full tracking. Filesystem access checks are read-only OS
access observations, not Windows credential ACL qualification.

`npm run verify:discovery` packs, installs offline, and tests discovery through the
installed CLI using temporary fixture paths. Add `-- --target local` or the Docker
options above to record a real installed-package target discovery as well.

Discovery probes isolate Python with `-E -s -S -B`, then retain only the
interpreter-prefix standard-library paths before importing filesystem or JSON
modules. Project/PYTHONPATH modules, user sites, `.pth`, and startup customizations
cannot enter that probe. An unsupported interpreter layout fails closed; it is
not repaired. Projection outputs retain only named bounded metadata fields.
Windows discovery honors recognized `.exe`, `.com`, `.cmd`, `.bat` candidates in
PATHEXT order, excludes extensionless POSIX npm scripts and unsupported files,
and reports `.cmd`/`.bat` paths without executing them or claiming native launch
compatibility. The launcher must use the command processor for those shims.
