# G0 review repairs (#3, #13)

Recorded 2026-10-03 UTC against application base
`0299de5c52911c0c50c796ae1a40fbf03ca9447c`, plus the repair sources in this
commit. This is separate repair evidence; historical CT06 observations and
their qualification limits remain unchanged.

The local authenticated-resume harness now removes `OPENAI_API_KEY`,
`CODEX_API_KEY` and `OPENAI_BASE_URL` from the child environment and supplies
`-c cli_auth_credentials_store="file"` before `exec`, for both A and B.
The regression runs the actual harness in a temporary synthetic home. A test
preload redirects the home lookup and substitutes only the external process
boundary with a harmless Node child. That child checks the actual inherited
environment and command arguments. No Codex executable, real credential,
model request or container is used. Before the repair, the test failed because
the child inherited the synthetic `OPENAI_BASE_URL`; after repair A and B pass.
This proves harness isolation behavior, not a new authenticated native run.

The three installed-package verifiers share temporary packing, private npm
cache, offline installation, package checksum and cleanup through
`scripts/temp-package.mjs`. Each invocation retains its own temporary install.
Global package-file, dependency/install-hook, direct entry, generated shim and
missing-builtins assertions remain in `verify-package.mjs`; discovery and
capture assertions remain in their own verifiers. Cleanup covers callback,
pack and installation failures through `finally`.

## Reproduction and results

Windows ran first, followed by WSL2 Ubuntu in the same worktree. Dependencies
were reinstalled when switching OS. Ubuntu-24.04 and the legacy/ide container
were not accessed. The host commands were:

```text
npm ci --ignore-scripts --no-audit --cache .npm-cache
npm run validate
npm run verify:installed
```

Ubuntu used the existing `/home/vs-workspace/.nvm/versions/node/v24.18.0/bin`
on PATH and added `--engine-strict` to `npm ci`. `validate` includes formatting,
lint, typecheck, build and the full Node test suite. `verify:installed` runs
all three package verifiers sequentially.

| Environment                                              | Runtime                   | Validation                           | Installed package checks          |
| -------------------------------------------------------- | ------------------------- | ------------------------------------ | --------------------------------- |
| Windows NT 10.0.26300.0, x64                             | Node 24.15.0, npm 11.12.1 | PASS: 31 passed, 3 skipped, 0 failed | PASS: package, discovery, capture |
| WSL2 Ubuntu, Linux 6.6.87.2-microsoft-standard-WSL2, x64 | Node 24.18.0, npm 11.16.0 | PASS: 32 passed, 2 skipped, 0 failed | PASS: package, discovery, capture |

Windows skips the Linux mount, Python isolation and POSIX signal cases.
Ubuntu skips the Windows shim test and the mount-boundary fixture because the
required existing `/proc/sys` bind mount was unavailable. No skipped case is
claimed as passing.

All three verifiers on each host reported the same package SHA-256:

- Windows: `34c5e20f8021056d9c295ddfd92481c93247523dac02b659bb7d9538702846f8`.
- Ubuntu: `e8e711c4fad933dae8b84d59a19e87e99066672b35b77a2f41cf30e876c47c50`.

These are separate host-produced tarballs; byte equivalence across hosts is
not asserted. The repair tools and tests are outside the published file list.

## Execution limitations and history

The initial Windows dependency install used the default npm cache and hit a
sandbox EPERM; using the worktree-local cache succeeded. Initial sandboxed
Windows tests had five discovery failures reporting `PATH_OR_USER_INACCESSIBLE`.
The full validation and installed-package checks passed when rerun with OS
identity access. The sandbox also denied WSL service access, so Ubuntu ran
with the required access. Ubuntu's default login PATH did not expose Node;
the recorded existing runtime was selected explicitly. That PATH setup emitted
warnings for space-containing inherited Windows PATH entries, but the selected
Node/npm versions, dependency install and every listed validation command
completed successfully.

Actual authenticated local A/B replay, PTY qualification, native Linux and
container qualification were NOT EXECUTED for this repair. Existing CT06
observations are not relabeled or superseded, and no full-tracking or completed
G0 qualification claim follows from these fixture/package checks.
