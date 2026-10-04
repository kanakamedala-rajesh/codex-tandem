import {
  bindingScope,
  acquireRecoveryMutex,
  acquireBindingLease,
} from './binding-lock.js';
import { claimPrivateState } from './private-state.js';
import { realpath, stat, lstat, rm, rename, open } from 'node:fs/promises';
import { join, resolve, isAbsolute } from 'node:path';
import { randomUUID, randomBytes } from 'node:crypto';
import {
  privateDirectory,
  writePrivate,
  writePrivateBatch,
  verifyPrivate,
} from './private-files.js';
import { canonicalPath } from './discovery.js';
import {
  processIdentity,
  operatingEnvironment,
  inspectProcesses,
  proveManagedProcess,
  type ScopedProcess,
  type ManagedProcess,
  type ProcessIdentity,
} from './processes.js';
/** Existing local paths protected by a manager. The binding file is identified physically but its credential bytes are never read. */
export type GuardOptions = {
  stateHome: string;
  codexHome: string;
  bindingPath: string;
  analyticsPath?: string;
  /** Select a canonical executable file; its physical identity is retained for scope checks and recovery. Omission records native Codex-name selection. */
  codexExecutable?: string;
};
/** An exclusive local installation/home/binding lease. Retain it while any protected process or ownership ambiguity remains. */
export type GuardLease = {
  nonce: string;
  /** Register a native descendant of this manager; rejects unrelated PIDs, changed executable identity and another home. */
  registerProcess: (pid: number) => Promise<void>;
  /** Recheck locks, physical paths and process identities before switching. Any active or ambiguous scoped process blocks. */
  revalidate: () => Promise<void>;
  /** Release only this nonce's locks after idle revalidation. A replaced owner or surviving child leaves scopes held. */
  release: () => Promise<void>;
};
type OwnerRecord = {
  schemaVersion: 1;
  kind: 'guard';
  nonce: string;
  owner: ProcessIdentity;
  home: string;
  homeIdentity: string;
  binding: string;
  inventory: {
    codexExecutable: string | null;
    executableIdentity: string | null;
  };
  processes: ManagedProcess[];
};
const identifier = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length < 4096 &&
  !/[\p{Cc}\p{Cf}]/u.test(value);
const validIdentity = (value: ProcessIdentity) =>
  value &&
  Number.isSafeInteger(value.pid) &&
  value.pid > 0 &&
  identifier(value.creation) &&
  ['windows', 'wsl', 'linux'].includes(value.environment);
