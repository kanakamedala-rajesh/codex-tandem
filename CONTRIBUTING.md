# Contributing

Use host Node >=22.15.0; prefer a maintained, patched Node 22 or 24 release.
Install the exact development tools with `npm ci --ignore-scripts --engine-strict`.
All tools are development dependencies. The packed runtime still contains only
compiled JavaScript, the package manifest and README; it has no production
dependencies or installation lifecycle scripts.

Run `npm run format` after edits and `npm run lint:fix` for available lint fixes.
Before submitting changes, run:

```sh
npm run validate
npm run verify:installed
node tools/verify-accounting-fixtures.mjs
```

`validate` checks formatting, lint, TypeScript types, builds, then runs tests in
that order. `verify:installed` exercises the packed doctor, discovery and capture
commands through isolated temporary installations. Build first when invoking
package checks independently. Run applicable checks on both native Windows and
the existing Ubuntu WSL2 distribution, sequentially if they share a checkout.
Rerun `npm ci` after switching operating systems in a shared checkout so npm creates the correct command shims. Record each environment separately; platform skips do not qualify that platform.

Prettier owns formatting, with two-space indentation, single quotes, LF endings
and preserved prose wrapping. EditorConfig uses matching indentation and retains
CRLF for Windows batch scripts. ESLint uses recommended JavaScript and TypeScript
rules with Node globals; TypeScript's strict compiler checks run separately.
Intentional control-character rejection expressions carry a local lint exception.
Do not disable a rule project-wide merely to hide a single diagnostic.

The approved requirements, accounting fixtures and recorded CT02/CT03/CT05 evidence
are explicitly excluded from formatting because their bytes/provenance are fixed.
Generated output, package tarballs and local caches are also ignored. New maintained
code and documentation are checked by default, including future qualification
summaries. If evidence needs updating, create a new result tied to the new source
and artifact hashes; never rewrite historical qualification to match new formatting.

GitLab CI runs the same validation and installed-package checks in official Node
22.15.0, maintained Node 22 and Node 24 Linux images on `saas-linux-small-amd64`.
The floor job also enforces all transitive development-package engine requirements.
Only the npm download cache is reused, keyed by lockfile and Node version;
`node_modules` and compiled output are rebuilt. CI does not publish packages,
deploy, use project secrets or replace Windows/WSL and real-target qualification.
The fixed 22.15.0 job checks compatibility, not a recommendation to use an old patch.

Dependency upgrades should remain exact in `package.json` and `package-lock.json`.
Verify engine compatibility at the floor, run both local environments, and inspect
`npm audit` findings. The audit is a point-in-time advisory check, not a release
qualification or an assertion that dependencies can never be vulnerable.
