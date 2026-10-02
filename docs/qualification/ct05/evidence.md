# CT05: bounded metadata bridge qualification

The five ticket-specific criteria are satisfied for the **user-approved modern
qualification target**, `codex-tandem-g0-linux`, on the existing Ubuntu WSL host.
This is a G0 feasibility experiment, not production capture or full tracking.
The original legacy-container qualification remains **NOT QUALIFIED**; neither
`ide` nor `Ubuntu-24.04` was accessed. The approved requirements baseline is unchanged.

## Ticket-specific acceptance evidence

| Criterion | Result and evidence |
| --- | --- |
| Preview/reversible deployment; preserve existing hooks and trust | PASS. Exact new paths and commands were previewed; the user explicitly approved temporary profile copies and normal folder/exact-hook trust. The existing synthetic SessionStart definition remained unchanged and was shown trusted/active. A timeout-only edit to the capture hook was skipped until its exact original definition was restored. Original user config/trust was never edited. Both disposable roots, credentials, trust records and raw state were removed after hash checks. |
| Mounted and no-mount capture with collector absent; reject malformed/oversized input without raw persistence | PASS. Five bridge contract cases passed separately on the container private filesystem and the `/capture` bind mount. Private-spool actual Codex turn-start events also persisted with no collector. Malformed, oversized, unsupported and content-shaped input produced only a fixed failure diagnostic, no file. Live Codex mounted-spool execution was NOT EXECUTED; mounted evidence is direct synthetic bridge invocation. |
| No container Node/npm; neutral output; recoverable atomic publication; explicit unsupported facilities | PASS for this experiment. The bridge invokes only the existing Python standard library; Node/npm were absent from target PATH and never invoked/installed. Successful calls emit no output; failures emit no stdout and a fixed redacted stderr diagnostic with exit 1. Native Codex continued to `turn.started` after capture. OS-boundary crashes retain sanitized temporary or committed files; readers ignore temporary files. Missing-bridge discovery remains explicitly unavailable, never full tracking. |
| Record requirement/test results and limitations | PASS. The mapping below and `manifest.json` separate observed subcases, unexecuted cases, provider failure and original legacy limitations. Four actual projected records are versioned with run provenance. No full multi-platform acceptance family is marked passed. |
| Applicable local Windows and WSL implementation checks; identify additional platform/target needs | PASS. Final Windows suite: 24 pass, 3 platform skips. Final Ubuntu suite: 25 pass, 2 skips. Both typecheck/build and packed capture-contract checks pass. Ubuntu bridge tests: 5/5. Actual selected Linux container: private 5/5, mounted 5/5 plus real Codex private-spool events. Native Linux outside WSL and original legacy qualification remain unexecuted. |

The unchanged SessionStart hook has configuration-preservation and trusted-active UI
evidence. Its `/bin/true` command deliberately produces no execution marker; no
separate side-effect proof of that command is claimed.

## Contract and limits

`tools/capture/bridge.py` accepts only `UserPromptSubmit`. It reads at most
65,537 bytes and rejects input over 65,536 bytes. It projects UUID-shaped session
and turn IDs plus fixed synthetic experiment launch/target context. Context reads
are bounded to 4,097 characters, rejecting over 4,096. Prompt/message/tool fields,
transcript paths, account data and arbitrary nested values are discarded.

The private context and spool must belong to the effective user and deny group/other
access. Final-component symlinks are refused. Each mode-0600 file is uniquely
created, fsynced, atomically renamed in the same directory, then the directory is
fsynced. Unknown/raw input is never a temporary-file payload. Successful output is
empty; failure is exit 1 with empty stdout and only `CAPTURE_DEGRADED` on stderr.
The qualified hook timeout is two seconds. No collector, network, database,
subprocess, or Node/npm invocation occurs inside the bridge.

