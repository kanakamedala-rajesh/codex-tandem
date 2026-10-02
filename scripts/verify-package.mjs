import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run via npm run verify:package');
const scratch = mkdtempSync(join(tmpdir(), 'tandem-package-'));
const consumerEnv = {
  ...process.env,
  PATH: dirname(process.execPath),
  Path: dirname(process.execPath),
};
const npmRun = (args) =>
  execFileSync(
    process.execPath,
    [npm, ...args, '--cache', join(scratch, 'cache')],
    { encoding: 'utf8' },
  );
try {
  const packed = JSON.parse(
    npmRun([
      'pack',
      '--ignore-scripts',
      '--json',
      '--pack-destination',
      scratch,
    ]),
  )[0];
  const tarball = join(scratch, packed.filename);
  for (const file of packed.files)
    assert.match(file.path, /^(dist\/.*\.js|package\.json|README\.md)$/);
  const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.equal(Object.keys(manifest.dependencies ?? {}).length, 0);
  for (const hook of ['preinstall', 'install', 'postinstall'])
    assert.equal(manifest.scripts[hook], undefined);
  const installLog = npmRun([
    'install',
    '--global',
    '--prefix',
    join(scratch, 'prefix'),
    '--ignore-scripts',
    '--offline',
    '--no-audit',
    '--loglevel',
    'notice',
    tarball,
  ]);
  const base =
    process.platform === 'win32'
      ? join(scratch, 'prefix', 'node_modules')
      : join(scratch, 'prefix', 'lib', 'node_modules');
  const entry = join(base, 'codex-tandem', 'dist', 'cli.js');
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
        new URL('../test/fixtures/missing-builtins.mjs', import.meta.url).href,
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
        sha256: createHash('sha256')
          .update(readFileSync(tarball))
          .digest('hex'),
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
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
