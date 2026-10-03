import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Pack the current build and install its tarball offline into a private temporary
 * directory, with lifecycle scripts disabled. Must run via npm run; global chooses
 * an isolated global prefix. Calls verify with installation paths, pack metadata,
 * install output and the tarball SHA-256, awaits it, then removes the scratch
 * directory even on failure. Packing, installation and verifier errors propagate.
 */
export async function withTempPackage(verify, { global = false } = {}) {
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error('Run package verification via npm run');
  const scratch = mkdtempSync(join(tmpdir(), 'tandem-package-'));
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
    const prefix = global ? join(scratch, 'prefix') : scratch;
    const installLog = npmRun([
      'install',
      ...(global ? ['--global'] : []),
      '--prefix',
      prefix,
      '--ignore-scripts',
      '--offline',
      '--no-audit',
      '--loglevel',
      global ? 'notice' : 'error',
      tarball,
    ]);
    const packageRoot = join(
      prefix,
      ...(global && process.platform !== 'win32' ? ['lib'] : []),
      'node_modules',
      'codex-tandem',
    );
    await verify({
      scratch,
      prefix,
      packed,
      packageRoot,
      installLog,
      sha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'),
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