`src/capture.ts` validates the versioned experiment envelope, rejects records over
4,096 bytes and invalid calendar dates, and reads only committed UUID-named files
matching their event IDs. Inbox snapshots are bounded to 256 directory entries,
ignore unfinished files and preserve IDs across repeat reads. They do not delete
or acknowledge files. Durable database receipts, replay effects, transport and
account attribution are deferred to their production tickets. Same-user compromise
and Docker-daemon control are outside this confidentiality boundary.

The synthetic `launch_ct05` context identifies this experiment, not an evidenced
account binding or a qualified per-launch propagation mechanism. No identity
ownership, child linkage or background-server isolation claim follows from it.

## Actual lifecycle evidence

Target generation: `b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf`.
User `validation` uid 1000, HOME/workdir `/home/validation`, Python 3.12.15,
Codex 0.160.0, kernel `6.6.87.2-microsoft-standard-WSL2`.
The original Windows Codex 0.159.0-alpha.12.1 is not qualified by these live runs.

| Versioned event file | Actual source/run role | Observed outcome |
| --- | --- | --- |
| `67086d6a-aad3-4dd3-a7a2-5762bf1732e0.json` | Interactive run after normal folder and individual exact-hook trust | One private-spool turn-start event; no completion claim. |
| `9b8100b9-b607-4c8a-8e1f-706179504d8c.json` | Trusted noninteractive baseline | One event, native `turn.started`, then `turn.failed`, exit 1. |
| `14621415-988a-492b-ba78-c8caabd6588d.json` | Controlled crash after committed start | One event; native `turn.started`; fresh process group killed with SIGKILL; exit -9; no native completed/failed event. File survived. |
| `cd0bb74f-be4a-4634-bb22-2a523b117aea.json` | Exact original definition restored after negative trust test | Capture resumed; one event, native `turn.started`, then `turn.failed`, exit 1. |

The timeout-only changed-hook run produced zero new capture events. Its command
was not changed or trusted; restoring the exact original bytes restored capture.
The two ordinary noninteractive failures remain fixed category **OTHER** and
unresolved. No successful model response, provider billing or failure cause is
claimed. Successful model completion is not a prerequisite to this capture-only
experiment. CT06 must preserve this boundary when testing A/B attribution.

Only eight allowlisted fields were exported. Export rejected unknown fields,
non-UUID IDs, unexpected context or invalid timestamp syntax before writing. Files
under `actual-events/` are actual hook projections, not simulated native events.
Raw prompts, transcripts, auth values, account IDs and original auth hashes are
absent from repository evidence.

## Deployment, trust and cleanup

The credential-free fixture staging script checks the exact target generation and
creates only `/home/validation/ct05-qualification-20261002` and
`/capture/ct05-20261002`. Temporary personal credentials were separately copied
into the private disposable CODEX_HOME as mode 0600 after explicit user approval.
Personal-free was hashed for unchanged verification but not copied; work was not
accessed. No credential or original hash was printed.

The normal Codex UI first accepted the explicitly approved `/home/validation`
folder trust, then reviewed/trusted these two exact definitions individually:

- SessionStart: `/bin/true`, timeout 2 (pre-existing synthetic fixture).
- UserPromptSubmit: `/usr/local/bin/python3 /home/validation/ct05-qualification-20261002/bridge.py --context /home/validation/ct05-qualification-20261002/context.json --spool /home/validation/ct05-qualification-20261002/spool`, timeout 2.

The hook browser showed active 1/review 0 for each. No hook-trust, approval or
sandbox bypass was used. Native runs used `--no-daemon`, `exec`,
`--skip-git-repo-check`, `--sandbox read-only`, and `--json`. Only synthetic minimal
prompts were used. `tools/capture/live-experiment.py` preserves the tested normal,
crash, changed-definition and restored-definition procedure with metadata-only
output. It requires the separately authorized staged home and normal hook trust.

