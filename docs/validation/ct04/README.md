# CT-04 validation (#11)

Application: the #11 correction commit containing this report, following
`7213a3b`, with integration `bb7c0c3` merged in `6f8250d`, on
`agent/g0-ct04`. Synthetic fixture provenance is the versioned
`tools/qualify-selector.py` and `test/run.test.mjs`; no credentials or real
account information are used. Target: local harmless bundled child only.

## Correction of earlier evidence

The evidence committed in `7213a3b` was insufficient to support its terminal
lifecycle PASS claims. Its harness accepted a restored raw-mode marker even
when the wrapper remained alive: Ubuntu cases recorded `-999` after forced
termination and Windows cases could record null exit status. Those results did
not prove normal cancellation, error exit or child handoff. The previous timing
summary is superseded together with those lifecycle claims.

The correction stops selector-owned stdin reads on every finish, including
handoff. The strengthened harness requires natural process termination with the
expected code; any timeout or forced cleanup fails. It also tests typed input
through the actual terminal and reconstructs the visible terminal screen before
confirming a long, common-prefix stable ID. The original implementation was
observed failing both strengthened regression checks before the fixes.

## Corrected recorded results

- Native Windows Node 24.15.0: combined automated suite 19 pass, 3 platform-specific
  cases skipped; installed-package tests and typecheck pass.
- WSL2 distribution `Ubuntu`, Node 24.18.0: combined automated suite 20 pass, 2 cases skipped, including
  POSIX SIGTERM forwarding; installed-package tests and typecheck pass. The skips
  are the Windows-only shim test and an unavailable existing `/proc/sys` bind
  mount for the separate discovery test; CT-04 terminal cases are not skipped.
- Each actual terminal suite contains 34 cases, all requiring natural expected
  exits: zero profiles (2); selection/handoff (0); Escape and Ctrl+C (130);
  injected rendering exception (2); child terminal Ctrl+C (130); and direct plus
  three wrapped interactive input cases (7). No forced termination is accepted.
- Terminal cases cover zero/one/two/many, Unicode, duplicate labels, stable IDs,
  navigation, resize, long labels, and 79/80-character IDs sharing a long prefix.
  The complete selected ID is asserted in a reconstructed 40-column screen
  **before** Enter; the captured screen is retained in the JSON evidence.
- Typed Unicode, quotes and shell metacharacters reach the child exactly. Both
  direct and wrapped child runs independently match the same literal input and
  exit 7 naturally. The wrapper must stop reading stdin for this handoff.
- Windows ConPTY (test-only pywinpty 3.0.5) checks Node raw mode after return;
  Ubuntu POSIX PTY additionally compares all termios attributes before/after.
  Escaped transcripts retain cursor and alternate-screen restoration sequences.
  pyte 0.8.2 is a test-only screen parser; neither tool is a runtime dependency.

Corrected first-frame p95 is 69.76 ms on Windows and 97.12 ms on Ubuntu, also
reported in each terminal JSON's `p95FirstFrameMs`. The samples
are valid only because every run also exits naturally. Twenty fresh Node process
samples run after fourteen functional scenarios, with no additional warmup loop
or cold-cache reset. `performance.now()` at first selector output includes Node
startup, observer import, all package imports, fixture validation and rendering.
The separate `harnessWallMs` includes ConPTY construction (~3 seconds). These are
warm synthetic local observations, not full SRS T18 cold/history/container/
collector qualification. All Tandem selector work precedes the measured frame;
there is no network, credential refresh, history scan or reporting database work.

## Packages and reproduction

The Windows-packed artifact used by the installed selector/child tests on both
platforms has SHA-256
`4bad107f05e20597ed5b9c1dd3caccd54feb6403226e83a0f6daa77a785eb3e8`.
The separate Ubuntu package diagnostic smoke test packs locally; its artifact
checksum is retained in `wsl-package.json`. Both package reports verify packed
contents and their installed launcher. The terminal reports use the same
Windows-packed artifact above, rather than an unpackaged source invocation.

Commands, run from the worktree:

```
npm run build
npm pack --cache .npm-cache --pack-destination .scratch
npm install --cache .npm-cache --prefix .scratch/installed --ignore-scripts --no-audit --no-fund ./.scratch/codex-tandem-0.1.0.tgz
# Set TANDEM_TEST_PACKAGE to the resolved installed package directory.
node --test test/*.test.mjs
npm run typecheck
npm run --silent verify:package
python tools/qualify-selector.py NODE .scratch/installed/node_modules/codex-tandem --test-deps .scratch/pty
```

Windows uses the bundled Python 3.12 runtime and the native Node executable.
Run native platform qualification in the actual Windows user context: sandbox
user-home discovery is denied and is not the approved host validation target;
Ubuntu uses Python 3.12.3 and nvm Node 24.18.0. The `.scratch/pty` directory contains
isolated test-only pywinpty and pyte installations. Ubuntu uses pyte's Python
implementation from that directory and does not load pywinpty. Ubuntu commands
run through `wsl -d Ubuntu -- bash -lc` with `source ~/.nvm/nvm.sh` first.

`TANDEM_CASE_ONLY=CASE_NAME` permits a focused rerun. Child-signal JSON files
are extracts of the corresponding full terminal run. The failure injection is
one temporary stderr-write exception delivered through a Node preload, solely
to exercise cleanup through the actual installed CLI.

Neither `Ubuntu-24.04` nor `ide` is used. No native Linux or Docker qualification
claim is made by this local behavior slice. Production activation, profile CRUD,
actual Codex resume and complete T06/T17/T18 families remain NOT EXECUTED here.
The G0 synthetic selector is not production credential switching.
