# Profile switching reference

Tandem extends the user's codex-as-go behavior in TypeScript. The SRS/register
govern where existing behavior differs. The Go executable/compiler is not a
build, installation or runtime dependency.

Read-only ZIP inspection covered command dispatch, switching, login, management,
file/path helpers, selector, process inspection and tests. Source names below refer
to files inside that archive, not Tandem paths. The Go tests were not executed.

The supplied archive SHA-256 is
`b56c969b76c1105445c112f545fa5be61041641a16c2b9ccc2e2f1c504278cf8`;
the SRS P01 archive hash is
`fd675029900bfad68382a513b17b415ced49ba51b6a1f388ffa06e5d931be67d`.
The user confirmed ownership and authorized the supplied ZIP as the donor reference.
No license file was present. These hashes do not establish source equivalence or
a runtime dependency; the approved SRS provenance remains unchanged.

## Inspected workflow

1. Resolve shared Codex home, separate saved credentials and existing executable,
   using separate Windows/POSIX manager state defaults.
2. Show saved labels and highlight the active account in an arrow selector.
   Enter selects, Escape cancels, M opens management.
3. Inspect running Codex processes and validate selected saved credentials.
4. Save outgoing credentials, preserving refreshes from wrapped or plain Codex.
5. Copy selected credentials into shared Codex home and update the active marker,
   preserving sessions, configuration and history.
6. Launch existing Codex with passed arguments/streams. After exit, attempt to save
   refreshed credentials, propagate its exit code and leave the selected identity active.

Sources: `internal/manager/app.go` (`syncCurrent`, `switchTo`, `runCodex`,
`selectSavedAccount`, `runWithAccountSelector`), `paths.go`, `selector.go`.
Login uses `addAccount`, `reauthAccount`, `initialize`; management uses
`manage.go`. Historical CLI spellings do not require compatibility aliases.

## Tandem contracts

| Behavior                                | Required port or extension                                                              | Requirements / tests                    |
| --------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------- |
| Selector and management                 | Stable profile IDs, current selection, terminal restoration on every exit.              | CLI-001/006, PRO-001; T04/T06           |
| Saved labels                            | Separate mutable labels, immutable profiles and account/workspace identity bindings.    | PRO-002/003; T07                        |
| Shared-home copy/sync                   | Preserve outgoing refreshes with guarded, recoverable activation.                       | PRO-005, AUTH-002/003/008; T08/T09      |
| Add/reauth through isolated Codex login | Safe cancellation, storage-policy checks and identity-binding validation.               | PRO-003/004, AUTH-001; T06/T07          |
| Argument, stream and exit passthrough   | SRS CLI with explicit identity/target and the `--` boundary.                            | CLI-002/003, INT-001; T05/T17           |
| Resume                                  | Target/project-scoped resolution; never silently select another project.                | CLI-004; T17                            |
| Rename/remove                           | Retain immutable history and confirm destructive actions before mutation.               | PRO-001/002; T06/T07                    |
| Process discovery                       | Scope ownership, creation identity, aliases, concurrency locks and scoped stop consent. | AUTH-005/006, PROC-001–006; T10–T12/T15 |
| OS state                                | Independent Windows/WSL stores and explicit migration preview.                          | ARC-003, MIG-002/003; T12/T41           |

## Replace unsafe mechanisms

- `assertCodexStopped` warns and continues on inspection failure. Block switching
  when ownership is inaccessible or ambiguous (PROC-004).
- Name/argument process matching is insufficient. Prove target/scope ownership and
  revalidate process identity before stop/switch (PROC-001/004/005).
- `writePrivateFile` deletes the destination before rename. Use journaled,
  validated replacement/recovery preserving valid credentials (AUTH-003/008).
- Go chmod does not establish Windows ACL protection. Verify Windows ACLs and
  POSIX permissions (SEC-001).
- `syncCurrent` uses a mutable account marker. Verify outgoing identity and detect
  external changes (AUTH-002/007).
- Initialization patches authentication after a backup. Detect policy and obtain
  consent before changing it; prohibited file mode stays blocked (AUTH-001).
- Direct removal lacks its own confirmation; interactive deletion may switch before
  final confirmation. Obtain consent before each mutation and preserve cancellation
  safety (PRO-001/002, PROC-002).

Inspected tests offer cases for sync, selector invocation, cancellation, active
rename, refusing active removal, config patching and Unix key parsing. Translate
observable cases into TypeScript/JavaScript tests, then add SRS crash, concurrency,
identity, process, Docker, privacy and accounting cases.

Named targets, launch identity, capture, attribution, replay-safe collection,
accounting/reporting and dashboard behavior come from the SRS. Migration is a
separate backed-up, previewed workflow; one manager controls a live scope at a time.
