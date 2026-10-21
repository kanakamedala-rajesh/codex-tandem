import { openSync, fstatSync, readSync, closeSync, lstatSync } from 'node:fs';
import { open, lstat, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { canonicalPath } from './discovery.js';
import { operatingEnvironment } from './processes.js';
import {
  privateDirectory,
  verifyPrivate,
  writePrivate,
} from './private-files.js';

/** Resolve the host installation root without creating or claiming it.
 * `home` overrides the OS default; `stateHome` retains the pre-release CLI alias.
 * Supplying both is ambiguous and throws. A legacy default requires explicit root
 * selection or migration before a new default can be used; no state is moved.
 * Relative XDG_STATE_HOME is ignored. Windows retains its pre-release default
 * pending the deferred Windows root migration. Callers still claim and verify
 * ownership before using the returned absolute path.
 */
export async function resolveStateHome(
  options: {
    home?: string;
    stateHome?: string;
  } = {},
): Promise<string> {
  if (options.home !== undefined && options.stateHome !== undefined)
    throw new Error('INVALID_ARGUMENTS');
  const explicit = options.home ?? options.stateHome;
  if (explicit !== undefined) {
    if (!explicit) throw new Error('INVALID_ARGUMENTS');
    return resolve(explicit);
  }
  const userHome = homedir();
  if (process.platform === 'win32')
    return join(userHome, '.codex-tandem-windows');
  const xdgState = process.env.XDG_STATE_HOME;
  const root = join(
    xdgState && isAbsolute(xdgState)
      ? xdgState
      : join(userHome, '.local', 'state'),
    'codex-tandem',
  );
  const legacy = join(userHome, '.codex-tandem');
  try {
    await lstat(legacy);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return resolve(root);
  }
  throw new Error('LEGACY_STATE_REQUIRES_EXPLICIT_HOME');
}

async function owner(marker: string): Promise<string> {
  const directory =
    process.platform === 'linux' ? lstatSync(marker) : await lstat(marker);
  if (!directory.isDirectory() || directory.isSymbolicLink())
    throw new Error('STATE_OWNER_INVALID');
  const path = join(marker, 'owner.json'),
    info =
      process.platform === 'linux'
        ? lstatSync(path, { bigint: true })
        : await lstat(path, { bigint: true });
  if (
    !info.isFile() ||
    info.isSymbolicLink() ||
    info.nlink !== 1n ||
    info.size > 1024n
  )
    throw new Error('STATE_OWNER_INVALID');
  const handle =
    process.platform === 'linux' ? openSync(path, 'r') : await open(path, 'r');
  try {
    const opened =
      typeof handle === 'number'
        ? fstatSync(handle, { bigint: true })
        : await handle.stat({ bigint: true });
    if (opened.dev !== info.dev || opened.ino !== info.ino || !opened.isFile())
      throw new Error('STATE_OWNER_INVALID');
    const bytes = Buffer.alloc(1025),
      bytesRead =
        typeof handle === 'number'
          ? readSync(handle, bytes, 0, bytes.length, 0)
          : (await handle.read(bytes, 0, bytes.length, 0)).bytesRead;
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
    if (typeof handle === 'number') closeSync(handle);
    else await handle.close();
  }
}
/**
 * Claim a private installation or existing native Codex home for this operating environment.
 * Foreign claims and unresolved legacy locks block adoption without changing their ACLs.
 * Installation roots are created privately, including missing parent directories with
 * POSIX mode 0700; existing ancestor permissions and Codex-home credentials are untouched.
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
    if (process.platform === 'linux') lstatSync(marker);
    else await lstat(marker);
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
  if (kind === 'installation') {
    await mkdir(dirname(canonical), { recursive: true, mode: 0o700 });
    await privateDirectory(canonical);
  } else if (!(await lstat(canonical)).isDirectory())
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
