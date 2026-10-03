# G0 compatibility decision

Review date: 2026-10-03 UTC. Reviewed application revision:
`810401cd1c5be48eb32391a72a9e08f84b05a123`. This directory is the CT08/#15
consolidation for [G0/#3](https://gitlab.com/venkata-sudha/codex-tandem/-/issues/3).

**Decision: bounded feasibility is established for the owner-selected Windows,
Ubuntu and disposable modern-container scope.** This permits the planned G1
safety implementation. It does not establish production support, full tracking,
release readiness or a pass of the original legacy-container gate. The original
legacy T13/ENV-001 claim remains BLOCKED / NOT EXECUTED. The baseline is unchanged;
[the separate proposal](baseline-proposal.md) records the unresolved scope conflict.

The [owner's target clarification](https://gitlab.com/venkata-sudha/codex-tandem/-/issues/3#note_3944889270)
and [scoped policy approval record](../ct07/environment-decision.md) authorize
only this experiment. Ubuntu-24.04 and `ide` were excluded. No claim here licenses
security changes or silently applies the disposable policy to another target.

## Review checklist

The CT08 evidence review signs off the following bounded conclusions. Independent
review and the coordinating issue checklist are recorded with the containing
commit; this is an engineering review, not an owner waiver of release requirements.

- [x] T01–T03: historical floor/newer runtime evidence and current integrated
      package/runtime checks reviewed, with separate artifact identities.
- [x] T04–T05: repaired installed package passes 34 real host terminal cases on
      each local host. Synthetic child evidence does not qualify native Codex or
      Docker terminal behavior.
- [x] T13: actual Codex representative build succeeds only on the explicitly
      approved v2 modern disposable generation; original legacy procedure is
      NOT EXECUTED.
- [x] T14: actual private-spool and synthetic mounted bridge slices reviewed;
      durable receipt/replay and actual mounted native Codex remain unqualified.
- [x] Initial T44: Windows SAC remained enforcing (value 1); source, installed
      shim/direct, SQLite/compression and available G0 flows pass. Full hooks,
      dashboard, uninstall and continuous credential safety remain unqualified.
- [x] T45/A-to-B: real same-session/new-turn B completion and A's OTHER failure
      retained. Local launch correlation differs from container hook evidence;
      no same-turn retry, persisted-server, child or provider ownership claim.
- [x] T42: mapping, approvals A–F, provenance and scenario/status boundaries
      audited in [traceability-review.md](traceability-review.md).
- [x] CT01 fixture preparation evidence reviewed; fixture preparation is not
      accounting replay. CT07 local validations and exact-source hosted Linux
      pipeline passed; links below preserve their independent scopes.
- [x] Required limitations and downstream dependencies recorded in
      [support-matrix.md](support-matrix.md) and [baseline-proposal.md](baseline-proposal.md).

## Evidence identities and validation

The live CT07 experiments are associated with commit`0299de5c52911c0c50c796ae1a40fbf03ca9447c`. Its earlier records say
"uncommitted" because they describe the measurement moment; they are not new
executions at the consolidation commit. Original failures are retained alongside
the later selector and sandbox corrections.

The repaired Windows-built tarball used for both hosts' terminal checks and the
v2 actual-container build has SHA-256
`34c5e20f8021056d9c295ddfd92481c93247523dac02b659bb7d9538702846f8`.
The separate Ubuntu validation tarball is
`e8e711c4fad933dae8b84d59a19e87e99066672b35b77a2f41cf30e876c47c50`.
Historical pre-repair package
`e090d8617f9fa1b8df7f8241cfe530edb0868273170e30e2f168b3c7a081b105`
does not inherit repaired results. See [selector-fix.json](../ct07/selector-fix.json),
[provenance.json](../ct07/provenance.json) and
[namespace-resolution.json](../ct07/namespace-resolution.json) for module, fixture,
policy, generation and tool hashes. CT02/CT04/CT05/CT06 evidence retains its own
historical revision/package identity; those checks are not relabeled as CT07 runs.

Local CT07 commands were `npm ci --ignore-scripts --engine-strict`,
`npm run validate`, `npm run verify:installed`,
`node tools/verify-accounting-fixtures.mjs` and Python discovery, plus the real
terminal harness and separately authorized native build. Exact commands and
manual staging/cleanup are in [CT07 evidence](../ct07/evidence.md). Windows
Node24.15.0: 30 tests passed/3 platform skips, Python1 pass/5 POSIX skips; Ubuntu
Node24.18.0: 31 passed/2 skips, Python6 pass. Both passed installed and fixture
checks and all34 repaired terminal cases. First-frame p95: Windows62.00ms and
Ubuntu113.94ms; these warm synthetic selector measurements are not final launch
or release performance results.

[Pipeline 2908467785](https://gitlab.com/venkata-sudha/codex-tandem/-/pipelines/2908467785)
passed for exact source `0299de5c52911c0c50c796ae1a40fbf03ca9447c`:
[floor job16908914449](https://gitlab.com/venkata-sudha/codex-tandem/-/jobs/16908914449),
[Node22 job16908914450](https://gitlab.com/venkata-sudha/codex-tandem/-/jobs/16908914450),
[Node24 job16908914451](https://gitlab.com/venkata-sudha/codex-tandem/-/jobs/16908914451).
This is initial hosted native Linux noninteractive validation, including Python
bridge discovery, not native Linux interactive Codex qualification. It supersedes
the pending-CI state at CT07 observation time. Runtime details remain in
[ci.json](ci.json). Earlier tooling pipeline provenance remains in
[CT07 native-linux.json](../ct07/native-linux.json).

CT08 changes only review documents. Its independent offline mapping/link audit
and formatting results on Windows and Ubuntu are recorded in
[validation.md](validation.md); it did not repeat authenticated runs or touch the
protected environments. SCP-003 is satisfied by the explicit capability
boundaries of this review, not by declaring every target supported. REL-001
release acceptance remains unfulfilled pending G1–G4 and all required evidence.

## Final integration review

Independent CT08 Standards and Spec reviews reported zero findings for this
seven-file packet. Whole-branch review identified two repairs, now integrated in
`810401cd1c5be48eb32391a72a9e08f84b05a123`: local-resume child environment and
file-store isolation, and shared installed-package setup/cleanup. The
[repair evidence](../g0-review-fixes/evidence.md) records the harmless regression
and full local validation: Windows31 passes/3 skips, Ubuntu32 passes/2 skips;
all three installed-package verifiers pass on each host. Package hashes remain
the same host-specific values above. These changes do not repeat or reinterpret
historical authenticated CT06 runs. [Final repair pipeline2908478014](https://gitlab.com/venkata-sudha/codex-tandem/-/pipelines/2908478014) passed for this exact commit across Node22.15.0/22/24. Job identities are in [ci.json](ci.json). The bounded engineering sign-off is complete; coordinating issue closure records this decision.

## CT08 acceptance criteria

| #   | Criterion                                                                    | Result                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Review G0 coverage without converting experiments to full passes             | Complete: checklist above and support matrix preserve family boundaries.                                                                                                                    |
| 2   | Block missing required Windows/container feasibility                         | Selected-scope feasibility demonstrated; original legacy claim remains blocked. Final integration review fixes and their exact-source CI pass; bounded review sign-off complete.            |
| 3   | Record capabilities and baseline proposal before reliance                    | Complete: explicit support states, downstream conditions and separate unapproved legacy proposal.                                                                                           |
| 4   | Map requirements, tests and unresolved limitations                           | Complete for this review: SCP-003/REL-001 and all ten assigned families; T42 audit and A–F review linked.                                                                                   |
| 5   | Applicable native Windows and WSL validation; distinguish additional targets | Complete for documentation audit on both hosts, recorded separately in validation.md. Historical execution and hosted Linux are independently linked; no original legacy execution claimed. |
