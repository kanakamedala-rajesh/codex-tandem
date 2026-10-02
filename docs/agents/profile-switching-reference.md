# Profile switching reference

Codex Tandem extends the user's codex-as-go product by implementing its useful
profile-switching behavior in TypeScript and adding the capabilities specified
in the approved SRS. The Go project is reference material, not a runtime, build,
installation or distribution dependency of Tandem. No Go binary or Go compiler
is required for the Tandem implementation.

This record captures the inspected behavior so planning and implementation can
work from the SRS, this reference and executable acceptance tests. Consult the
archive again only when an undocumented detail needs checking. Source provenance
identifies what was inspected; a historical archive checksum discrepancy does
not itself block implementing the documented behavior in TypeScript.

## Inspection scope and authority

Read-only inspection of the user-supplied ZIP on October 2, 2026 covered the
manager's command dispatch, switching, login, profile management, file helpers,
path resolution, selector, and platform process inspection, plus the existing
test inventory. Archive SHA-256:
`b56c969b76c1105445c112f545fa5be61041641a16c2b9ccc2e2f1c504278cf8`.

Source references below name files and functions inside the ZIP; they are not
Tandem implementation paths. The SRS and authoritative register take precedence
where existing behavior differs. This was source inspection, not execution of
the Go tests or validation of a working Tandem application.

## Existing workflow

1. Resolve the shared Codex home, separate saved-credential directory and Codex
   executable. Windows and POSIX use separate default manager state locations.
2. List saved account labels and highlight the active account in an arrow-key
   selector. Enter selects, Escape cancels, and M opens account management.
3. Before switching, inspect running Codex processes and validate the selected
   saved credential file.
4. Copy the current target credentials back to the outgoing saved account,
   preserving refreshes made by either wrapped or plain Codex use.
5. Copy the selected credentials into the shared Codex home and update the
   current-account marker. Shared sessions, configuration and history stay in
   the same Codex home.
6. Launch the existing Codex executable with the supplied arguments and standard
   streams. After exit, attempt to save refreshed credentials and propagate the
   child exit code. Leave the selected identity active.

Source: `internal/manager/app.go`, especially `syncCurrent`, `switchTo`,
`runCodex`, `selectSavedAccount` and `runWithAccountSelector`; `paths.go` and
`selector.go` in the same directory.

## Behavior to preserve and extend

| Inspected behavior | Tandem implementation contract | Requirements / tests |
| --- | --- | --- |
| Arrow selection with current-account highlighting and management menu | Preserve an efficient interactive selection/management workflow; use stable profile IDs and restore terminal state on all exits. | CLI-001/006, PRO-001; T04/T06 |
| Account labels select saved credentials | Separate mutable labels, immutable profile IDs and account/workspace identity bindings. | PRO-002/003; T07 |
| Copy-and-sync switching in one shared Codex home | Preserve shared Codex state and outgoing credential refreshes; implement a guarded, recoverable activation transaction. | PRO-005, AUTH-002/003/008; T08/T09 |
| Isolated temporary home for add/reauthentication through existing Codex login | Preserve cancellation safety; respect credential-storage policy and validate whether login represents the same identity binding. | PRO-003/004, AUTH-001; T06/T07 |
| Argument, stream and child-exit passthrough | Preserve transparency using the SRS CLI surface, including explicit --identity, --target and the -- boundary. | CLI-002/003, INT-001; T05/T17 |
| Resume arguments pass through to Codex | Add target/project-scoped session resolution and avoid silently choosing another project. | CLI-004; T17 |
| Rename and removal of saved accounts | Retain immutable historical records after rename/removal; confirm destructive actions before mutation. | PRO-001/002; T06/T07 |
| Platform-specific process discovery | Add credential-scope ownership, process creation identity, alias protection, concurrency locks and scoped stop consent. | AUTH-005/006, PROC-001–006; T10–T12/T15 |
| Separate OS-specific state locations | Keep native Windows and WSL stores independent, using the SRS Tandem state layout and explicit migration preview. | ARC-003, MIG-002/003; T12/T41 |

Login details come from `app.go` functions `addAccount`, `reauthAccount` and
`initialize`; management behavior comes from `manage.go`. The existing CLI
spellings are historical reference, not a requirement to add compatibility
aliases beyond the approved Tandem command contract.

## Existing mechanisms to replace

- `assertCodexStopped` warns and continues when process inspection fails.
  Tandem must block an unsafe switch when ownership is inaccessible or ambiguous
  (PROC-004), rather than copying this fallback.
- The platform process helpers broadly identify Codex by executable name or
  command-line arguments. Tandem must prove target/scope ownership and revalidate
  process identity before any stop or switch (PROC-001/004/005).
- `writePrivateFile` removes the destination before renaming the staged file.
  Tandem requires journaled, validated replacement and crash recovery that
  preserves a valid credential version (AUTH-003/008).
- Go chmod calls alone do not establish effective Windows ACL protection.
  Verify Windows ACLs explicitly as well as POSIX permissions (SEC-001).
- `syncCurrent` associates credentials using the mutable current-account label.
  Tandem must verify the outgoing identity binding and detect external identity
  changes (AUTH-002/007); labels are not proof of ownership.
- Initialization patches file-backed authentication after backing up config.
  Tandem must first detect policy and preview/obtain consent for the change;
  prohibited file mode must remain blocked (AUTH-001).
- The direct removal command removes a non-active saved file without its own
  confirmation. The interactive deletion path can switch away from the active
  account before its final delete confirmation. Tandem must define and validate
  consent before each relevant mutation, preserving safe cancellation semantics
  (PRO-001/002, PROC-002).

## Test behavior to carry forward

The inspected tests cover copy-and-sync switching, selector invocation,
cancellation, renaming the active account, refusing direct active-account
removal, configuration patching and Unix key parsing. Use these as behavioral
examples, not as evidence that the new implementation passes.

Implement TypeScript/JavaScript tests for the corresponding observable behavior,
then extend them with the SRS crash, concurrency, identity-binding, process,
Docker, privacy and accounting cases. Validate applicable behavior locally on
both Windows and WSL2 during implementation; record separate actual results.
No Go test runner is required for this translation. Existing Go tests have not
been executed in this review.

## Tandem adds

The approved extension adds named local/container targets, durable launch
identity, metadata capture, attempt and child attribution, replay-safe
collection, accounting, reporting and a local dashboard. These are governed by
the SRS, not inferred from the Go profile switcher. Migration from existing
codex-as state remains a separate backed-up, previewed workflow; only one
credential manager may control a live credential scope during transition.
