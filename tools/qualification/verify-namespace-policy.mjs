// Compare against the independently observed policy; never contact Docker.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [baseline, observed] = process.argv.slice(2).map((path) => resolve(path));
assert.ok(baseline && observed, 'Provide baseline and observed profile paths');
const root = mkdtempSync(join(tmpdir(), 'ct07-policy-'));
const output = join(root, 'generated.json');
const generator = fileURLToPath(
  new URL('./generate-namespace-policy.mjs', import.meta.url),
);
const run = (input) =>
  spawnSync(process.execPath, [generator, input, output], { encoding: 'utf8' });
try {
  assert.equal(run(baseline).status, 0);
  assert.deepEqual(
    JSON.parse(readFileSync(output)),
    JSON.parse(readFileSync(observed)),
  );
  const before = readFileSync(output);
  assert.notEqual(
    run(baseline).status,
    0,
    'Existing profile must not be overwritten',
  );
  assert.deepEqual(readFileSync(output), before);
  const changed = join(root, 'changed.json');
  writeFileSync(
    changed,
    Buffer.concat([readFileSync(baseline), Buffer.from('\n')]),
  );
  const rejected = run(changed);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /Baseline SHA-256 mismatch/);
  assert.deepEqual(readFileSync(output), before);
  console.log(
    JSON.stringify({
      platform: process.platform,
      node: process.version,
      observedPolicyEquivalent: true,
      overwriteRejected: true,
      changedBaselineRejected: true,
    }),
  );
} finally {
  rmSync(root, { recursive: true });
}
