# CT-01 / GitLab #8 verification evidence

Date: 2026-10-02 UTC. Baseline: `ef9e02d8119cea105857f7229af6b4354e179f16`.
The containing #8 commit identifies the delivered definitions and inventory;
there is no product application implementation in this ticket. Package checksum:
not applicable (no package built). Fixture SHA-256:
`f2cedb916e0853d3587290065d6f87d98139596cc2e0af1faf123fcff2163efd`.

| Environment / target | Exact validation | Observed result |
| --- | --- | --- |
| Native Windows x64 / local fixture preparation, Node v24.15.0 | `node tools/verify-accounting-fixtures.mjs` | PASS: 18 scenarios, 20 records; references, record allowlist and exact MIT notice hash validated. |
| WSL2 distro **Ubuntu**, Linux x64, kernel `6.6.87.2-microsoft-standard-WSL2`, Node v24.18.0 / local fixture preparation | `wsl -d Ubuntu -- bash -lc 'source ~/.nvm/nvm.sh && cd /mnt/c/Users/kanak/windows_workspace/Codex-Projects/codex-tandem/.worktrees/ct01 && node tools/verify-accounting-fixtures.mjs && uname -sr'` | PASS: same 18 scenarios, 20 records and SHA-256. Ubuntu-24.04 was not used. |
| Native Windows / repository whitespace | `git diff --check` (plus staged equivalent before commit) | PASS. |

The initial WSL command also appended `git diff --check`; that last step failed
because a Windows-created Git worktree has an absolute Windows `.git` pointer
which WSL Git cannot resolve. The fixture validator and kernel query succeeded
before it. Whitespace validation was executed with native Windows Git; no Git
metadata was edited to make WSL Git run. A later Ubuntu command reran the fixture
validation alone successfully. Restricted-mode WSL access was initially denied;
the authorized validation succeeded with normal host access. Restricted HTTPS
also failed TLS; pinned public-source reads succeeded using normal host HTTPS.

Manual review:

- Read #8 with its (empty) comments, approved domain/ADR/planning documents and
  profile-switching reference. Used that reference without extracting or running
  Go/archive content. Both archive hashes and their unequal provenance remain
  explicit.
- Read eight pinned codex-report files over HTTPS listed in `provenance.json`.
  Preserved the full MIT notice with copyright and warranty text. Hashes cover
  the inspected UTF-8 response bodies, not a moving branch or rebuilt donor.
- Compared native, legacy, inherited-owner, conflict, integer and pricing cases
  to pinned parser/storage/tests and the SRS. Reviewed golden arithmetic by
  hand; fictional rates do not claim current market pricing. Changed-ID-content,
  identity-boundary and aggregate overflow cases explicitly require stronger
  Tandem behavior than donor evidence establishes.
- Inspected all added files: documentation, JSON definitions, a dependency-free
  Node preparation validator, notice and notice line-ending rule. No Go binary,
  archive, native driver/decoder, embedded Git metadata, raw transcript or secret
  is included. Future tarball inspection must independently enforce inclusion
  of the MIT notice; this source inventory is not a packed-artifact check.

## Acceptance scope and limitations

| Requirement / test | Result for this ticket |
| --- | --- |
| MIG-001 | Preparation complete: documented useful behavior, replacement mechanisms, immutable source provenance and synthetic golden definitions. Product port execution remains future work. |
| PKG-004 | MIT notice preserved and source contents reviewed. npm scope ownership, publication/name checks and final tarball inspection NOT EXECUTED; they remain release work. No registered-package or trademark claim. |
| T01 | NOT EXECUTED: no packed product in CT-01. Source/notice inventory only. |
| T09 | NOT EXECUTED: unsafe remove-before-rename identified; journal/crash recovery implementation and fault injection remain G1. |
| T26 | NOT EXECUTED: golden definitions reviewed and integrity checked on both systems, but no accounting engine replayed them. |
| T43 | NOT EXECUTED: donor native dependency boundary identified; no product compiler/runtime/dependency matrix or tarball built here. |

No CT-01 preparation blocker remains. Real current-upstream format qualification,
actual accounting replay, package validation and product test families retain
their own requirements and cannot be inferred from these definition checks.
TDD at the accounting replay seam applies when that product behavior is built;
this ticket deliberately supplies definitions without a duplicate accounting
implementation. Coordinator performs the skill's two-axis review before push
and closure; any review findings must be resolved first.
