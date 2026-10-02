# CT06: controlled A-to-B resume feasibility

The approved modern qualification container supports a **new turn in the same
session after controlled A-to-B activation**. A produced a trusted turn-start
projection and then failed with unresolved category OTHER. B resumed that exact
session, produced a different turn ID with B launch context, and completed.
This is not a production switching, complete attribution, or billing result.

The five scoped feasibility criteria are complete for the approved modern target
and the separately tested native Windows/Ubuntu launches. On both local platforms,
A started then failed OTHER; a fresh B process resumed the same session and
completed. Their native JSON events omit turn IDs: local evidence proves only
parent-process launch correlation, not hook propagation or attempt ownership.
The container provides the narrower actual hook-level session/turn evidence.
Original legacy compatibility, persisted-server reuse and full tracking remain
unqualified. This ticket does not itself close G0.

## Exact acceptance-criterion mapping

| #   | Criterion                                                                         | Evidence and boundary                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Approved identities/disposable state/controlled activation                        | PASS. Explicitly approved personal/personal-free copies and manual activation after A exit were used separately on container, Windows and Ubuntu. Originals remained unchanged. Container copies and all runtime state were removed; four local reusable cache files remain privately protected by explicit user approval. No work profile or production switching was used.                                        |
| 2   | Immutable launch context, earliest event, stale server context, unresolved fields | PASS for the bounded experiment: separate container mode-0400 context files and actual UserPromptSubmit session/turn projection. Missing environment yielded no event; injected stale A environment during B yielded A context and was rejected by expected-launch correlation. Persisted-server reuse remains NOT EXECUTED; every probe used a fresh `--no-daemon` process. No child/attempt boundary is invented. |
| 3   | A/B observations and honest failure boundaries                                    | PASS. Four actual container summaries and separate Windows/Ubuntu A/B summaries retain A failure, B completion and context boundaries. Real resume created a new turn, not a retry of the same upstream logical turn. Same-turn preservation is synthetic contract evidence only.                                                                                                                                   |
| 4   | Requirement/test mapping and limitations                                          | PASS. Mapping below distinguishes actual, synthetic and unexecuted cases. No complete T19–T23/T45 or other acceptance-family pass is claimed.                                                                                                                                                                                                                                                                       |
| 5   | Windows/WSL local validation and additional requirements                          | PASS. Implementation checks and actual authenticated native A/B resume probes completed separately on Windows and Ubuntu; local native JSON lacks turn IDs and hooks remain unqualified. Actual selected modern container observed; original legacy target and native Linux outside WSL remain NOT QUALIFIED.                                                                                                       |

## Actual container observations

`container-observations.json` contains only allowlisted lifecycle fields and fixed
summary values. These are actual hook projections, not reconstructed transcripts.

| Probe                                   | Native result                                                              | Hook observation                                                                                                                 |
| --------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| A                                       | Same session established; turn started then failed; exit 1; category OTHER | `ct06_A`, event `bdcd29e8-a7a4-4f02-b8d6-16437df1721b`                                                                           |
| B                                       | Exact A session resumed; new turn started/completed; exit 0                | `ct06_B`, event `3bce48b2-ae00-418d-a8b0-aeba3e99e6dc`                                                                           |
| Missing custom environment              | Same session; turn completed; exit 0                                       | Zero new events. Codex did not surface the bridge's fixed diagnostic on captured stderr. No silent tracking success is inferred. |
| Stale A environment during B activation | Same session; new turn completed; exit 0                                   | Event `9ebf37dd-a022-44fd-b8cf-ebd5144f2497` contains `ct06_A`; expected B correlation rejects it.                               |

The two negative probes intentionally reused the expected B experimental context
while omitting or substituting the environment. They do not establish unique
production launch journaling. They also do not simulate a real persisted server:
the stale-environment injection is a narrower observed failure mode. A live
background server retaining prior context remains unqualified and must not be
reused for a tracking claim.

Launch aliases A/B describe controlled input selection, not authenticated provider
identity or usage ownership proof. Original source binding distinction was verified
as a boolean in the approved setup; no account IDs or original auth hashes are
retained. Provider-confirmed ownership, quota termination, usage accounting,
cumulative deltas, logical-turn retries and child relationships remain unresolved.

## Contract and TDD