async function metadata(path: string, limit: number) {
  const handle = await open(path, 'r');
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > limit)
      throw new Error('LOCK_OWNER_INVALID');
    const bytes = Buffer.alloc(limit + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > limit) throw new Error('LOCK_OWNER_INVALID');
    try {
      const value = JSON.parse(bytes.subarray(0, bytesRead).toString('utf8'));
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error();
      return value;
    } catch {
      throw new Error('LOCK_OWNER_INVALID');
    }
  } finally {
    await handle.close();
  }
}
async function record(
  path: string,
  privateChecked = false,
): Promise<OwnerRecord> {
  if (!privateChecked) await verifyPrivate(path);
  const value = await metadata(path, 65536);
  if (
    value.schemaVersion !== 1 ||
    value.kind !== 'guard' ||
    !identifier(value.nonce) ||
    !/^[a-f0-9]{64}$/.test(value.nonce) ||
    !validIdentity(value.owner) ||
    !identifier(value.home) ||
    !identifier(value.homeIdentity) ||
    !identifier(value.binding) ||
    !value.inventory ||
    typeof value.inventory !== 'object' ||
    Array.isArray(value.inventory) ||
    Object.keys(value.inventory).length !== 2 ||
    !(
      (value.inventory.codexExecutable === null &&
        value.inventory.executableIdentity === null) ||
      (identifier(value.inventory.codexExecutable) &&
        isAbsolute(value.inventory.codexExecutable) &&
        typeof value.inventory.executableIdentity === 'string' &&
        /^\d+:\d+$/.test(value.inventory.executableIdentity))
    ) ||
    !Array.isArray(value.processes) ||
    value.processes.length > 128 ||
    value.processes.some(
      (p: ManagedProcess) =>
        !validIdentity(p) ||
        p.nonce !== value.nonce ||
        p.environment !== value.owner.environment ||
        !identifier(p.executable) ||
        p.codexHome !== value.home ||
        !validIdentity(p.parent),
    )
  )
    throw new Error('LOCK_OWNER_INVALID');
  return value;
}
async function sameOwner(
  path: string,
  expected: OwnerRecord,
  privateChecked = false,
) {
  const actual = await record(join(path, 'owner.json'), privateChecked);
  if (
    actual.nonce !== expected.nonce ||
    actual.owner.creation !== expected.owner.creation ||
    actual.owner.pid !== expected.owner.pid ||
    actual.owner.environment !== expected.owner.environment ||
    actual.home !== expected.home ||
    actual.homeIdentity !== expected.homeIdentity ||
    actual.binding !== expected.binding ||
    actual.inventory.codexExecutable !== expected.inventory.codexExecutable ||
    actual.inventory.executableIdentity !==
      expected.inventory.executableIdentity
  )
    throw new Error('LOCK_OWNER_CHANGED');
}
async function verifyInventory(inventory: OwnerRecord['inventory']) {
  if (inventory.codexExecutable === null) return;
  const physical = await realpath(inventory.codexExecutable);
  const identity = await stat(physical, { bigint: true });
  if (
    physical !== inventory.codexExecutable ||
    !identity.isFile() ||
    `${identity.dev}:${identity.ino}` !== inventory.executableIdentity
  )
    throw new Error('PROCESS_EXECUTABLE_CHANGED');
}
async function childrenGone(children: ManagedProcess[]) {
  for (const child of children) {
    const actual = await processIdentity(child.pid);
    if (actual) {
      if (
        actual.creation !== child.creation ||
        actual.environment !== child.environment
      )
        throw new Error('PID_REUSED');
      throw new Error('ACTIVE_SCOPED_PROCESS');
    }
  }
}
async function createLock(
  path: string,
  code: string,
  expected: OwnerRecord,
  allowMutationRecovery = true,
) {
  try {
    await privateDirectory(path, { exclusive: true });
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
  }
  const old = await lstat(path, { bigint: true });
  if (!old.isDirectory() || old.isSymbolicLink())
    throw new Error('LOCK_OWNER_INVALID');
  const recovery = await acquireRecoveryMutex(path);
  try {
    const raw = await metadata(join(path, 'owner.json'), 65536);
    if (raw.kind === 'binding-mutation') {
      if (
        !allowMutationRecovery ||
        code !== 'BINDING_BUSY' ||
        path !== expected.binding + '.tandem-binding.lock'
      )
        throw new Error(code);
      // Mutation recovery owns this same mutex; release ours before transferring through that boundary.
      await recovery.release();
      const mutation = await acquireBindingLease(expected.binding);
      await mutation.release();
      await createLock(path, code, expected, false);
      return;
    }
    const previous = await record(join(path, 'owner.json'));
    if (previous.owner.environment !== expected.owner.environment)
      throw new Error('LOCK_ENVIRONMENT_FOREIGN');
    const current = await processIdentity(previous.owner.pid);
    if (current) {
      if (current.creation !== previous.owner.creation)
        throw new Error('PID_REUSED');
      throw new Error(code);
    }
    await childrenGone(previous.processes);
    const priorHome = await realpath(previous.home);
    const priorIdentity = await stat(priorHome, { bigint: true });
    if (
      priorHome !== previous.home ||
      !priorIdentity.isDirectory() ||
      `${priorIdentity.dev}:${priorIdentity.ino}` !== previous.homeIdentity
    )
      throw new Error('SCOPE_PATH_CHANGED');
    // The requested home may differ while installation or binding protection is shared.
    await verifyInventory(previous.inventory);
    if (
      (
        await inspectProcesses(
          {
            codexHome: priorHome,
            codexExecutable: previous.inventory.codexExecutable ?? undefined,
          },
          previous.processes,
        )
      ).some((p) => p.ownership !== 'unrelated')
    )
      throw new Error('ACTIVE_SCOPED_PROCESS');
    await verifyInventory(previous.inventory);
    const confirmedHome = await realpath(previous.home);
    const confirmedIdentity = await stat(confirmedHome, { bigint: true });
    if (
      confirmedHome !== priorHome ||
      `${confirmedIdentity.dev}:${confirmedIdentity.ino}` !==
        previous.homeIdentity
    )
      throw new Error('SCOPE_PATH_CHANGED');
    // Recovery is serialized separately; incomplete recovery ownership is never guessed or expired by time.
    await sameOwner(path, previous);
    const currentDirectory = await lstat(path, { bigint: true });
    if (
      currentDirectory.dev !== old.dev ||
      currentDirectory.ino !== old.ino ||
      currentDirectory.isSymbolicLink()
    )
      throw new Error('LOCK_OWNER_CHANGED');
    const confirmedOwner = await processIdentity(previous.owner.pid);
    if (confirmedOwner) {
      if (confirmedOwner.creation !== previous.owner.creation)
        throw new Error('PID_REUSED');
      throw new Error(code);
    }
    const retired = path + '.retired-' + randomUUID();
    await rename(path, retired);
    const moved = await lstat(retired, { bigint: true });
    if (
      moved.dev !== old.dev ||
      moved.ino !== old.ino ||
      moved.isSymbolicLink()
    )
      throw new Error('LOCK_OWNER_CHANGED');
    await sameOwner(retired, previous);
    await rm(retired, { recursive: true });
    await privateDirectory(path, { exclusive: true });
  } finally {
    await recovery.release();
  }
}
async function analyticsOwner(path: string, environment: string) {
  const canonical = await canonicalPath(resolve(path));
  const destinationExists = async () => {
    if ((await canonicalPath(resolve(path))) !== canonical)
      throw new Error('ANALYTICS_PATH_CHANGED');
    try {
      const info = await lstat(canonical);
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)
        throw new Error('ANALYTICS_ALIAS_UNSUPPORTED');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return false;
    }
  };
  const existing = await destinationExists();
  const marker = canonical + '.tandem-environment';
  try {
    await lstat(marker);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    if (existing) throw new Error('ANALYTICS_OWNER_REQUIRED', { cause: error });
  }
  try {
    await privateDirectory(marker, { exclusive: true });
    const created = await lstat(marker, { bigint: true });
    const ownerFile = join(marker, 'owner.json');
    const expected = {
      schemaVersion: 1,
      environment,
      nonce: randomBytes(32).toString('hex'),
    };
    let published = false;
    try {
      if (await destinationExists())
        throw new Error('ANALYTICS_OWNER_REQUIRED');
      await writePrivate(ownerFile, JSON.stringify(expected));
      published = true;
      if (await destinationExists())
        throw new Error('ANALYTICS_OWNER_REQUIRED');
    } catch (error) {
      const current = await lstat(marker, { bigint: true });
      if (
        current.isSymbolicLink() ||
        current.dev !== created.dev ||
        current.ino !== created.ino
      )
        throw new Error('ANALYTICS_OWNER_CHANGED', { cause: error });
      try {
        await verifyPrivate([marker, ownerFile]);
        const actual = await metadata(ownerFile, 1024);
        if (JSON.stringify(actual) !== JSON.stringify(expected))
          throw new Error('ANALYTICS_OWNER_CHANGED', { cause: error });
      } catch (check) {
        if ((check as NodeJS.ErrnoException).code !== 'ENOENT') throw check;
        if (published)
          throw new Error('ANALYTICS_OWNER_CHANGED', { cause: check });
      }
      await rm(marker, { recursive: true });
      throw error;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    // Foreign markers are read as bounded metadata without changing their ACLs or opening the DB.
    const file = join(marker, 'owner.json');
    const info = await lstat(file);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 1024)
      throw new Error('ANALYTICS_OWNER_INVALID', { cause: error });
    const value = await metadata(file, 1024);
    if (
      value.schemaVersion !== 1 ||
      !['windows', 'wsl', 'linux'].includes(value.environment)
    )
      throw new Error('ANALYTICS_OWNER_INVALID', { cause: error });
    if (value.environment !== environment)
      throw new Error('SHARED_ANALYTICS_STORE', { cause: error });
    await verifyPrivate(marker);
    await verifyPrivate(file);
  }
}
/** Inspect a canonical home's native process inventory and private managed records. Does not acquire locks, open analytics or read credentials. */
export async function processesForScope(options: {
  codexHome: string;
  codexExecutable?: string;
}): Promise<ScopedProcess[]> {
  const home = await realpath(resolve(options.codexHome));
  let managed: ManagedProcess[] = [];
  try {
    const value = await record(join(home, '.tandem-home.lock', 'owner.json'));
    if (value.owner.environment === (await operatingEnvironment()))
      managed = value.processes;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return inspectProcesses({ ...options, codexHome: home }, managed);
}
/** Acquire local installation, physical Codex home and mutable binding protection. Refuses scoped conflicts, unmarked existing analytics and foreign ownership; verifies prior scopes before stale recovery, transfers proved-dead binding mutations through their owned mutex, and rolls back only this attempt's locks. */
export async function acquireGuard(options: GuardOptions): Promise<GuardLease> {
  const root = await claimPrivateState(
    resolve(options.stateHome),
    'installation',
  );
  const home = await realpath(resolve(options.codexHome));
  const homeStat = await stat(home, { bigint: true });
  if (!homeStat.isDirectory()) throw new Error('HOME_INVALID');
  const { binding, lockPath: bindingLock } = await bindingScope(
    options.bindingPath,
  );
  const info = await stat(binding);
  if (!info.isFile() || info.nlink !== 1)
    throw new Error('BINDING_ALIAS_UNSUPPORTED');
  const owner = await processIdentity(process.pid);
  if (!owner) throw new Error('PROCESS_IDENTITY_UNAVAILABLE');
  const inventory: OwnerRecord['inventory'] = {
    codexExecutable: null,
    executableIdentity: null,
  };
  if (options.codexExecutable !== undefined) {
    inventory.codexExecutable = await realpath(
      resolve(options.codexExecutable),
    );
    const executableIdentity = await stat(inventory.codexExecutable, {
      bigint: true,
    });
    if (!executableIdentity.isFile())
      throw new Error('PROCESS_EXECUTABLE_INVALID');
    inventory.executableIdentity = `${executableIdentity.dev}:${executableIdentity.ino}`;
  }
  const scopeOptions = {
    codexHome: home,
    codexExecutable: inventory.codexExecutable ?? undefined,
  };
  await analyticsOwner(
    options.analyticsPath ?? join(root, 'analytics.sqlite'),
    owner.environment,
  );
  const expected: OwnerRecord = {
    schemaVersion: 1,
    kind: 'guard',
    nonce: randomBytes(32).toString('hex'),
    owner,
    home,
    homeIdentity: `${homeStat.dev}:${homeStat.ino}`,
    binding,
    inventory,
    processes: [],
  };
  if (
    (await processesForScope(scopeOptions)).some(
      (p) => p.ownership !== 'unrelated',
    )
  )
    throw new Error('SCOPED_PROCESSES_CONFLICT');
  await claimPrivateState(home, 'codex-home');
  const acquired: { path: string; dev: bigint; ino: bigint }[] = [];
  try {
    for (const [path, code] of [
      [join(root, 'manager.lock'), 'INSTALLATION_BUSY'],
      [join(home, '.tandem-home.lock'), 'HOME_BUSY'],
      [bindingLock, 'BINDING_BUSY'],
    ]) {
      await createLock(path, code, expected);
      const identity = await stat(path, { bigint: true });
      acquired.push({ path, dev: identity.dev, ino: identity.ino });
    }
    await writePrivateBatch(
      acquired.map(({ path }) => ({
        path: join(path, 'owner.json'),
        bytes: JSON.stringify(expected),
      })),
    );
    if (
      (await processesForScope(scopeOptions)).some(
        (p) => p.ownership !== 'unrelated',
      )
    )
      throw new Error('SCOPED_PROCESSES_CONFLICT');
  } catch (error) {
    for (const entry of acquired.reverse()) {
      const current = await lstat(entry.path, { bigint: true });
      if (
        current.dev !== entry.dev ||
        current.ino !== entry.ino ||
        current.isSymbolicLink()
      )
        throw new Error('LOCK_ROLLBACK_UNPROVEN', { cause: error });
      try {
        await sameOwner(entry.path, expected);
      } catch (check) {
        if ((check as NodeJS.ErrnoException).code !== 'ENOENT') throw check;
      }
      await rm(entry.path, { recursive: true });
    }
    throw error;
  }
  let released = false;
  const verifyLocks = async () => {
    if (released) throw new Error('GUARD_RELEASED');
    await verifyInventory(inventory);
    const current = await processIdentity(process.pid);
    if (
      !current ||
      current.creation !== owner.creation ||
      current.environment !== owner.environment
    )
      throw new Error('LOCK_OWNER_CHANGED');
    const physical = await realpath(resolve(options.codexHome)),
      now = await stat(physical, { bigint: true });
    if (
      physical !== home ||
      `${now.dev}:${now.ino}` !== expected.homeIdentity ||
      (await realpath(resolve(options.bindingPath))) !== binding ||
      (await realpath(resolve(options.stateHome))) !== root
    )
      throw new Error('SCOPE_PATH_CHANGED');
    await verifyPrivate(acquired.map(({ path }) => join(path, 'owner.json')));
    for (const { path } of acquired) await sameOwner(path, expected, true);
  };
  const revalidate = async () => {
    await verifyLocks();
    await childrenGone(expected.processes);
    if (
      (await inspectProcesses(scopeOptions, expected.processes)).some(
        (p) => p.ownership !== 'unrelated',
      )
    )
      throw new Error('ACTIVE_SCOPED_PROCESS');
  };
  return {
    nonce: expected.nonce,
    revalidate,
    registerProcess: async (pid) => {
      await verifyLocks();
      if (expected.processes.length >= 128)
        throw new Error('PROCESS_RECORD_LIMIT');
      const child = await proveManagedProcess(
        pid,
        expected.nonce,
        home,
        scopeOptions.codexExecutable,
      );
      if (expected.processes.some((p) => p.pid === pid))
        throw new Error('PROCESS_ALREADY_REGISTERED');
      expected.processes.push(child);
      for (const { path } of acquired) await sameOwner(path, expected, true);
      await writePrivateBatch(
        acquired.map(({ path }) => ({
          path: join(path, 'owner.json'),
          bytes: JSON.stringify(expected),
        })),
      );
    },
    release: async () => {
      if (released) return;
      await revalidate();
      for (const { path, dev, ino } of [...acquired].reverse()) {
        const info = await lstat(path, { bigint: true });
        if (info.dev !== dev || info.ino !== ino || info.isSymbolicLink())
          throw new Error('LOCK_OWNER_CHANGED');
        await sameOwner(path, expected, true);
        await rm(path, { recursive: true });
      }
      released = true;
    },
  };
}
