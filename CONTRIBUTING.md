# Contributing

Use host Node >=22.15.0 with a maintained patch release. Install locked development
tools with `npm ci --ignore-scripts --engine-strict`. Runtime packages have no
production dependencies or installation lifecycle scripts.

Before handoff, run the applicable checks:

```sh
npm run validate
npm run verify:installed
node tools/verify-accounting-fixtures.mjs
python3 -B -m unittest discover -s test -p '*_test.py'
```

`validate` checks formatting, lint, types, build and JavaScript tests.
`verify:installed` exercises packed doctor, discovery and capture behavior in
temporary installations. Build first when running package checks independently.
On Windows use the available native Python executable instead of `python3`.

Run applicable checks on native Windows and `wsl -d Ubuntu`, recording results
separately. Serialize npm operations in a shared checkout; reinstall dependencies
after switching operating systems to recreate command shims. Docs/config changes
need formatting, syntax and link checks; runtime changes need behavioral checks.
CI supplements platform evidence. Native Linux and actual-target requirements
remain governed by the SRS.

The work distro `Ubuntu-24.04` and `ide` container are protected; execution or
mutation requires new explicit user authorization. Keep Windows protection enabled.
Actual Docker checks require an identified, approved disposable generation.

Format changed files with Prettier; use `npm run lint:fix` for lint fixes when
needed. Repository configuration defines whitespace and lint rules. Approved
requirements and accounting fixture bytes are excluded from formatting; preserve
their provenance. Add targeted lint exceptions rather than weakening global rules.

GitHub Actions runs validation and package/Python checks on Node 22.15.0, 22 and 24
Bookworm containers for PRs to `master` and branch pushes. Required check names:
`validate (Node 22.15.0)`, `validate (Node 22)`, `validate (Node 24)`.
The floor job proves compatibility, not that an old patch should be deployed.
PR runs measure the merge ref; push runs measure the branch SHA. Record head,
base and measured SHA when citing results. CI uses read-only permissions, pinned
Actions and a download cache; it does not publish packages or qualify actual targets.

Submit PRs to `master` in
[kanakamedala-rajesh/codex-tandem](https://github.com/kanakamedala-rajesh/codex-tandem).
Use [tracker-map.json](docs/planning/tracker-map.json) for issue identities.
Keep dependency versions exact in both manifests; check floor engines, applicable
platforms and `npm audit` after upgrades. Audit results are time-specific advisories.
