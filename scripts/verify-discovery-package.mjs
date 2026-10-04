import { execFileSync, spawnSync } from 'node:child_process';

import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { withTempPackage } from './temp-package.mjs';
import assert from 'node:assert/strict';
await withTempPackage(async ({ scratch, packageRoot, sha256 }) => {
  const entry = join(packageRoot, 'dist', 'cli.js');
  const args = [
    'doctor',
    '--json',
    '--target',
    'local',
    '--project-root',
    scratch,
    '--codex-home',
    join(scratch, 'not-created'),
    '--codex-executable',
    process.execPath,
  ];
  const report = JSON.parse(
    execFileSync(process.execPath, [entry, ...args], { encoding: 'utf8' }),
  );
  assert.equal(report.ok, true);
  assert.equal(report.targetDiscovery.fullTracking, false);
  assert.equal(report.targetDiscovery.paths.codexHomeExists, false);
  const { existsSync } = await import('node:fs');
  assert.equal(existsSync(join(scratch, 'not-created')), false);
  const { parseDiscoveryOptions } = await import(
    pathToFileURL(join(packageRoot, 'dist', 'discovery-options.js')).href
  );
  const { discoverTarget } = await import(
    pathToFileURL(join(packageRoot, 'dist', 'discovery.js')).href
  );
  const pin = parseDiscoveryOptions([
    '--target',
    'docker',
    '--container',
    'fixture',
    '--docker-context',
    'fixture',
    '--expected-daemon',
    'approved-daemon',
    '--expected-generation',
    'a'.repeat(64),
  ]);
  assert.equal(pin.expectedDaemonId, 'approved-daemon');
  assert.equal(pin.expectedGeneration, 'a'.repeat(64));
  const refused = await discoverTarget(pin, async (args) => {
    if (args[0] === 'context')
      return JSON.stringify('unix:///var/run/docker.sock');
    if (args.includes('info')) return JSON.stringify('other-daemon');
    throw new Error('wrong daemon must not be inspected or entered');
  });
  assert.equal(refused.ok, false);
  assert.deepEqual(refused.diagnostics, ['DOCKER_DAEMON_CHANGED_REVALIDATE']);
  assert.equal(refused.paths, undefined);
  const localPin = spawnSync(
    process.execPath,
    [
      entry,
      'doctor',
      '--json',
      '--target',
      'local',
      '--expected-daemon',
      'approved-daemon',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(localPin.status, 2);
  assert.equal(JSON.parse(localPin.stdout).code, 'INVALID_ARGUMENTS');
  const expectFailure = process.argv.includes('--expect-failure');
  const actualArgs = process.argv
    .slice(2)
    .filter((arg) => arg !== '--expect-failure');
  const actualRun = actualArgs.length
    ? spawnSync(process.execPath, [entry, 'doctor', '--json', ...actualArgs], {
        encoding: 'utf8',
      })
    : undefined;
  const actual = actualRun ? JSON.parse(actualRun.stdout) : undefined;
  if (actual) {
    assert.equal(actualRun.status, expectFailure ? 1 : 0);
    assert.equal(actual.ok, !expectFailure);
  }
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        platform: process.platform,
        node: process.version,
        packageSha256: sha256,
        command: 'installed codex-tandem ' + args.join(' '),
        result: report,
        dockerContractFixture: refused.diagnostics,
        localDaemonPin: 'INVALID_ARGUMENTS',
        ...(actual
          ? {
              actualCommand:
                'installed codex-tandem doctor --json ' + actualArgs.join(' '),
              actual,
            }
          : {}),
      },
      null,
      2,
    ),
  );
});
