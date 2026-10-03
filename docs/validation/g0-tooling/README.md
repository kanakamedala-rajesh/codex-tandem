# G0 / #3 development tooling validation

Run date: 2026-10-02. Source: the commit introducing this record, based on
729ac82 (`git log --format=%H -- docs/validation/g0-tooling/README.md`).
This records the user-requested formatting, lint and common project setup addition.
It does not close G0 or establish real-target/full-tracking qualification.

## Locked tools and compatibility

Registry metadata was queried with `npm view <package> version engines peerDependencies --json --cache .npm-cache`.
Locked development versions: ESLint 10.11.0, @eslint/js 10.0.1,
typescript-eslint 8.71.0, Prettier 3.9.9, globals 17.13.0; existing TypeScript
5.8.3 and @types/node 22.15.0 remain unchanged. ESLint's declared Node range is
`^20.19.0 || ^22.13.0 || >=24`; typescript-eslint accepts TypeScript
`>=4.8.4 <6.1.0`. A clean strict-engine install under Node 22.15.0 confirmed
transitive compatibility rather than relying only on top-level declarations.

Lockfile SHA-256: `b83ce3ce26796aace37c9f9ff2dc818ab536956f273a526b905e80776f793d41`.
`npm audit --json --cache .npm-cache` reported zero known vulnerabilities across
100 development packages; no production dependencies were introduced. This is a
point-in-time registry result. ESLint 9 was considered, then rejected because the
registry marks it unsupported and the current major supports the runtime floor.

## Local results

| Environment           | Runtime                   | Commands/results                                                                                                          | Packed artifact SHA-256                                            |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Native Windows 11 x64 | Node 24.15.0, npm 11.12.1 | Clean strict-engine install; validate PASS, 24 tests passed and 3 platform skips; all three installed-package checks PASS | `633f6b4ba3a8e4c5eae016c02aa03ab99f142b7945bc510f210c18a9f4e19bb1` |
| WSL2 Ubuntu Linux x64 | Node 22.15.0, npm 10.9.2  | Clean strict-engine install; validate PASS, 25 tests passed and 2 platform skips; all three installed-package checks PASS | `80917abbe03dd467b21c77c7c80f15669848227a9a877a5f2fba76e61161666f` |

Commands in each checkout:

```sh
npm ci --ignore-scripts --engine-strict --cache .npm-cache
npm run validate
npm run verify:installed
node tools/verify-accounting-fixtures.mjs
```

Ubuntu used `wsl -d Ubuntu -- bash -lc` with `source ~/.nvm/nvm.sh` and
`nvm use 22.15.0`. Builds and package verification ran sequentially across the
shared checkout. Reinstall dependencies when changing OS to recreate npm shims.
Windows sandbox child-process restrictions required running the checks with
approved escalation; no Windows security setting was changed. No other WSL
distribution or IDE was started.

The accounting fixture/license verifier passed 18 cases and 20 records on both
platforms; golden SHA-256 remains
`f2cedb916e0853d3587290065d6f87d98139596cc2e0af1faf123fcff2163efd`.
The original requirements, CT02 validation, CT03 evidence, CT05 qualification and
accounting fixture bytes have no diff. Maintained source/scripts/docs were
formatted, changing newly compiled artifacts; the package hashes above describe
these new artifacts and do not supersede earlier recorded runs.

## CI and remaining scope

The GitLab matrix runs Node 22.15.0, maintained 22 and 24 images on the confirmed
shared Linux runner tag `saas-linux-small-amd64`; caches only npm downloads by
lockfile and runtime; and executes validation, installed checks and accounting
fixture integrity. Pipeline execution is NOT EXECUTED in this worktree and will
be recorded after integration and push. Native Linux CI is supplemental evidence,
not a substitute for Windows/WSL or actual legacy-target qualification. No
publication, deployment or credential setup is included.
