# Host application with an existing Codex target

This records the already-approved ADR-001 in
[SRS section 3.3](../requirements/Codex-Tandem-SRS-v1.0.md#33-adr-001-node-host-application-with-an-existing-codex-target);
it introduces no new architecture decision.

Use a fresh TypeScript host application, distributed as precompiled JavaScript
and browser assets, with built-in Node SQLite and compression. Selectively retain
the donor interaction model and accounting behavior. Launch the existing Codex
installation locally or through the Linux-host Docker adapter, preserving the
legacy container and its build toolchain.

The host boundary avoids the observed container runtime incompatibility, while
the pure-JavaScript package avoids introducing companion-owned native runtime
artifacts. A native rewrite would not by itself resolve Windows executable trust;
moving Codex to the host would lose the required build environment. The bridge,
installed Codex capabilities, and Windows security behavior remain empirical
qualification gates, not established implementation results.
