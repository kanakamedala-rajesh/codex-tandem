// Preparation validation only. Accounting replay belongs to the product seam.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const bytes = (path) => readFileSync(new URL(path, root));
const json = (path) => JSON.parse(bytes(path).toString('utf8'));
const fixture = json('docs/fixtures/accounting/golden.json');
const provenance = json('docs/fixtures/accounting/provenance.json');
const register = json('docs/requirements/Codex-Tandem-Requirements-Register.json');
const requirements = new Set(register.requirements.map(({ id }) => id));
const tests = new Set(register.requirements.flatMap((r) => r.acceptance_tests));
const pin = '516a1d6306559d8a607de84c4d76529160349ac8';
assert.equal(fixture.schema, 1);
assert.equal(provenance.schema, 1);
assert.equal(fixture.donorCommit, pin);
assert.equal(provenance.commit, pin);

const ids = new Set();
for (const scenario of fixture.cases) {
  assert(!ids.has(scenario.id), `duplicate scenario ${scenario.id}`);
  ids.add(scenario.id);
  assert(['donor', 'srs-extension'].includes(scenario.basis));
  assert(scenario.requirements.length && scenario.tests.length);
  for (const id of scenario.requirements) assert(requirements.has(id), `unknown requirement ${id}`);
  for (const id of scenario.tests) assert(tests.has(id), `unknown test ${id}`);
  assert(scenario.sources.length && Object.keys(scenario.expected).length);
  for (const source of scenario.sources) {
    assert(source.length && fixture.records[source[0]]?.type === 'session_meta');
    for (const name of source) assert(Object.hasOwn(fixture.records, name), `unknown record ${name}`);
  }
  for (const order of scenario.replayOrders ?? []) {
    assert(order.length);
    for (const index of order) assert(Number.isInteger(index) && scenario.sources[index]);
  }
  for (const key of ['vector', 'unresolvedVector']) {
    if (scenario.expected[key]) {
      assert.equal(scenario.expected[key].length, 5);
      for (const value of scenario.expected[key]) assert(/^\d+$/.test(value));
    }
  }
}
// A narrow metadata allowlist catches accidental addition of raw content fields.
const allowedKeys = new Set([
  'type', 'timestamp', 'payload', 'ordinal', 'id', 'source', 'parent_thread_id',
  'subagent_history_start_ordinal', 'turn_id', 'model', 'service_tier', 'thread_id',
  'response_id', 'usage', 'input_tokens', 'cached_input_tokens', 'cache_write_input_tokens',
  'output_tokens', 'reasoning_output_tokens', 'info', 'total_token_usage', 'last_token_usage',
  'rate_limits', 'limit_id', 'primary', 'window_minutes', 'used_percent', 'resets_at',
]);
function inspectRecord(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    assert(allowedKeys.has(key), `unreviewed fixture field ${key}`);
    inspectRecord(child);
  }
}
for (const record of Object.values(fixture.records)) inspectRecord(record);
for (const file of provenance.files) {
  assert(/^[a-f0-9]{64}$/.test(file.sha256));
  assert.equal(file.url, `https://raw.githubusercontent.com/kanakamedala-rajesh/codex-report/${pin}/${file.path}`);
}
const license = provenance.files.find(({ path }) => path === 'LICENSE');
assert(license);
assert.equal(createHash('sha256').update(bytes(provenance.notice)).digest('hex'), license.sha256);
console.log(JSON.stringify({
  result: 'PASS', scope: 'fixture definitions and license integrity only; product T01/T09/T26/T43 NOT EXECUTED',
  cases: ids.size, records: Object.keys(fixture.records).length,
  node: process.version, platform: process.platform, arch: process.arch,
  fixtureSha256: createHash('sha256').update(bytes('docs/fixtures/accounting/golden.json')).digest('hex'),
  command: 'node tools/verify-accounting-fixtures.mjs',
  root: fileURLToPath(root),
}, null, 2));
