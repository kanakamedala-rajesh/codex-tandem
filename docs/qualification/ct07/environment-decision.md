# CT07 approved disposable environment resolution

On October 3, 2026 the owner explicitly approved the recommended separate
disposable-container policy resolution. This supersedes the earlier proposal's
authorization status; it does not amend the approved SRS or qualify the protected
legacy work container. `ide`, Ubuntu-24.04 and host security settings were preserved.

The old generation `b54aa7bcd3c85c3dd617a9551740c2948ad6146b1b362b21bbe695c6f2bfdfcf`
returned EPERM for UID1000 user namespaces. Its failed build and fallback probes
remain in `container.json`. Docker's default namespace restrictions were the
working diagnosis, not a complete kernel denial trace. A first derivative missed
Codex's IPC namespace flag and failed before credentials were copied.

The successful target is `codex-tandem-g0-sandbox-v2`, generation
`057df0f1fa2c691b7341cfe3688817b3ed86f09462f2c830e343e48075f623e2`, using the unchanged
base image, UID/GID 1000, `--cap-drop ALL`, `--security-opt no-new-privileges`,
128 PIDs, 1 GiB memory and two CPUs. It has no host mounts or published ports.
No privileged mode, SYS_ADMIN addition, seccomp-unconfined, host namespaces,
Docker socket mount, host sysctl change or Codex sandbox bypass was used.

The scoped seccomp derivative is based on the exact Engine 29.8.1 baseline;
[reproduction and upstream licensing](../../../tools/qualification/namespace-policy.md)
describe the five additions and pinned source. Observed policy SHA-256:
`d9c821784000ec91f71693da4051b019a20ecb1e0dbe8ca41696053cdf497a4c`.
The change applies to this new disposable container, not the host-wide policy.

Before credentials, the normal Codex sandbox allowed workspace writes, refused
sibling writes with EROFS and refused network access with EPERM. The same local
listener was independently reachable outside that sandbox both before and after.
The standalone invocation is `codex sandbox -c sandbox_mode="workspace-write" -- COMMAND`;
this release does not use a `linux` subcommand for that path.

The packed installed Tandem module then ran Codex 0.160.0 with its normal
`workspace-write` sandbox. Exactly one completed command succeeded, the native
turn started/completed with exit 0 and no timeout, sources were unchanged, and
both the compiled module and artifact existed. Artifact bytes and effective
UID/HOME/CODEX_HOME/directory matched the direct Python baseline. Artifact SHA-256:
`2a27319d8deea4baae336d5f973416df3d80e74c8faf17ddcc54916012428151`.

Only the approved personal-free reusable cache was copied. After exporting fixed
nonsecret projections, the disposable root and copied runtime/credential state
were removed; no owned processes remained. Original and reusable cache matched
their private checkpoints, which were then removed. The reusable cache remains
outside Git with directory 0700/file 0600. `namespace-resolution.json` records the
observed guards, build, isolation and cleanup. Historical runtime hashes remain
in `cleanup.json`; the copied runtime was independently checked as identical.

This establishes the selected disposable target's bounded G0 build subcase.
Docker interactive semantics, original legacy T13/ENV-001, full DCK-003 and the
complete T03/T05/T13/T17/T44 families remain unqualified or PARTIAL. It does not
establish a complete G0 support declaration.

Reproduction uses `tools/qualification/stage-container-build.py` for the synthetic
fixture and `tools/qualification/guard-container-sandbox.py` for the credential-free
guard, after staging the same pinned runtime. The final build runner is
`tools/qualification/run-container-build.mjs`, pointed at the packed installed
`dist/g0-container.js`. Generation checks intentionally reject a replacement
container; a new qualification run requires reviewing and updating that binding.
Credential staging remains a separately authorized manual step; no credential
bytes or private checkpoints are part of these tools or evidence.

The policy generator check is:

```text
node tools/qualification/verify-namespace-policy.mjs BASELINE OBSERVED_PROFILE
```

It passed on native Windows Node 24.15.0 and Ubuntu Node 24.18.0, comparing parsed
JSON to the independently observed v2 policy and checking changed-baseline and
existing-output rejection. These offline checks do not repeat the live build.
