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
Docker, container Node, decoder process, network request, installation or repair
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
IDs are unique; duplicate labels are disambiguated by IDs. Files are limited to
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
stdin, and supports `--fixture-exit=N`, `--fixture-no-stdin`, and `--fixture-wait`.
Child exits propagate; terminal Ctrl+C exits 130 on Windows and POSIX.

Run installed-package tests by setting `TANDEM_TEST_PACKAGE` to the installed
package directory before `node --test test/run.test.mjs`. Terminal qualification
is `python tools/qualify-selector.py NODE INSTALLED_PACKAGE`; Windows uses
pywinpty in a separate test-only environment, never a production dependency.