After export, the exact original hooks checksum, SessionStart definition and bridge
checksum were verified. Both disposable roots were removed, including copied auth,
trust records, native logs/databases/sessions, private PTY log and all helpers/spools.
Docker process inventory showed only `sleep`. Final booleans were:
`authTrustRawAndHelpersRemoved=true`, `mountedExperimentRemoved=true`,
`personalUnchanged=true`, `personalFreeUnchanged=true`. The private original-hash
checkpoint was removed after verification. No helper deployment remains.

## Verification provenance and boundaries

Base integration is `38a300f3fda42b8b2d524b4b7abcd6807339d431`. The implementation
commit containing this evidence supplies the exact Git source revision; manifest
hashes identify canonical source bytes, actual artifacts and platform-specific packs.
The recorded deployed bridge hash identifies its qualified Windows-CRLF bytes;
only line endings/trailing blank lines were normalized afterward for Git. No bridge
behavior changed. Commands and runtime versions are in `manifest.json`. Builds/tests ran sequentially
because Windows and Ubuntu share generated `dist/` in this worktree.

TDD retained observable red/green results at the agreed capture-contract seams:
missing host module → projection; rejected host input → bounded validation; missing
reader → committed-only snapshot; missing bridge → atomic projection; invalid
payload → rejection; non-private state → permissions checks; invalid calendar day →
strict date validation. Additional filesystem fault injection and actual-target
qualification then passed. The OS crash test injects SIGKILL immediately after file
fsync or directory fsync; it is not power-loss or database recovery evidence.

Earlier failures were preserved, not promoted to passes: the first Ubuntu combined
run raced a Windows build and used a stale CLI (four failures), then passed after a
sequential rebuild. The final restricted Windows agent-sandbox run passed capture
checks but failed five pre-existing discovery cases with `PATH_OR_USER_INACCESSIBLE`;
the approved native-host run passed all applicable tests without changing OS
security settings. Initial credential-free Codex failed at authentication. Review
initially denied credential copying and later normal trust until the user supplied
explicit approvals; one credential-free review timed out and was retried once.
Printing raw/redacted PTY text was denied; subsequent results used only fixed
metadata booleans. All raw experimental state was ultimately deleted.

[Official hook documentation](https://learn.chatgpt.com/docs/hooks), fetched
2026-10-02, provides the documented turn ID, exact-definition trust and empty-success
contract. Installed Codex 0.160.0 observations above establish only the tested slice.

| Requirement / test family | Qualified slice and remaining boundary |
| --- | --- |
| ENV-004; T14 | Existing Python projection/durability, absent collector, permissions, malformed input, normal and changed-definition trust. Missing bridge has discovery fixture coverage; legacy facilities unqualified. |
| DCK-005; T03 | Python-only bridge, reversible scoped deployment, no container Node/npm. Full runtime/compression/platform family not qualified here. |
| DCK-006; T24/T28 | Private and mounted per-file persistence; repeat snapshots preserve IDs; native pre-completion event survives process death. Durable receipt/acknowledgment and replay/accounting effects NOT EXECUTED here. |
| CAP-001; T38 | Minimal UserPromptSubmit hook and preserved existing SessionStart fixture/trust. Full production install/update/remove and child/stop event set NOT EXECUTED. |
| CAP-003; T37 | Bounded allowlist projection, no raw persisted input, actual metadata export and cleanup. Full privacy/export/backup/policy family NOT EXECUTED. |
| CAP-004; T19/T28 | Private temp/file fsync/rename/directory fsync, interrupted publication ignored, actual native crash-after-start retention. Essential launch-journal failure, disk-full, database recovery and accounting ownership NOT EXECUTED. |
| CAP-006; T38/T45 | Empty success output, fixed non-instruction failure, native turn proceeds past trusted capture. Completion/other lifecycle events, server reuse, other Codex versions and full tracking NOT QUALIFIED. |

All listed acceptance families remain PARTIAL/NOT EXECUTED beyond these subcases;
none is a complete SRS acceptance pass. Native Linux outside this WSL-hosted target,
legacy-container compatibility and successful model completion remain unqualified.
