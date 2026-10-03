import { execFileSync, spawnSync } from 'node:child_process';

import { join } from 'node:path';
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
