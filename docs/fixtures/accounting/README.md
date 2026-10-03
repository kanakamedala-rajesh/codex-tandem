# Accounting behavior and fixture inventory — CT-01 / #8

This is preparation for the accounting replay seam agreed in
[planning decisions](../../agents/planning-decisions.md). It does not implement
the collector or claim a product acceptance pass. MIG-001 and PKG-004 govern
selective reuse and preservation of notices. The approved requirements remain
unchanged. Application implementation follows in the owning G1/G2/G3 tickets.

## Source authority and reuse boundary

Use the [profile-switching reference](../../agents/profile-switching-reference.md)
as the implementation input. It records the owner's permission and the supplied
archive SHA-256 `b56c969b76c1105445c112f545fa5be61041641a16c2b9ccc2e2f1c504278cf8`.
The SRS P01 hash is `fd675029900bfad68382a513b17b415ced49ba51b6a1f388ffa06e5d931be67d`;
the archives are not claimed equivalent. No Go source, binary, archive, build
step, compiler or embedded Git metadata is imported here. No Go execution is
needed. The archive has no recorded license; ownership authorization is not an
MIT claim.

Accounting inspection is pinned to codex-report commit
[`516a1d6306559d8a607de84c4d76529160349ac8`](https://github.com/kanakamedala-rajesh/codex-report/tree/516a1d6306559d8a607de84c4d76529160349ac8),
never the moving branch. [provenance.json](provenance.json) lists inspected files,
immutable URLs and SHA-256 hashes. Preserve the complete
[MIT notice](../../../third_party/codex-report-MIT.txt) in any package containing
reused substantial behavior/source. No donor runtime code or dependencies are
vendored. The pinned tests were read, **not executed**. Golden numbers below are
worked synthetic examples, not donor execution captures.

## Behavior-to-requirement handoff

| Behavior / source | Preserve or replace | Requirements and future verification |
| --- | --- | --- |
| Profile selector and management; reference `app.go`, `selector.go`, `manage.go` | Preserve arrows/current highlight, Enter, Escape, management, rename/remove and terminal restoration. Separate stable profile ID from mutable label. | CLI-001/006, PRO-001/002; T04/T06/T07 |
| Shared home, refresh sync and passthrough; reference `syncCurrent`, `switchTo`, `runCodex` | Preserve sessions/configuration/history and child args/streams/exit. Verify outgoing identity, journal replacement, recover interruption; label is not ownership. | AUTH-002/003/007/008, PRO-005, CLI-002/003/004; T05/T08/T09/T17 |
| Isolated add/reauth and policy initialization | Preserve cancellation and isolated login; detect file-credential policy and consent before changing it. Compare identity binding. | AUTH-001, PRO-003/004; T06/T07 |
| Process lookup and stop | Replace warn-and-continue and executable-name matching with canonical scope/target ownership and process-creation identity. Require scoped stop consent. | PROC-001–006, AUTH-005/006; T10–T12/T15 |
| Private writes and remove/rename | Replace remove-before-rename with recoverable activation; verify Windows ACLs and POSIX modes. Obtain deletion consent before mutation. | AUTH-003/008, SEC-001, PRO-001/002; T06/T09/T44 |
| OS-specific state | Preserve separate Windows/WSL stores; migration is explicit, previewed and backed up. | ARC-003, MIG-002/003; T12/T41 |
| `parser.ts` native usage and `database.ts` replay | Retain response deduplication and physical owner. Namespace response IDs to verified uniqueness domain. Preserve conflict evidence; replace first-arrival-as-truth behavior. | COL-003, ATT-007/009/010; T25/T26 |
| `parser.ts` legacy deltas | Carry verified baselines, resets and ambiguous request boundaries. Do not assign a delta across an unproved identity boundary to the latest identity. | COL-004, ATT-013; T23/T26 |
| `tokenVector`, `pricing.ts` | Carry subset validation and fixed-point pricing. Extend aggregate overflow protection; missing values remain unknown where required. Unknown models stay unpriced. | COL-007/008/009; T26/T31 |
| `collector.ts`, `compression.ts`, `database.ts` | Preserve bounded source reading and transactional cursor intent; replace bundled zstd executable and libsql/native fallback with approved host built-ins, one accounting engine. | ARC-001, COL-002/005/006, MIG-001; T01/T27/T43 |
| Quota, terminal outcomes, model/effort/tier, tool counts | Retain useful metadata only; no prompts, answers, tool arguments/results or raw errors. Do not infer subscription billing from token estimates. | COL-007/009/010, SEC-004; T26/T31/T37 |

The detailed profile reference enumerates every inspected test behavior and
unsafe mechanism. It remains the authority for the profile port, including
active-account removal, config patching and Unix key parsing. UI/dashboard
migration is deferred until compatibility feasibility is established; this
ticket does not copy the donor dashboard.

## Supported donor formats and target constraints

The pinned collector discovers `.jsonl`, `.jsonl.gz`, `.jsonl.zst`. These are
source containers, not distinct accounting engines. `compression.ts` uses
built-in gzip but a bundled executable for zstd; the latter must be replaced
with bounded host built-in decoding (COL-005). No compressed fixture or decoder
binary is imported. Actual decompression, corrupt/truncated records, cursor
recovery and limits remain CT-22/T25/T27 work.

Native records are `token_usage_record` with thread/turn/response IDs and usage.
Legacy records are `event_msg` payload type `token_count` (also direct
`token_count`), with cumulative `info.total_token_usage` and optional
`last_token_usage`. Supporting metadata comprises `session_meta`, `turn_context`,
`thread_settings_applied`, task/turn start/completion/abort, errors, quota windows
and tool-call metadata. The first session header fixes physical ownership;
foreign native thread IDs and pre-boundary child ordinals cannot create usage.
Current upstream support is **not** inferred from these historical formats.

The donor suppresses all legacy samples in a turn containing native samples.
Tandem must establish that records describe the same work before suppression;
mixed formats with additional unrepresented work must remain visible. The donor
also defaults absent optional token fields to zero. Do not extrapolate that
default to missing required measurements (COL-007).

## Golden definitions

[golden.json](golden.json) is a versioned library of literal metadata records and
18 scenarios. Expand named records, add the specified timestamp, initialize
fresh state per source, and replay source indexes in each listed order. Duplicate
source indexes mean replay of the same physical content. Within-source sequence
is preserved. The future accounting public seam must compare results to the
literal expected outcomes. Requirement/test IDs make each scenario traceable.

`basis: donor` means the intended behavior was found in pinned source/tests,
not that it was executed here. `srs-extension` identifies stronger Tandem
requirements. Semantic outcomes do not prescribe internal schemas or diagnostics.
Identity evidence is explicit fixture context, not content secretly inferred
from a profile label. No actual identity, path, prompt or transcript is used.

Worked oracles: 1,000 input includes 800 cached and 20 cache writes, so ordinary
input is 180; 100 output includes 60 reasoning, so total is 1,100. At the synthetic
pico-USD rates, 360,000,000 + 160,000,000 + 50,000,000 + 1,000,000,000 =
1,570,000,000. These rates are fictional, not a current pricing snapshot.
Legacy 100/10 to 150/15 contributes 50/5; a reset to 20/2 contributes nothing,
then 30/3 contributes 10/1. The reset remains flagged. Aggregating safe wire
integers 9,007,199,254,740,991 and 2 requires exact 9,007,199,254,740,993 or an
explicit overflow failure, never silent rounding.

Run `node tools/verify-accounting-fixtures.mjs` to check definitions, provenance,
requirement links and notice integrity. This is a preparation check, **not** an
accounting replay test; there is intentionally no second accounting engine.
The CT-01 evidence file records separate Windows and WSL results and limitations.
