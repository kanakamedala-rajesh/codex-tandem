# CT07 initial platform qualification

Issue [#14](https://gitlab.com/venkata-sudha/codex-tandem/-/issues/14), observed 2026-10-02 and 2026-10-03, base `ff3b267eed77938039fb8d1527532eac533b1c27` plus the CT07 experiment recorded by the commit containing this evidence. This is partial evidence, not a completed gate or support declaration.

The owner initially selected the modern disposable `codex-tandem-g0-linux` target, then explicitly approved the separate `codex-tandem-g0-sandbox-v2` policy resolution. This decision does not change the approved SRS or qualify the original legacy work container/build. Only Ubuntu WSL was used; neither `ide` nor Ubuntu-24.04 was used.

## Selector repair and current qualification

The later repair is recorded separately in `selector-fix.json`; the original observations below and their artifact hashes are retained. Post-failure output draining proved that the Windows child received an empty line before the harness sent its intended input. Restoring cooked terminal mode inside the keypress callback could forward the confirmation Enter to the child. Cleanup and promise resolution now run on `setImmediate`, after the current console read, without adding a delay or discarding child input.

The scratch candidate passed the 14 behavioral cases twice. The repaired packed artifact then passed all 34 real terminal cases on both Windows and Ubuntu, including exact interactive input, natural exits and restoration. Windows p95 first frame was 62.00ms; Ubuntu was 113.94ms. Source validation and installed-package checks passed on both hosts; Windows SAC remained 1 at the post-repair check. The existing terminal harness is the regression test that rejected the original empty-line behavior. No diagnostic preload or instrumented child was used for the final runs.

On October 3 the owner approved the separate disposable-container policy resolution. The new generation passed credential-free filesystem/network guards and the actual Codex representative build. See `namespace-resolution.json` and `environment-decision.md`. The historical namespace failures below remain valid observations of the older generation. Final independent Standards and Spec reviews and the targeted policy review are complete with zero findings (`review.md`). The containing commit associates this record with the implementation.

## Exact acceptance mapping

| Criterion                                                      | Evidence available                                                                                                                                                                                   | Remaining scope limit                                                                                              |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1. Native Windows, SAC enforcing, source/packed/shim/direct/G0 | PASS for available G0 checks; SAC value 1; repaired packed artifact passes all 34 terminal cases (`selector-fix.json`).                                                                              | Historical Windows failure retained. Dashboard and full T44 remain NOT EXECUTED.                                   |
| 2. Ubuntu package/runtime and selected actual-container build  | PASS for applicable host checks and all 34 PTY cases. October 3 Codex build passes on the approved new target, matching the direct artifact and effective environment (`namespace-resolution.json`). | Noninteractive modern disposable target only; original legacy target and Docker interactive behavior NOT EXECUTED. |
| 3. Initial native Linux evidence                               | Completed GitLab Linux matrix jobs with exact prior source/Node versions (`native-linux.json`).                                                                                                      | Prior-source CI only; new adapter delta not yet run remotely; native interactive Codex NOT EXECUTED.               |
| 4. Reproducible evidence and limitations                       | Commands, fixture/source/runtime/package/policy hashes and sanitized projections recorded. Offline policy generator verified on both hosts.                                                          | Full T03/T05/T13/T17/T44 and requirement families remain PARTIAL or NOT EXECUTED.                                  |
| 5. Native Windows and Ubuntu implementation validations        | Windows 30 tests pass/3 platform skips; Ubuntu 31 pass/2 skips. Installed/accounting checks pass separately; Ubuntu Python discovery 6 passes.                                                       | Windows POSIX bridge tests explicitly skipped. Independent reviews complete; new CI delta remains pending.         |

## Experiment contract and actual build

`src/g0-container.ts` exports an explicitly experimental, Linux-host-only planner/runner. It validates immutable container generation, nonroot UID, HOME, descendant CODEX_HOME/project and executable paths. It invokes Docker with an argument array and `-i`, without unconditional `-t`, strips API-key/provider overrides and forces file credential storage. It requests native Codex `--no-daemon --sandbox workspace-write exec --skip-git-repo-check --json`. This is a bounded qualification seam, not a production activation flow, account switch or interactive Docker adapter. It does not qualify container resize, paste, Unicode or cancellation (NOT EXECUTED).

The Python stdlib fixture compiles a calculator and writes deterministic JSON. Before the native turn, the direct baseline checked the expected result `{count:4,sum:17,sumSquares:87}`, source hashes and effective uid/HOME/CODEX_HOME/cwd, then removed build outputs. The native verifier required source preservation, actual command exit zero, matching artifact bytes, compiled output, and matching effective environment. Model completion alone cannot pass.

Historical direct command, through the older generation recorded in `container.json`:

```text
docker exec --user 1000 --workdir /home/validation/ct07-qualification-20261002/project --env HOME=/home/validation --env CODEX_HOME=/home/validation/ct07-qualification-20261002/codex-home GENERATION /usr/local/bin/python3 build.py
```

Historical packed-module invocation for the earlier failed target:

```text
node tools/qualification/run-container-build.mjs /tmp/codex-tandem-ct07-installed/node_modules/codex-tandem/dist/g0-container.js
```

Initial native attempt used the previously staged single Codex binary. The turn completed but tool spawning failed with missing-file errors; no command item or artifact passed. A same-release private runtime repair added the required native code-mode host, bubblewrap and ripgrep assets from the installed Ubuntu 0.160.0 release, with hashes in `cleanup.json`. No Node/npm, OS packages, privileges or security policy were added to the container. Earlier CT06 model-only resume evidence remains scoped to that lifecycle; it did not qualify a complete tool runtime.

The repaired runtime attempted the build, but bubblewrap reported no permission to create a new namespace. Native turn completion and exit zero still yielded verifier exit1: command failure, no artifact and no compiled output. Sources remained unchanged. This was the historical namespace blocker, not an authentication failure; it is resolved only for the new explicitly approved generation.

A credential-free compatibility probe found Landlock ABI3 and seccomp mode2. Restricted workspace-write with `features.use_legacy_landlock=true` exited101 before its filesystem/network guard ran. The [pinned 0.160.0 source](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/linux-sandbox/src/linux_run_main.rs) rejects this policy in `ensure_legacy_landlock_mode_supports_policy`: filesystem-restricted execution requires bubblewrap to isolate app-server sockets. Therefore that option is not an equivalent restricted fallback. No model replay used it and the Tandem adapter does not set it. No security relaxation was attempted during that historical failed fallback. The subsequent owner-approved, container-scoped seccomp change is documented in `environment-decision.md`.

## Successful October 3 invocation

The successful v2 run used the already-tested packed artifact, package SHA-256
`34c5e20f8021056d9c295ddfd92481c93247523dac02b659bb7d9538702846f8`, installed in
this worktree's `.scratch/fixed-installed/node_modules/codex-tandem`. Its
`dist/g0-container.js` SHA-256 is
`08c8185fcd6f705e024273e956ef4829cf5bd31a671930f62ecef3a7b233b9fa`.

From the CT07 worktree in Ubuntu, the successful runner invocation was equivalent
to the retained helper now bound to the same v2 generation:

```text
/home/vs-workspace/.nvm/versions/node/v24.18.0/bin/node tools/qualification/run-container-build.mjs .scratch/fixed-installed/node_modules/codex-tandem/dist/g0-container.js
```

The actual run used the root repository's `.scratch/g0-validation-target/v2-run-container-build.mjs`
copy. The helper's immutable generation is the successful target in
`namespace-resolution.json`; the older `container.json` describes historical
failures only. Native command success, output/environment comparisons and cleanup
are recorded in the new manifest.

## Platform commands

On each host, sequentially in this worktree:

```text
npm ci --ignore-scripts --engine-strict
npm run validate
npm run verify:installed
node tools/verify-accounting-fixtures.mjs
```

Windows Node24.15.0; Ubuntu Node24.18.0. `validate` includes formatting, lint, typecheck, build and node tests. Installed checks exercise package shim/direct paths, discovery and capture contracts. SAC `HKLM:\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState` remained1. No policy changes.

Python discovery ran on both hosts: `python3 -B -m unittest discover -s test -p '*_test.py'` (bundled native Python executable on Windows). Initially Windows exposed the five bridge tests' POSIX assumptions: the bridge explicitly requires a private POSIX spool, O_NOFOLLOW, geteuid, directory-relative operations and SIGKILL fault injection. An explicit POSIX applicability skip now reports Windows1 pass/5 skips; Ubuntu6 pass after the correction. This does not add Windows hook-bridge support. Linux CI now includes the same discovery command; that new CI line has not yet run remotely.

Real PTY command used `python3 -B tools/qualify-selector.py NODE INSTALLED_PACKAGE --test-deps DEPS`; NODE was the absolute nvm24.18 binary and INSTALLED_PACKAGE `/tmp/codex-tandem-ct07-installed/node_modules/codex-tandem`. All34 cases passed naturally with terminal restoration; p95 first frame41.37ms. These are host synthetic selector/child cases, not native Codex or Docker terminal passes.

Windows used the same harness with bundled native Python, Node `C:/Program Files/nodejs/node.exe`, installed package `C:/Users/kanak/AppData/Local/Temp/codex-tandem-ct07-artifacts/windows-installed/node_modules/codex-tandem`, and test-only pyte/pywinpty dependencies from the prior CT04 qualification. Repeated full runs failed with `EOFError: Pty is closed` during wrapped input. A focused wrapped-input-0 passed; a default-sandbox dependency import denial was separately resolved by normal tool approval. This historical full-sequence failure was repaired and all 34 cases subsequently passed, as recorded in selector-fix.json.

The tested tarball SHA256 is `e090d8617f9fa1b8df7f8241cfe530edb0868273170e30e2f168b3c7a081b105`. Source and runtime hashes are distinct from credential hashes, which were never exported.

## Security and cleanup

Only the approved personal-free reusable cache was copied for this experiment; work identity was not used. API overrides were excluded and file-only credential storage forced. The exact disposable container root, native sessions, copied credential, runtime, build/guard helpers and private host hash checkpoint were removed after export. Original and reusable cache were unchanged (boolean comparisons); cache directory0700/file0600. `cleanup.json` contains only fixed nonsecret projections. No raw native transcript, account identifier or credential hash was exported.

The separately authorized CT06 reusable caches remain outside Git. External cleanup inventory: `C:/Users/kanak/AppData/Local/Temp/codex-tandem-ct07-cleanup.json`. External synthetic package/check logs remain in the sibling `codex-tandem-ct07-artifacts` directory for investigation. This cleanup does not claim all retained credentials were deleted.

SEC006/PKG003 have the bounded local checks above; DCK002 representative command/build passes on the new scoped disposable generation; DCK003 container terminal behavior is unimplemented/unqualified here; ENV001 legacy target remains unqualified. T44 dashboard behavior is unavailable at G0 and NOT EXECUTED. No PASS substitutes for any of these gaps.
