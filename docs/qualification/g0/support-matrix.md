# Tested capability matrix and downstream limits

Statuses apply only to the linked slice. **Supported-and-tested** means that
slice succeeded on the stated target/artifact; it is not general product support.
**Degraded** means a narrower usable observation than full tracking.
**Capability-unverified** means no qualifying evidence. **Unsupported** means the
current implementation deliberately provides no such path.

| Target / runtime                                                                | Supported-and-tested slice                                                                                                | Degraded or capability-unverified boundary                                                                                                                | Source                                                                                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Windows11 x64 build26300, Node24.15.0, SAC1                                     | Current source/packed shim/direct, built-in database/compression, 34 repaired selector/child terminal cases               | Native A/B parent-process correlation only; local hooks/turn IDs, dashboard/uninstall and continuous credential ACL safety unverified                     | [CT07](../ct07/evidence.md), [repair](../ct07/selector-fix.json), [CT06](../ct06/evidence.md)                |
| WSL2 Ubuntu x64 kernel6.6.87.2, Node24.18.0                                     | Current source/package/runtime, Python bridge tests, 34 repaired host terminal cases                                      | Native A/B parent-process correlation only; Docker interactive semantics and full production activation unverified                                        | [CT07](../ct07/evidence.md), [CT06](../ct06/evidence.md)                                                     |
| Windows / Ubuntu Node22.15.0, newer22 and24 historical CT02 artifacts           | Packed no-script install, runtime diagnostics and missing-capability cases                                                | Historical runtime matrix is not the final integrated artifact matrix                                                                                     | [CT02 six runtime reports](../../validation/ct02/README.md)                                                  |
| Hosted native Linux, Node22.15.0/22/24 images                                   | Exact CT07 source noninteractive build/tests/package/fixtures/Python checks                                               | Native interactive Codex, real Linux security/lifecycle and browser matrix unverified                                                                     | [CI](ci.json), [pipeline](https://gitlab.com/venkata-sudha/codex-tandem/-/pipelines/2908467785)              |
| Modern codex-tandem-g0-linux, Codex0.160.0, Python3.12.15, generation b54aa7bc… | Actual trusted private-spool turn-start and controlled same-session B resume; synthetic mounted transport                 | A failed OTHER; later build failed namespace creation. Persisted servers, native mounted capture, child linkage and same-logical-turn attempts unverified | [CT05](../ct05/evidence.md), [CT06](../ct06/evidence.md), [historical CT07](../ct07/container.json)          |
| Modern codex-tandem-g0-sandbox-v2, Codex0.160.0, generation057df0f1…            | Scoped-policy workspace/network guard plus actual native representative Python build matching direct artifact/environment | Noninteractive/no-mount only; previous-generation hook/resume evidence is not automatically requalified on v2                                             | [resolution manifest](../ct07/namespace-resolution.json), [policy decision](../ct07/environment-decision.md) |
| Original Ubuntu-24.04 / ide legacy work target                                  | None in this scope                                                                                                        | Capability-unverified, original T13 BLOCKED / NOT EXECUTED; protected by owner instruction                                                                | [scope decision](baseline-proposal.md)                                                                       |
| Windows-host Docker adapter; macOS/ARM64                                        | None                                                                                                                      | Unsupported current experimental adapter / outside current qualification respectively                                                                     | [approved baseline](../../requirements/Codex-Tandem-SRS-v1.0.md)                                             |

## Acceptance-family boundary

T01–T05 have scoped host/package evidence, not release-wide passes. T13 is
NOT EXECUTED for its original legacy procedure. T14, T44 and T45 are PARTIAL.
T42's documentary audit is complete for G0; final evidence completeness is
NOT EXECUTED. None of the 45 entire product test families is promoted to PASS
by this gate review. Planning status in the immutable register is historical;
current slices are documented here without rewriting the baseline.

## Handoff to downstream tickets

- G1: credential replacement/recovery, continuous ACL preservation, process
  identity/conflict control and production activation remain required before
  any safe-switch claim. CT06's Windows cache ACE repair does not prove continuous
  credential safety. No stop/force authorization is inferred from the probes.
- G2 / CT21: qualify local hooks/turn identifiers, real persisted-server context
  reuse, children, retries of the same logical turn, identity/usage evidence and
  changed/missing payloads per capability/target. A's OTHER failure is not quota
  termination. Controlled identity labels do not prove provider account ownership.
- G2 capture/collection: actual mounted native Codex, durable acknowledgment,
  crash recovery and idempotent accounting replay remain unqualified. Repeated
  read-only snapshots are not replay proof. Preserve absent-collector behavior,
  trust and bounded rejection; do not advertise full tracking.
- Docker implementation: production credential activation and interactive
  resize/paste/Unicode/cancellation are not supplied by the bounded `-i` exec
  experiment. Pin/requalify generation and runtime before relying on a changed
  target. The v2 scoped seccomp derivative requires explicit separate authorization
  elsewhere; it is not a default installation behavior.
- G4 / CT36–CT38: final artifact/environment/browser matrix, complete T44,
  original legacy decision, migration/rollback, measured performance, donor notice
  in the final tarball, publication/name clearance and all MUST results remain
  release blockers. No package publication is authorized by G0 completion.

See [planning traceability](../../planning/traceability.md) for individual owners
and [baseline proposal](baseline-proposal.md) for the outstanding legacy decision.
