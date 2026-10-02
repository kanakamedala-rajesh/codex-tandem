# CT-03 target discovery evidence (#10)

Scope: ENV-003/004, DCK-001/008/009/010, OPS-004 discovery subcases.
This folder's final implementation is the commit adding it (locate with
`git log --oneline -- docs/evidence/ct03`). Each manifest records its exact packed
package SHA-256, Node runtime, OS, command and sanitized result. Tests use fixture
metadata and disposable paths, never credentials or conversation content.

Contract: `doctor --target` is a read-only snapshot, not registration, activation,
tracking qualification or permission to transfer credentials. Context labels are
separate from physical scopes (daemon ID + immutable container ID + canonical home).
Generation is checked before and after metadata projection. Target code disables
Python bytecode writes. No target mutation, runtime install or container lifecycle
operation is part of discovery. A runtime facility is reported independently from
verified durable capture and hook trust; `fullTracking` stays false.

Windows native Node 24.15.0: `npm run build`, `npm run typecheck`, `npm test` passed
14 tests, with Linux-only mount fixture inapplicable. Installed package local
fixture + actual current-user discovery passed using
`npm --silent run verify:discovery -- --target local` (windows.json). Native
Smart App Control remains enabled; this is not a complete T44 qualification.
The restricted command sandbox has an inaccessible synthetic user home; fixture
runs set USERPROFILE to its accessible temporary directory. Actual manifest runs
use the existing native user session without that override.

WSL2 distribution **Ubuntu**, Node 24.18.0: use existing executable directory
`/home/vs-workspace/.nvm/versions/node/v24.18.0/bin`, plus existing Codex directory
`/home/vs-workspace/.local/bin` and `/usr/bin:/bin` on PATH. Typecheck and suite
passed; the same-device /proc/sys mount case is unavailable on this Ubuntu host
and explicitly skipped. The container negative case exercises that boundary.
Installed actual local discovery uses the same command as Windows (ubuntu-local.json).
No other WSL distribution is needed or used for these results.

Negative public-contract fixtures cover stopped, paused, replaced and inaccessible
Docker targets, a replacement race, absent interpreter, remote endpoint refusal,
context/container aliases, symlink/traversal escape, and a regular file used as
Codex home. Adapter fixtures intercept only the external Docker process boundary.
They assert no exec for inactive targets and no mutation commands. Local path
fixtures exercise the real filesystem, including Windows junctions and Linux
symlinks. Seeded private error text is never present in diagnostics.

T03/T12/T14/T16/T17/T36/T37/T39/T44/T45 are **partial discovery subcases only**.
T13 real interactive launch/build, hook trust, durable spool replay, session
attribution, native Linux and full Windows security/lifecycle qualification are
NOT EXECUTED by this ticket. Read-only filesystem access observations do not
establish Windows credential ACL safety. Discovery never weakens those gates.

The initially inspected legacy-image clone is exploratory evidence only. The user
subsequently excluded the special work environment and requested a separate modern
lightweight Linux validation container; the `ide` work container is not a target
for this validation. No result here qualifies that special legacy environment.

Final modern-container installed CLI validation passed on October 2, 2026 UTC:
`codex-tandem-g0-linux`, user `validation`, home `/home/validation`, generation
`b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf`.
See ubuntu-container.json for the complete exact installed command and checksum.
The separately provisioned image is Python 3.12 slim Bookworm with a pre-staged
standalone Codex executable; discovery performs no provisioning or execution of
Codex. This is the user-approved lightweight target, not a legacy qualification.

Installed negative command (ubuntu-container-mount-denied.json): the same target
with `--project-root /proc --project /proc/sys` returned exit 1 and
`PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT`. Read-only confirmation:
`docker --context default exec --user validation <generation> stat -c %d /proc /proc/sys`
returned `201` and `201`. This confirms a same-device mount boundary is rejected;
checking device IDs alone would incorrectly accept it. No mounts were changed.

Both native Windows and Ubuntu installed-package checks also ran the pre-existing
runtime/package smoke suite; no SQLite/compression regressions were observed.