`assessResumeExperiment` is a bounded, read-only G0 metadata assessment seam. It
accepts an explicit launch inventory and observations with expected source-launch
correlation. It never consults a mutable active-profile pointer or changes state.
Missing/stale context, wrong target generation and unverified server context produce
unresolved results. Conflicting copies of an event stay unresolved in either
arrival order. Synthetic repeated logical turns keep their separate A/B records;
duplicate delivery is idempotent. The result always reports `fullTracking:false`.

The public seam uses the existing strict capture decoder, accepts at most 256
launches/observations and rejects duplicate launch IDs. It is not an attempt store,
collector receipt, production attribution API or account filter. Same-user context
tampering and provider ownership verification are outside this experiment.

TDD cycles at the approved metadata seam were observed: missing module failed the
A/B preservation case; stale input initially incorrectly established A and failed;
contradictory copies initially overwrote ownership and failed. Each then passed
after its minimal implementation. The actual container fixture test independently
checks same-session/different-turn and stale-context rejection. Installed-package
capture verification additionally loads this module and rejects stale correlation.

## Deployment, normal trust and cleanup

Container generation `b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf`,
name `codex-tandem-g0-linux`; uid 1000, HOME `/home/validation`, Python 3.12.15,
Codex 0.160.0, WSL kernel `6.6.87.2-microsoft-standard-WSL2`.
Neither `ide` nor `Ubuntu-24.04` was accessed. No container Node/npm was used.

The exact new root `/home/validation/ct06-qualification-20261002` was previewed
before staging and listed in an external Temp cleanup inventory before credentials.
The unchanged CT05 Python bridge, private spool, separate context-A/B.json files,
disposable CODEX_HOME, exact hook definitions and all native state lived there.
No raw state entered Git, including ignored paths.

The normal Codex UI accepted approved `/home/validation` folder trust. The exact
definitions below were reviewed individually and trusted with the normal `t`
control. Initial Enter on the detail screen did not establish trust; successful
actual capture provides execution evidence for UserPromptSubmit. No hook bypass,
approval bypass, trust-record edit or security weakening was used.

- SessionStart: `/bin/true`, timeout 2.
- UserPromptSubmit: `/usr/local/bin/python3 /home/validation/ct06-qualification-20261002/bridge.py --context "$TANDEM_CT06_CONTEXT" --spool /home/validation/ct06-qualification-20261002/spool`, timeout 2.

The container runner uses `/tmp/codex-tandem-validation-codex --no-daemon --sandbox
read-only exec --skip-git-repo-check --json` for A, and inserts `resume` plus the
explicit saved session ID for B/negative probes. Prompts were minimal synthetic
requests. Raw stdout/stderr stayed in process memory; native runtime state stayed
inside the disposable home until deletion. The mounted spool was not needed here.

`container-cleanup.json` confirms contexts and hooks unchanged, live Codex processes
exited, both credential originals unchanged, exact-root removal and private hash
checkpoint removal. Three exited zombie entries were observed; they could not run
or retain a server. No unrelated process or the container's `sleep` was signaled.
An initial cleanup guard counted zombies as live and stopped before deletion;
state-only inspection resolved this and cleanup then completed. No container copies remain.

The first terminal helper attempt had a `pty.py` name collision with the standard
library, corrected before interactive use. Local credential-free homes under Temp
triggered Codex's helper-alias refusal; both nevertheless reached native turn start
and failed authentication. Those warnings are not native executable qualification.

## Actual local A/B probes and retained caches

After explicit approval for both exact local destinations, independent Windows
Codex 0.159.0-alpha.12.1 and Ubuntu Codex 0.160.0 runs used the same approved A/B
inputs. Each platform has a separate native session and separate context files.
`windows-observations.json` and `ubuntu-observations.json` preserve two actual
native projections each: A exit 1/OTHER, B exit 0/completed, same session true.
Neither native `turn.started` record exposed a turn ID. The experiment deliberately
does not infer one from a session, timestamp or mutable profile pointer.

`tools/capture/local-authenticated-resume.mjs <installed-binary> <exact-root> A|B`
created each context once before its process, used an isolated file-auth-only
CODEX_HOME, removed API-key environment overrides, captured native JSON in memory
and checked the context was unchanged after exit. The command shape matches the
container's fresh `--no-daemon --sandbox read-only exec` / `exec resume` procedure.
It used no hooks, changed no folder trust, and did not test custom environment
inheritance into hooks. The effective local assurance is `PARENT_PROCESS_ONLY`.

The approved local roots are:

- Windows: `C:/Users/kanak/codex-tandem-ct06-qualification-20261002`.
- Ubuntu: `/home/vs-workspace/codex-tandem-ct06-qualification-20261002`.

Only `validation-auth/personal.json` and `validation-auth/personal-free.json`
remain under each root, as explicitly requested reusable validation copies outside
Git. All disposable CODEX_HOME state, contexts, session IDs, result files and
original-hash checkpoints were removed after sanitized export and original/cache
unchanged comparisons. The Windows cache has a user-only ACL with independently
protected root and cache directory; Ubuntu directories are 0700 and files 0600.
`windows-cleanup.json` and `ubuntu-cleanup.json` record these results and paths.

The Windows ACL check exposed a material limitation: the root was initially
verified user-only, but native Codex added an explicit read/execute ACE during the
probe; the cache inherited it. After the native process exited, the additional ACE
was removed, cache inheritance was independently protected, and all four Windows
root/cache/file ACLs were verified user-only. Future probes must preserve this
independent cache protection and recheck it. This is not a continuous credential
ACL or SEC-001 qualification. No credential access by another process was observed
or asserted. A `Set-Acl` repair attempt failed for missing SeSecurityPrivilege;
ordinary owner-authorized `icacls` DACL changes then succeeded without changing
privileges or weakening platform security. Earlier staging retries corrected numeric
SID syntax and used the native .NET ACL reader when a PowerShell module failed;
no credentials had been copied before those staging checks succeeded.

## Local implementation checks

Both platforms ran sequentially against integration base
`e4d7942c264c091effe45604bf10217ef5a42eef` plus the implementation in the commit containing this evidence.
`manifest.json` pins source hashes and each platform's packed checksum. The
containing implementation commit supplies the exact Git revision.

| Platform                              | Results                                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Windows 11 `10.0.26300`, Node 24.15.0 | Format/lint/typecheck/build PASS; 28 tests passed, 3 platform skips; all three installed-package checks PASS; accounting fixture integrity 18 cases PASS.                    |
| Ubuntu WSL, Node 24.18.0              | Format/lint/typecheck/build PASS; 29 tests passed, 2 skips; all three installed-package checks PASS; accounting fixture integrity 18 cases PASS; Python bridge 5 cases PASS. |

Commands: `npm ci --ignore-scripts` (Ubuntu additionally `--engine-strict`),
`npm run validate`, `npm run verify:installed`,
`node tools/verify-accounting-fixtures.mjs`, and on Ubuntu
`python3 test/capture_bridge_test.py`. An initial `python3 -m unittest
test/capture_bridge_test.py` invocation failed module discovery; the documented
direct script entry point then passed. No test failure was hidden as a pass.

## Requirements and acceptance-family limits

| Requirements / family | Observed slice and remaining limit                                                                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ATT-003; T19/T45      | Actual pre-completion UserPromptSubmit persists for A/B; CT05 crash evidence remains separate. No CT06 crash, essential journal failure or quota test.                                                                                                                     |
| ATT-004; T20          | Immutable per-launch A/B files and inherited env observed; missing/stale injections expose failure. Environment alone is not sufficient proof; real persisted-server context and alternative correlation remain unqualified.                                               |
| ATT-006; T23          | Synthetic same-logical-turn A/B history preserved. Actual B resumed a new logical turn; native same-turn retry, account changes mid-launch and cumulative cross-boundary usage NOT EXECUTED.                                                                               |
| PROC-006; T11/T20     | Fresh no-daemon processes only. No persisted server reused or stopped; stale server consent, PID reuse and safe stop procedures NOT EXECUTED.                                                                                                                              |
| ATT-002; T21/T32      | Actual session has A/B controlled launch starts. No provider ownership, usage-limit termination, quota/account totals, dashboard or accounting parity claim.                                                                                                               |
| SCP-003; T02/T14/T45  | Separate local implementation, credential-free boundaries and authenticated native A/B probes; selected modern container actual lifecycle. Local hooks/turn IDs, original legacy/native Linux/runtime matrix not qualified. Version output alone is never a support claim. |
| T22/T24               | Synthetic delayed A, duplicate and conflicting-event handling only. Native nested child relations, durable receipts, crash replay and full attribution NOT EXECUTED.                                                                                                       |

Complete acceptance families remain PARTIAL/NOT EXECUTED. G0 review must evaluate
these capability gaps and all remaining gate evidence separately.
