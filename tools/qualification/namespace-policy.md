# Disposable CT07 namespace policy

`generate-namespace-policy.mjs` is an offline, dependency-free qualification tool.
It does not change Docker, create a container, or install a production policy.
It accepts only the exact baseline SHA-256 recorded below and refuses to overwrite
an existing output file.

The baseline is Moby profiles `seccomp/default.json`, commit
`836ae4d37ef2ec995c77c99fc55f5b5f3af3a897` (`seccomp/v0.2.3`), the version pinned by
Docker Engine 29.8.1 (engine Git revision `464cd50`).

- [Pinned baseline](https://raw.githubusercontent.com/moby/profiles/836ae4d37ef2ec995c77c99fc55f5b5f3af3a897/seccomp/default.json)
- SHA-256: `536529b665dd0972c37bfb569f5d4ac8a53592e7b00752bc39ff063ca9864c74`
- [Upstream Apache-2.0 license](https://github.com/moby/profiles/blob/836ae4d37ef2ec995c77c99fc55f5b5f3af3a897/LICENSE)

The upstream baseline is not vendored. Download those pinned bytes and the
upstream LICENSE, then run:

```text
node tools/qualification/generate-namespace-policy.mjs docker-default-seccomp.json namespace-seccomp-v2.json
```

When distributing generated policy bytes, accompany them with the upstream
Apache-2.0 LICENSE and this modification notice: Codex Tandem CT07 adds five
allow rules for its owner-approved disposable qualification environment.
All existing baseline fields and rules, including clone3's ENOSYS fallback,
remain unchanged. Generated JSON serialization may differ from the observed
profile's formatting; compare parsed JSON as well as recording byte hashes.

The additions allow clone argument 0 exactly `2013397009` or `939655185`
(USER, MNT, PID, IPC, SIGCHLD, with optional NET), unshare argument 0 exactly
`268435456` (USER), mount, pivot_root, and umount2 argument 1 exactly `2`.
This is specific to the observed x86_64 Bubblewrap path in Codex 0.160.0.
The first attempted derivative omitted IPC and failed before credential staging;
the final derivative matches the pinned Codex Bubblewrap invocation.

Use only with the approved disposable target: UID/GID 1000, all capabilities
dropped, no-new-privileges, no host mounts or published ports, no privileged
mode, and bounded resources. These policy additions permit namespace setup;
they are not themselves proof of filesystem or network confinement. The
credential-free normal Codex sandbox guards and actual build evidence are in
`docs/qualification/ct07/namespace-resolution.json`. No general deployment or
original legacy-container support claim follows from this experiment.
