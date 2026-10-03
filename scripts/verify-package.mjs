import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { join, dirname } from 'node:path';
import { withTempPackage } from './temp-package.mjs';
import assert from 'node:assert/strict';
const consumerEnv = {
  ...process.env,
  PATH: dirname(process.execPath),
  Path: dirname(process.execPath),
};
await withTempPackage(
  async ({ scratch, packed, packageRoot, installLog, sha256 }) => {
    for (const file of packed.files)
      assert.match(file.path, /^(dist\/.*\.js|package\.json|README\.md)$/);
    const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
    assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
    for (const hook of ['preinstall', 'install', 'postinstall'])
      assert.equal(manifest.scripts[hook], undefined);
    execFileSync(
      process.execPath,
      ['--test', 'test/profiles.test.mjs', 'test/profile-login.test.mjs'],
      {
        encoding: 'utf8',
        env: { ...consumerEnv, TANDEM_TEST_PACKAGE: packageRoot },
        timeout: 180000,
        maxBuffer: 1048576,
      },
    );
    const entry = join(packageRoot, 'dist', 'cli.js');
    const direct = execFileSync(process.execPath, [entry, 'doctor', '--json'], {
      encoding: 'utf8',
      env: consumerEnv,
    });
    assert.equal(JSON.parse(direct).ok, true);
    const shimPath =
      process.platform === 'win32'
        ? join(scratch, 'prefix', 'codex-tandem.cmd')
        : join(scratch, 'prefix', 'bin', 'codex-tandem');
    const shim =
      process.platform === 'win32'
        ? execFileSync(
            process.env.ComSpec ?? 'cmd.exe',
            ['/d', '/s', '/c', `""${shimPath}" doctor --json"`],
            {
              encoding: 'utf8',
              windowsVerbatimArguments: true,
              env: consumerEnv,
            },
          )
        : execFileSync(shimPath, ['doctor', '--json'], {
            encoding: 'utf8',
            env: consumerEnv,
          });
    assert.equal(JSON.parse(shim).ok, true);
    const failure = await import('node:child_process').then(({ spawnSync }) =>
      spawnSync(
        process.execPath,
        [
          '--import',
          new URL('../test/fixtures/missing-builtins.mjs', import.meta.url)
            .href,
          entry,
          'doctor',
          '--json',
        ],
        { encoding: 'utf8' },
      ),
    );
    assert.equal(failure.status, 1);
    assert.equal(JSON.parse(failure.stdout).ok, false);
    console.log(
      JSON.stringify(
        {
          schemaVersion: 1,
          node: process.version,
          platform: process.platform,
          arch: process.arch,
          sha256: sha256,
          files: packed.files.map((f) => f.path),
          installLog,
          direct: JSON.parse(direct),
          shim: JSON.parse(shim),
          missingBuiltins: JSON.parse(failure.stdout),
        },
        null,
        2,
      ),
    );
  },
  { global: true },
);
