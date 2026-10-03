# Legacy qualification baseline proposal

Status: **proposal only; no baseline amendment or legacy waiver approved**.
The owner approved using a modern disposable container for this G0 experiment
and separately approved its scoped policy resolution. Those authorizations are
not a claim that the original existing work container meets the requirements.

The [approved SRS](../../requirements/Codex-Tandem-SRS-v1.0.md) decision A and
ENV-001/T13 require the existing legacy Codex/toolchain workflow. ENV-003,
DCK-001/DCK-002/DCK-003, SEC-006, SCP-003 and REL-001 also constrain target
preservation, execution, terminal/security behavior and truthful release claims.
The owner prohibited using Ubuntu-24.04 and `ide` in this run; modern-container
success cannot satisfy that original procedure.

Proposed resolution before making the legacy product claim: retain the original
baseline and mark original T13/ENV-001 qualification blocked until the owner
separately authorizes a suitable actual-target run. Independent G1 safety work
can proceed from the demonstrated modern feasibility; code dependent on original
legacy capability must remain conditional. This is the current operating boundary.

If the owner instead intends to replace the release target, request a separately
reviewed baseline amendment naming decision A, ENV-001 and T13, plus the effects
on ENV-003, DCK-001/002/003, SEC-006 and REL-001. It must specify the replacement
runtime/toolchain, allowed security policy, reproducible generation and workload,
and required interactive/hook/security verification. Until approved, record no
waiver, legacy pass or changed MUST. Original requirements remain unchanged.

The approved disposable seccomp derivative demonstrates one scoped resolution;
it is not general authority to alter target policy, install runtimes, start/stop
containers or weaken host security. Its exact limits and retained denial evidence
are in [CT07 environment decision](../ct07/environment-decision.md).
