import { open, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { canonicalPath } from './discovery.js';
import { operatingEnvironment } from './processes.js';
import {
  privateDirectory,
  verifyPrivate,
  writePrivate,
} from './private-files.js';

async function owner(marker: string): Promise<string> {
  const directory = await lstat(marker);
  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new Error('STATE_OWNER_INVALID');
  const path = join(marker, 'owner.json'),
    info = await lstat(path, { bigint: true });
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1n ||
    info.size > 1024n
  )
    throw new Error('STATE_OWNER_INVALID');
  const handle = await open(path, 'r');
  try {
    const opened = await handle.stat({ bigint: true });
    if (opened.dev !== info.dev || opened.ino !== info.ino || !opened.isFile())
      throw new Error('STATE_OWNER_INVALID');
    const bytes = Buffer.alloc(1025),
      { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 1024) throw new Error('STATE_OWNER_INVALID');
    try {
      const value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
      if (
        !value ||
        value.schemaVersion !== 1 ||
        !['windows', 'wsl', 'linux'].includes(value.environment)
      )
        throw new Error();
      return value.environment;
    } catch {
      throw new Error('STATE_OWNER_INVALID');
    }
  } finally {
    await handle.close();
  }
}
/**
 * Claim a private installation or existing native Codex home for this operating environment.
 * Foreign claims and unresolved legacy locks block adoption without changing their ACLs.
 * Installation roots are created privately; Codex-home permissions and credentials are untouched.
 * Inspect scoped Codex processes before first home adoption. Markers persist after lease release;
 * unmarked, unlocked state is first claimed locally, not treated as a migrated foreign store.
 * This native-home claim does not implement Docker target-home ownership or migration.
 */
export async function claimPrivateState(
  path: string,
  kind: 'installation' | 'codex-home',
): Promise<string> {
  const canonical = await canonicalPath(resolve(path)),
    environment = await operatingEnvironment();
  const marker = join(
    canonical,
    kind === 'installation'
      ? '.tandem-installation-owner'
      : '.tandem-native-home-owner',
  );
  const foreign =
    kind === 'installation' ? 'SHARED_STATE_STORE' : 'SHARED_NATIVE_HOME';
  const verify = async () => {
    let claimed: string;
    try {
      claimed = await owner(marker);
    } catch (error) {
      throw new Error('STATE_OWNER_INVALID', { cause: error });
    }
    if (claimed !== environment) throw new Error(foreign);
    await verifyPrivate([
      ...(kind === 'installation' ? [canonical] : []),
      marker,
      join(marker, 'owner.json'),
    ]);
  };
  let present = false;
  try {
    await lstat(marker);
    present = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (present) {
    await verify();
    return canonical;
  }
  for (const name of kind === 'installation'
    ? ['profiles.lock', 'manager.lock']
    : ['.tandem-home.lock']) {
    try {
      await lstat(join(canonical, name));
      throw new Error('STATE_OWNER_UNVERIFIED');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  if (kind === 'installation') await privateDirectory(canonical);
  else if (!(await lstat(canonical)).isDirectory())
    throw new Error('HOME_INVALID');
  try {
    await privateDirectory(marker, { exclusive: true });
    await writePrivate(
      join(marker, 'owner.json'),
      JSON.stringify({ schemaVersion: 1, environment }),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    await verify();
  }
  return canonical;
}
