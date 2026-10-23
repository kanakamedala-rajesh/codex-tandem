# Contributing

Use host Node >=22.15.0 with a maintained patch release. Install locked development
tools with `npm ci --ignore-scripts --engine-strict`. Runtime packages have no
production dependencies or installation lifecycle scripts.

After cloning, run `npm run setup:hooks` to enable the repository's pre-push hook.
This explicit setup is needed because dependency installation skips lifecycle
scripts. Keep Node and the development dependencies available when pushing from
either a terminal or a Git GUI. Existing custom hooks need manual integration
before changing `core.hooksPath`.

## Maintained files and public APIs

Every new file must implement a requirement, test observable behavior, support a
maintained build or validation command, or preserve necessary specification input.
Use existing modules before adding abstractions. Keep temporary scripts, logs,
reviews and run reports in ignored `.scratch/`, CI artifacts or the PR. Issues
own task criteria and status; do not create duplicate ticket documents. Preserve
approved requirements, reusable fixtures and inputs needed by later specs.

Document exported TypeScript APIs and publicly exposed methods with a concise
JSDoc summary. Explain purpose and, where non-obvious, input constraints, return
meaning, errors and side effects. Keep documentation next to the declaration and
update it with behavior changes. Avoid restating types or adding filler tags;
examples are useful when a caller cannot infer correct usage from the signature.

`npm run check:repo` checks repository contents, local Markdown links, package
boundaries and public API documentation. The pre-push hook checks committed trees
throughout the outgoing range, including files added and later deleted. Historical
commits before this policy first existed are excluded during initial rollout;
once enabled, removing the checker is a failure. CI repeats the range check and
validates the final candidate. Fetch remote refs before pushing a new branch.

These checks reject known mechanical problems; review decides whether code,
tests and documentation have a lasting purpose. Summarize new files and their use
in the PR. Review large changes against ticket scope, without arbitrary line caps.
Policy, hook and CI changes need explicit owner review. Agents must not skip hooks,
weaken checks or introduce exceptions to complete delivery. Hooks can be bypassed
by Git users, so require the CI matrix on `master` when repository protection is
available; CODEOWNERS alone does not enforce review.

## Validation

Before handoff, run the applicable checks:

```sh
npm run validate
npm run verify:installed
node tools/verify-accounting-fixtures.mjs
python3 -B -m unittest discover -s test -p '*_test.py'
```

`validate` checks repository policy, formatting, lint, types, build and JavaScript tests.
`verify:installed` exercises packed doctor, discovery and capture behavior in
temporary installations. Build first when running package checks independently.
On Windows use the available native Python executable instead of `python3`.

Run applicable checks on native Windows and `wsl -d Ubuntu`, recording results
separately. Serialize npm operations in a shared checkout; reinstall dependencies
after switching operating systems to recreate command shims. Docs/config changes
need formatting, syntax and link checks; runtime changes need behavioral checks.
CI supplements platform evidence. Native Linux and actual-target requirements
remain governed by the SRS.

Activation or durable private-file changes also require
`npm run verify:activation-recovery` on both platforms. This maintained synthetic
failure/abrupt-termination matrix is separate from ordinary tests and package checks
to avoid repeating costly native ownership reconstruction. `-- --list` reports exact
cases and shared-primitive coverage; `--start=N --end=N` selects a serialized range
and `--kind=failure|crash` selects fault type. Record every case/result when resuming;
partial ranges alone do not complete activation qualification.

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
