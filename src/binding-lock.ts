import { open, lstat, stat, rm, rename } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';
import { canonicalPath } from './discovery.js';
import { processIdentity, type ProcessIdentity } from './processes.js';
import {
  privateDirectory,
  verifyPrivate,
  writePrivate,
} from './private-files.js';

type MutationKind =
  'binding-mutation' | 'profile-mutation' | 'mutation-recovery';
type MutationOwner = {
  schemaVersion: 1;
  kind: MutationKind;
  scope: string;
  nonce: string;
  owner: ProcessIdentity;
};
/** Resolve the shared physical binding and its lock directory. Absent destinations are allowed; existing hardlinked or non-file bindings are refused. */
export async function bindingScope(
  path: string,
): Promise<{ binding: string; lockPath: string }> {
  const binding = await canonicalPath(resolve(path));
  try {
    const info = await stat(binding);
    if (!info.isFile() || info.nlink !== 1)
      throw new Error('BINDING_ALIAS_UNSUPPORTED');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return { binding, lockPath: binding + '.tandem-binding.lock' };
}
/** A mutation lease. Only this nonce's directory can be released; ambiguous or replaced ownership remains held. */
export type BindingLease = {
  /** Verify native creation, directory identity and owner nonce, then release this mutation's lock. */
  release: () => Promise<void>;
};
async function readOwner(path: string): Promise<MutationOwner> {
  const file = join(path, 'owner.json');
  await verifyPrivate([path, file]);
  const handle = await open(file, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.nlink !== 1 || info.size > 8192)
      throw new Error('LOCK_OWNER_INVALID');
    const bytes = Buffer.alloc(8193),
      { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > 8192) throw new Error('LOCK_OWNER_INVALID');
    let value;
    try {
      value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
    } catch {
      throw new Error('LOCK_OWNER_INVALID');
    }
    if (
      !value ||
      value.schemaVersion !== 1 ||
      !['binding-mutation', 'profile-mutation', 'mutation-recovery'].includes(
        value.kind,
      ) ||
      Object.keys(value).some(
        (key) =>
          !['schemaVersion', 'kind', 'scope', 'nonce', 'owner'].includes(key),
      ) ||
      typeof value.scope !== 'string' ||
      value.scope.length > 4096 ||
      !value.scope ||
      typeof value.nonce !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.nonce) ||
      !value.owner ||
      !Number.isSafeInteger(value.owner.pid) ||
      value.owner.pid < 1 ||
      typeof value.owner.creation !== 'string' ||
      !value.owner.creation ||
      value.owner.creation.length > 4096 ||
      !['windows', 'wsl', 'linux'].includes(value.owner.environment) ||
      Object.keys(value.owner).some(
        (key) => !['pid', 'creation', 'environment'].includes(key),
      )
    )
      throw new Error('LOCK_OWNER_INVALID');
    return value;
  } finally {
    await handle.close();
  }
}
async function sameOwner(path: string, expected: MutationOwner) {
  if (JSON.stringify(await readOwner(path)) !== JSON.stringify(expected))
    throw new Error('LOCK_OWNER_CHANGED');
}
async function ownerGone(expected: MutationOwner, busy: string) {
  const actual = await processIdentity(expected.owner.pid);
  if (actual) {
    if (
      actual.creation !== expected.owner.creation ||
      actual.environment !== expected.owner.environment
    )
      throw new Error('PID_REUSED');
    throw new Error(busy);
  }
}
async function acquireMutation(
  lockPath: string,
  scope: string,
  kind: MutationKind,
  busy: string,
  depth = 0,
): Promise<BindingLease> {
  const owner = await processIdentity(process.pid);
  if (!owner) throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
  const expected: MutationOwner = {
    schemaVersion: 1,
    kind,
    scope,
    nonce: randomBytes(32).toString('hex'),
    owner,
  };
  try {
    await privateDirectory(lockPath, { exclusive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    let previous: MutationOwner;
    try {
      previous = await readOwner(lockPath);
    } catch (error) {
      if (
        (error as NodeJS.ErrnoException).code === 'ENOENT' ||
        (error as Error).message === 'LOCK_OWNER_INVALID'
      )
        throw new Error(busy, { cause: error });
      throw error;
    }
    if (previous.kind !== kind || previous.scope !== scope)
      throw new Error(busy, { cause: error });
    if (previous.owner.environment !== owner.environment)
      throw new Error('LOCK_ENVIRONMENT_FOREIGN', { cause: error });
    await ownerGone(previous, busy);
    if (depth >= 2) throw new Error('LOCK_RECOVERY_BUSY', { cause: error });
    const recovery = await acquireMutation(
      lockPath + '.recovery',
      lockPath,
      'mutation-recovery',
      'LOCK_RECOVERY_BUSY',
      depth + 1,
    );
    try {
      const old = await lstat(lockPath, { bigint: true });
      await sameOwner(lockPath, previous);
      await ownerGone(previous, busy);
      const retired = lockPath + '.retired-' + randomUUID();
      await rename(lockPath, retired);
      const moved = await lstat(retired, { bigint: true });
      if (
        old.dev !== moved.dev ||
        old.ino !== moved.ino ||
        moved.isSymbolicLink()
      )
        throw new Error('LOCK_OWNER_CHANGED', { cause: error });
      await sameOwner(retired, previous);
      await rm(retired, { recursive: true });
      await privateDirectory(lockPath, { exclusive: true });
    } finally {
      await recovery.release();
    }
  }
  const identity = await lstat(lockPath, { bigint: true });
  const unchangedDirectory = async () => {
    const current = await lstat(lockPath, { bigint: true });
    if (
      current.isSymbolicLink() ||
      current.dev !== identity.dev ||
      current.ino !== identity.ino
    )
      throw new Error('LOCK_OWNER_CHANGED');
  };
  try {
    await writePrivate(join(lockPath, 'owner.json'), JSON.stringify(expected));
  } catch (error) {
    await unchangedDirectory();
    try {
      await sameOwner(lockPath, expected);
    } catch (check) {
      if ((check as NodeJS.ErrnoException).code !== 'ENOENT') throw check;
    }
    await rm(lockPath, { recursive: true });
    throw error;
  }
  let released = false;
  return {
    release: async () => {
      if (released) return;
      const current = await processIdentity(process.pid);
      if (
        !current ||
        current.creation !== owner.creation ||
        current.environment !== owner.environment
      )
        throw new Error('LOCK_OWNER_CHANGED');
      await unchangedDirectory();
      await sameOwner(lockPath, expected);
      await rm(lockPath, { recursive: true });
      released = true;
    },
  };
}
/** Protect a canonical binding throughout credential publication, replacement or removal. Guard-owned or ambiguous locks always block. Proved-dead mutation owners can recover using nonce, native absence and directory identity, with at most two nested recovery locks; no descendants write saved bindings. */
export async function acquireBindingLease(path: string): Promise<BindingLease> {
  const { binding, lockPath } = await bindingScope(path);
  return acquireMutation(lockPath, binding, 'binding-mutation', 'BINDING_BUSY');
}
/** Serialize guard recovery under a nonce and native-owner lease. Known dead recovery owners may be reclaimed through at most two nested mutexes; ambiguous or replaced ownership remains held. */
export async function acquireRecoveryMutex(
  path: string,
): Promise<BindingLease> {
  const scope = await canonicalPath(resolve(path));
  return acquireMutation(
    scope + '.recovery',
    scope,
    'mutation-recovery',
    'LOCK_RECOVERY_BUSY',
  );
}
/** Serialize profile metadata mutations before binding leases are acquired. Known mutation owners may recover after native absence and nonce checks; legacy empty/ambiguous locks block. Recovery restores concurrency only, never credential transaction state. */
export async function acquireProfileMutex(root: string): Promise<BindingLease> {
  const scope = await canonicalPath(resolve(root));
  return acquireMutation(
    join(scope, 'profiles.lock'),
    scope,
    'profile-mutation',
    'PROFILE_STORE_BUSY',
  );
}
