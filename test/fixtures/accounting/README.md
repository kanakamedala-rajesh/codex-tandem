# Accounting fixtures

`golden.json` contains synthetic metadata records and 18 accounting scenarios.
Each scenario names its source records, replay orders, expected result and
requirement IDs. Initialize fresh state per source; repeated source indexes mean
replay of the same content. Preserve record order within each source.

`basis: donor` identifies behavior inspected in the pinned codex-report source;
`srs-extension` identifies additional Tandem requirements. These are worked
examples, not captured executions. Identity context is explicit and prices are
fictional. No real credentials or conversation content is included.

`provenance.json` pins the inspected source and its license hashes. Preserve the
[MIT notice](../../../third_party/codex-report-MIT.txt) when reusing substantial
donor behavior or source. No donor runtime dependency is required.

Run `node tools/verify-accounting-fixtures.mjs` from the repository root to check
record bounds, metadata fields, requirement references and license integrity.
This validates the fixture definitions; accounting replay remains implementation
work tracked in [G3](https://github.com/kanakamedala-rajesh/codex-tandem/issues/6).
