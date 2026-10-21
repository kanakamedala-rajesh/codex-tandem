import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { measureLaunch } from '../scripts/benchmark-launch.mjs';

const script = fileURLToPath(
  new URL('../scripts/benchmark-launch.mjs', import.meta.url),
);
const launch = (code, timeoutMs = 5000) =>
  measureLaunch(process.execPath, ['--input-type=module', '-e', code], {
    cwd: process.cwd(),
    env: process.env,
    timeoutMs,
  });

test('benchmark measures readiness before process completion', async () => {
  const value = await launch(
    "console.log('TANDEM_BENCHMARK_READY');setTimeout(()=>{},150)",
  );
  assert.ok(value.readinessMs > 0);
  assert.ok(value.completionMs - value.readinessMs >= 100);
});

test('benchmark rejects missing or misleading readiness and child diagnostics without leaking output', async () => {
  for (const [code, expected] of [
    ['', 'BENCHMARK_READINESS_MISSING'],
    ["console.log('PRIVATE-UNEXPECTED')", 'BENCHMARK_READINESS_INVALID'],
    [
      "console.log('TANDEM_BENCHMARK_READY');console.error('PRIVATE-ERROR')",
      'BENCHMARK_CHILD_DIAGNOSTIC',
    ],
    [
      "console.log('TANDEM_BENCHMARK_READY');process.exitCode=7",
      'BENCHMARK_CHILD_FAILED',
    ],
    [
      "console.log('TANDEM_BENCHMARK_READY');console.log('extra')",
      'BENCHMARK_READINESS_INVALID',
    ],
    ["console.log('x'.repeat(5000))", 'BENCHMARK_OUTPUT_LIMIT'],
  ])
    await assert.rejects(launch(code), { message: expected });
});

test('benchmark terminates an unready process on its deadline', async () => {
  await assert.rejects(
    launch("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)", 100),
    {
      message: 'BENCHMARK_TIMEOUT',
    },
  );
});

test('benchmark rejects insufficient qualification counts and invalid options before setup', () => {
  for (const [args, code] of [
    [['--samples=2'], 'BENCHMARK_DIAGNOSTIC_REQUIRED'],
    [['--warmups=0'], 'BENCHMARK_DIAGNOSTIC_REQUIRED'],
    [['--diagnostic', '--samples=0'], 'BENCHMARK_ARGUMENTS_INVALID'],
    [
      ['--diagnostic', '--samples=2', '--samples=3'],
      'BENCHMARK_ARGUMENTS_INVALID',
    ],
    [['--target=real'], 'BENCHMARK_ARGUMENTS_INVALID'],
    [['--identity-mode=unknown'], 'BENCHMARK_ARGUMENTS_INVALID'],
    [
      ['--identity-mode=same', '--identity-mode=alternating'],
      'BENCHMARK_ARGUMENTS_INVALID',
    ],
  ]) {
    const result = spawnSync(process.execPath, [script, ...args], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 2);
    assert.equal(result.stdout, '');
    assert.deepEqual(JSON.parse(result.stderr), {
      schemaVersion: 1,
      ok: false,
      code,
      fixtureOnly: true,
      releaseQualified: false,
    });
  }
});

test(
  'diagnostic benchmark exercises the guarded CLI and emits paired evidence without qualification',
  { timeout: 420000 },
  () => {
    const result = spawnSync(
      process.execPath,
      [script, '--diagnostic', '--warmups=0', '--samples=2'],
      {
        encoding: 'utf8',
        timeout: 400000,
        maxBuffer: 1024 * 1024,
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const evidence = JSON.parse(result.stdout);
    assert.equal(evidence.fixtureOnly, true);
    assert.equal(evidence.releaseQualified, false);
    assert.equal(evidence.fixtureBudget.result, 'DIAGNOSTIC_ONLY');
    assert.equal(evidence.configuration.identityMode, 'same');
    assert.deepEqual(evidence.launchesPerIdentity, [2, 0]);
    assert.deepEqual(evidence.pairingOrder, [
      'direct-wrapped',
      'wrapped-direct',
    ]);
    assert.match(
      evidence.identity.filesSha256['dist/cli.js'],
      /^[a-f0-9]{64}$/,
    );
    for (const metric of [evidence.readinessMs, evidence.completionMs]) {
      assert.equal(metric.direct.samples.length, 2);
      assert.equal(metric.wrapped.samples.length, 2);
      assert.deepEqual(
        metric.overhead.samples,
        metric.wrapped.samples.map(
          (value, i) => value - metric.direct.samples[i],
        ),
      );
      assert.equal(metric.overhead.p99, Math.max(...metric.overhead.samples));
    }
    assert.ok(
      evidence.completionMs.wrapped.samples.every(
        (value, i) => value >= evidence.readinessMs.wrapped.samples[i],
      ),
    );
    assert.doesNotMatch(
      result.stdout,
      /SYNTHETIC-ACCESS|refresh_token|account_id|TANDEM_BENCHMARK_STATE|ct11-activation-/,
    );
  },
);

test('alternating benchmark launches both saved identities rather than reusing one activation', () => {
  const result = spawnSync(
    process.execPath,
    [
      script,
      '--diagnostic',
      '--warmups=0',
      '--samples=2',
      '--identity-mode=alternating',
    ],
    { encoding: 'utf8', timeout: 400000, maxBuffer: 1024 * 1024 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const evidence = JSON.parse(result.stdout);
  assert.equal(evidence.configuration.identityMode, 'alternating');
  assert.deepEqual(evidence.launchesPerIdentity, [1, 1]);
  assert.equal(evidence.fixtureBudget.result, 'DIAGNOSTIC_ONLY');
});
