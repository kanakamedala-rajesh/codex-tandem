import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const cli = new URL('../dist/cli.js', import.meta.url);
test('doctor emits clean versioned host capabilities with disposable self tests', () => {
  const run = spawnSync(process.execPath, [fileURLToPath(cli), 'doctor', '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.ok, true);
  assert.deepEqual(report.checks.map(c => [c.capability, c.status]), [['node','pass'],['sqlite','pass'],['gzip','pass'],['zstandard','pass']]);
  assert.equal(run.stdout.includes('\u001b'), false);
});

test('missing built-ins return actionable JSON without disclosing raw errors', () => {
  const fixture = new URL('./fixtures/missing-builtins.mjs', import.meta.url);
  const run = spawnSync(process.execPath, ['--import', fixture.href, fileURLToPath(cli), 'doctor', '--json'], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  const report = JSON.parse(run.stdout);
  assert.equal(report.ok, false);
  assert.deepEqual(report.checks.slice(1).map(c => c.status), ['fail','fail','fail']);
  for (const check of report.checks.slice(1)) assert.match(check.action, /host Node/);
  assert.doesNotMatch(run.stdout + run.stderr, /synthetic private path/);
});
