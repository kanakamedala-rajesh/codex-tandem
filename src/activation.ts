import {
  openSync,
  fstatSync,
  readSync,
  closeSync,
  lstatSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { open, lstat, realpath, stat, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { claimPrivateState, resolveStateHome } from './private-state.js';
import {
  acquireProfileMutex,
  acquireBindingLease,
  type BindingLease,
} from './binding-lock.js';
import { acquireGuard, type GuardLease } from './scope-guard.js';
import {
  credentialIdentity,
  readProfileManifest,
  type Binding,
} from './profiles.js';
import {
  verifyActivationPolicy,
  type CodexCommand,
  type ResumePolicy,
} from './profile-login.js';
import {
  privateDirectory,
  verifyPrivate,
  writePrivateDurable,
  type PrivateWriteBoundary,
} from './private-files.js';
import { operatingEnvironment } from './processes.js';
import { homedir } from 'node:os';

/** Local activation inputs. Existing Codex policy is inspected under the guard; project and command must identify the intended invocation. */
export type ActivationOptions = {
  stateHome: string;
  codexHome: string;
  profileId: string;
  command: CodexCommand;
  projectPath: string;
  /** Qualified Codex config/feature flags used to inspect the same effective policy as the intended child. Launch argument passthrough remains the caller's responsibility. */
  policyArguments?: string[];
  /** Require fresh prepared resume metadata after effective-policy inspection and before credential or activation-journal writes. Throwing cancels activation under the retained guard. */
  validateResume?: (policy: ResumePolicy) => void | Promise<void>;
  operation?: 'activate' | 'recover' | 'sync';
  /** Observe actual credential/journal filesystem boundaries without receiving bytes. Throwing interrupts the operation for fault-injection verification. */
  boundary?: (
    record: string,
    event: PrivateWriteBoundary,
  ) => void | Promise<void>;
};
/** An activated identity protected until release. Releasing leaves the chosen credentials active for subsequent plain Codex use. */
export type ActivationLease = {
  /** Register this manager's freshly verified native child under the retained guard. Surviving or ambiguous registered processes block sync/release; never stops a process. */
  registerProcess: (pid: number) => Promise<void>;
  /** Require unchanged live ownership, active binding and physical invocation paths pinned before policy inspection immediately before spawn. Throws on conflict; the caller must not execute a child after failure. This is a fresh check, not an atomic operating-system spawn guarantee. */
  revalidateBeforeLaunch: () => Promise<void>;
  /** Persist immutable intended-launch metadata before the caller releases a child to execute. Tracked failure cancels by throwing; explicitly requested untracked mode uses the private target journal and never claims tracked success. No successful-child status is recorded here. */
  prepareLaunch: (
    mode: 'tracked' | 'untracked',
  ) => Promise<{ id: string; path: string; mode: 'tracked' | 'untracked' }>;
  /** Save current target refreshes only when they match this lease's binding after child exit. Mismatch or sync failure throws and preserves the target file for recovery. */
  syncAfterExit: () => Promise<void>;
  /** Revalidate process ownership and release this operation's leases. Active or ambiguous processes keep protection held. */
  release: () => Promise<void>;
};
/** Read bounded owner-only saved credential bytes through verified native file identity. Linux uses fresh bounded descriptor reads; no contents are cached. Links, hardlinks, changed files and inaccessible permissions throw without exposing contents. */
export async function readPrivateCredential(path: string): Promise<Buffer> {
  await verifyPrivate(path);
  const info =
    process.platform === 'linux' ? lstatSync(path) : await lstat(path);
  if (!info.isFile() || info.nlink !== 1 || info.size > 65536)
    throw new Error('CREDENTIAL_INVALID');
  const handle =
    process.platform === 'linux' ? openSync(path, 'r') : await open(path, 'r');
  try {
    const opened =
      typeof handle === 'number' ? fstatSync(handle) : await handle.stat();
    if (
      opened.dev !== info.dev ||
      opened.ino !== info.ino ||
      opened.size > 65536
    )
      throw new Error('CREDENTIAL_CHANGED');
    const bytes = Buffer.alloc(65537),
      bytesRead =
        typeof handle === 'number'
          ? readSync(handle, bytes, 0, bytes.length, 0)
          : (await handle.read(bytes, 0, bytes.length, 0)).bytesRead;
    if (bytesRead > 65536) throw new Error('CREDENTIAL_INVALID');
    return bytes.subarray(0, bytesRead);
  } finally {
    if (typeof handle === 'number') closeSync(handle);
    else await handle.close();
  }
}
function matches(bytes: Buffer, binding: Binding): boolean {
  const actual = credentialIdentity(bytes);
  return (
    actual.account === binding.account && actual.subject === binding.subject
  );
}
type Active = {
  schemaVersion: 1;
  home: string;
  generation: string;
  profileId: string;
  bindingId: string;
  transactionId: string;
};
type Transaction = {
  schemaVersion: 1;
  id: string;
  home: string;
  generation: string;
  selected: { profileId: string; bindingId: string };
  outgoing: Active | null;
  resolved: { profileId: string; bindingId: string } | null;
  phase:
    'begun' | 'outgoing-saved' | 'staged' | 'replaced' | 'active' | 'complete';
};
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value);
const ref = (value: unknown, prefix: string): value is string =>
  typeof value === 'string' &&
  value.startsWith(prefix + '_') &&
  uuid(value.slice(prefix.length + 1));
async function metadata(path: string): Promise<unknown> {
  const bytes = await optionalBytes(path);
  if (!bytes) return undefined;
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error('ACTIVATION_STATE_INVALID');
  }
}
function activeRecord(
  value: unknown,
  home: string,
  generation: string,
): Active | undefined {
  if (value === undefined) return undefined;
  const v = value as Active;
  if (
    !v ||
    Object.keys(v).sort().join() !==
      [
        'schemaVersion',
        'home',
        'generation',
        'profileId',
        'bindingId',
        'transactionId',
      ]
        .sort()
        .join() ||
    v.schemaVersion !== 1 ||
    v.home !== home ||
    v.generation !== generation ||
    !ref(v.profileId, 'profile') ||
    !ref(v.bindingId, 'binding') ||
    !uuid(v.transactionId)
  )
    throw new Error('ACTIVATION_STATE_INVALID');
  return v;
}
function transactionRecord(
  value: unknown,
  home: string,
  generation: string,
): Transaction | undefined {
  if (value === undefined) return undefined;
  const v = value as Transaction;
  if (
    !v ||
    Object.keys(v).sort().join() !==
      [
        'schemaVersion',
        'id',
        'home',
        'generation',
        'selected',
        'outgoing',
        'resolved',
        'phase',
      ]
        .sort()
        .join() ||
    v.schemaVersion !== 1 ||
    v.home !== home ||
    v.generation !== generation ||
    !uuid(v.id) ||
    !v.selected ||
    Object.keys(v.selected).sort().join() !== 'bindingId,profileId' ||
    !ref(v.selected.profileId, 'profile') ||
    !ref(v.selected.bindingId, 'binding') ||
    ![
      'begun',
      'outgoing-saved',
      'staged',
      'replaced',
      'active',
      'complete',
    ].includes(v.phase)
  )
    throw new Error('ACTIVATION_STATE_INVALID');
  if (v.outgoing !== null) activeRecord(v.outgoing, home, generation);
  if (
    v.resolved !== null &&
    (!v.resolved ||
      Object.keys(v.resolved).sort().join() !== 'bindingId,profileId' ||
      !ref(v.resolved.profileId, 'profile') ||
      !ref(v.resolved.bindingId, 'binding'))
  )
    throw new Error('ACTIVATION_STATE_INVALID');
  if ((v.phase === 'complete') !== (v.resolved !== null))
    throw new Error('ACTIVATION_STATE_INVALID');
  return v;
}
/** Validate private activation metadata for the exact canonical home and target generation. Missing records are allowed; malformed, foreign or contradictory transaction state throws. */
export function validateActivationState(
  value: { active: unknown; transaction: unknown },
  home: string,
  generation: string,
): { active: Active | undefined; transaction: Transaction | undefined } {
  return {
    active: activeRecord(value.active ?? undefined, home, generation),
    transaction: transactionRecord(
      value.transaction ?? undefined,
      home,
      generation,
    ),
  };
}
async function optionalBytes(path: string) {
  try {
    return await readPrivateCredential(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    return undefined;
  }
}
/** Activate, recover or sync a saved local identity under native ownership and effective policy checks. Saves verified outgoing refreshes before target-filesystem replacement. Linux may reuse a coherent committed activation for the exact already-active profile/binding, retaining fresh policy/ownership checks and launch journaling. An interrupted operation may have installed new credentials; recovery retains current matching bytes and never automatically restores staging snapshots. */
export async function activateIdentity(
  options: ActivationOptions,
): Promise<ActivationLease> {
  if (
    options.operation !== undefined &&
    !['activate', 'recover', 'sync'].includes(options.operation)
  )
    throw new Error('ACTIVATION_OPERATION_INVALID');
  const root = await claimPrivateState(
    resolve(options.stateHome),
    'installation',
  );
  const mutex = await acquireProfileMutex(root);
  let guard: GuardLease | undefined;
  const others: BindingLease[] = [];
  try {
    const manifest = await readProfileManifest(root);
    const profile = manifest.profiles.find(
      (p) => p.id === options.profileId && p.status === 'available',
    );
    const selected = manifest.bindings.find(
      (b) => b.id === profile?.bindingId && !b.retired,
    );
    if (!profile || !selected) throw new Error('IDENTITY_UNKNOWN');
    const credentialPath = (id: string) =>
      join(root, 'credentials', id + '.json');
    guard = await acquireGuard({
      stateHome: root,
      codexHome: options.codexHome,
      bindingPath: credentialPath(selected.id),
      codexExecutable: options.command.executable,
    });
    const home =
      process.platform === 'linux'
        ? realpathSync.native(options.codexHome)
        : await realpath(options.codexHome);
    await verifyPrivate(home);
    const homeInfo =
      process.platform === 'linux'
        ? statSync(home, { bigint: true })
        : await stat(home, { bigint: true });
    const generation = `${await operatingEnvironment()}:${homeInfo.dev}:${homeInfo.ino}`;
    const project =
      process.platform === 'linux'
        ? realpathSync.native(resolve(options.projectPath))
        : await realpath(resolve(options.projectPath));
    if (
      !(
        process.platform === 'linux' ? statSync(project) : await stat(project)
      ).isDirectory()
    )
      throw new Error('PROJECT_INVALID');
    const executable =
      process.platform === 'linux'
        ? realpathSync.native(resolve(options.command.executable))
        : await realpath(resolve(options.command.executable));
    const prefix = await Promise.all(
      (options.command.prefix ?? []).map(async (p) => {
        const physical =
          process.platform === 'linux'
            ? realpathSync.native(resolve(p))
            : await realpath(resolve(p));
        if (
          !(
            process.platform === 'linux'
              ? statSync(physical)
              : await stat(physical)
          ).isFile()
        )
          throw new Error('CODEX_ENTRYPOINT_INVALID');
        return physical;
      }),
    );
    if (prefix.length > 1) throw new Error('CODEX_ENTRYPOINT_INVALID');
    const invocationPaths = await Promise.all(
      [
        options.codexHome,
        options.projectPath,
        options.command.executable,
        ...(options.command.prefix ?? []),
      ].map(async (path) => ({
        path: resolve(path),
        physical:
          process.platform === 'linux'
            ? realpathSync.native(resolve(path))
            : await realpath(resolve(path)),
        info:
          process.platform === 'linux'
            ? statSync(path, { bigint: true })
            : await stat(path, { bigint: true }),
      })),
    );
    await verifyActivationPolicy(
      {
        command: { executable, prefix },
        codexHome: home,
        stateHome: root,
        cwd: project,
        policyArguments: options.policyArguments,
        validateResume: options.validateResume,
      },
      selected.account,
    );
    const target = join(home, 'auth.json');
    const journal = await privateDirectory(join(home, '.tandem-activation'));
    const activePath = join(journal, 'active.json'),
      transactionPath = join(journal, 'transaction.json');
    const stage = join(journal, 'staged-auth.json');
    const write = async (
      record: string,
      path: string,
      bytes: string | Buffer,
      exclusive = false,
    ) => {
      await writePrivateDurable(path, bytes, {
        exclusive,
        boundary: async (event) => {
          await options.boundary?.(record, event);
          if (record === 'target' && event === 'replace:before') {
            await guard!.revalidate();
            const current = await optionalBytes(target);
            if (
              expectedTarget
                ? !current?.equals(expectedTarget)
                : current !== undefined
            )
              throw new Error('EXTERNAL_CREDENTIAL_CHANGE');
          }
        },
      });
    };
    let active = activeRecord(await metadata(activePath), home, generation);
    let transaction = transactionRecord(
      await metadata(transactionPath),
      home,
      generation,
    );
    const held = new Set([selected.id]);
    const bindingFor = (profileId: string, bindingId: string) => {
      const binding = manifest.bindings.find(
        (b) => b.id === bindingId && b.profileId === profileId && !b.retired,
      );
      if (
        !binding ||
        !manifest.profiles.some(
          (p) =>
            p.id === profileId &&
            p.bindingId === bindingId &&
            p.status === 'available',
        )
      )
        throw new Error('OUTGOING_BINDING_RECOVERY_REQUIRED');
      return binding;
    };
    const protect = async (binding: Binding) => {
      if (!held.has(binding.id)) {
        others.push(await acquireBindingLease(credentialPath(binding.id)));
        held.add(binding.id);
      }
    };
    const save = async (binding: Binding, bytes: Buffer, record: string) => {
      if (!matches(bytes, binding)) throw new Error('TARGET_BINDING_MISMATCH');
      await protect(binding);
      await guard!.revalidate();
      if (!(await readPrivateCredential(target)).equals(bytes))
        throw new Error('EXTERNAL_CREDENTIAL_CHANGE');
      await write(record, credentialPath(binding.id), bytes);
    };
    const recover = async () => {
      if (!transaction || transaction.phase === 'complete') return;
      if (
        active &&
        active.transactionId !== transaction.id &&
        active.transactionId !== transaction.outgoing?.transactionId
      )
        throw new Error('STALE_TRANSACTION_RECOVERY_REQUIRED');
      const bytes = await optionalBytes(target);
      if (!bytes) throw new Error('RECOVERABLE_CREDENTIAL_ALTERNATIVES');
      const chosen = bindingFor(
        transaction.selected.profileId,
        transaction.selected.bindingId,
      );
      const previous = transaction.outgoing
        ? bindingFor(
            transaction.outgoing.profileId,
            transaction.outgoing.bindingId,
          )
        : undefined;
      if (
        previous &&
        previous.id !== chosen.id &&
        matches(bytes, chosen) &&
        matches(bytes, previous) &&
        !(
          active?.transactionId === transaction.id &&
          active.bindingId === chosen.id &&
          active.profileId === chosen.profileId
        )
      )
        throw new Error('RECOVERABLE_CREDENTIAL_ALTERNATIVES');
      let binding: Binding, transactionId: string;
      if (matches(bytes, chosen)) {
        binding = chosen;
        transactionId = transaction.id;
      } else if (previous && matches(bytes, previous)) {
        binding = previous;
        transactionId = transaction.outgoing!.transactionId;
      } else throw new Error('RECOVERABLE_CREDENTIAL_ALTERNATIVES');
      await save(binding, bytes, 'recovery-refresh');
      active = {
        schemaVersion: 1,
        home,
        generation,
        profileId: binding.profileId,
        bindingId: binding.id,
        transactionId,
      };
      await write('recovery-active', activePath, JSON.stringify(active));
      transaction.phase = 'complete';
      transaction.resolved = {
        profileId: binding.profileId,
        bindingId: binding.id,
      };
      await write(
        'recovery-complete',
        transactionPath,
        JSON.stringify(transaction),
      );
      await rm(stage, { force: true });
    };
    await recover();
    const outgoing = await optionalBytes(target);
    const expectedTarget = outgoing;
    if (
      options.operation === 'recover' &&
      !active &&
      outgoing &&
      matches(outgoing, selected)
    ) {
      active = {
        schemaVersion: 1,
        home,
        generation,
        profileId: profile.id,
        bindingId: selected.id,
        transactionId: randomUUID(),
      };
      await save(selected, outgoing, 'recovery-adopt');
      await write('recovery-active', activePath, JSON.stringify(active));
    }
    if (outgoing) {
      if (!active) throw new Error('OUTGOING_BINDING_RECOVERY_REQUIRED');
      await save(
        bindingFor(active.profileId, active.bindingId),
        outgoing,
        'outgoing',
      );
    } else if (active) throw new Error('RECOVERABLE_CREDENTIAL_ALTERNATIVES');
    const reuseCommitted =
      process.platform === 'linux' &&
      active?.profileId === profile.id &&
      active.bindingId === selected.id &&
      transaction?.phase === 'complete' &&
      transaction.id === active.transactionId &&
      transaction.selected.profileId === profile.id &&
      transaction.selected.bindingId === selected.id &&
      transaction.resolved?.profileId === profile.id &&
      transaction.resolved.bindingId === selected.id;
    if ((options.operation ?? 'activate') === 'activate' && !reuseCommitted) {
      const bytes = await readPrivateCredential(credentialPath(selected.id));
      if (!matches(bytes, selected)) throw new Error('SAVED_BINDING_MISMATCH');
      transaction = {
        schemaVersion: 1,
        id: randomUUID(),
        home,
        generation,
        selected: { profileId: profile.id, bindingId: selected.id },
        outgoing: active ?? null,
        resolved: null,
        phase: 'begun',
      };
      const phase = async (value: Transaction['phase']) => {
        transaction!.phase = value;
        if (value === 'complete')
          transaction!.resolved = {
            profileId: profile.id,
            bindingId: selected.id,
          };
        await write(
          'journal-' + value,
          transactionPath,
          JSON.stringify(transaction),
        );
      };
      await phase('begun');
      await phase('outgoing-saved');
      await write('stage', stage, bytes);
      if (!matches(await readPrivateCredential(stage), selected))
        throw new Error('STAGED_BINDING_MISMATCH');
      await phase('staged');
      await guard.revalidate();
      const latest = await optionalBytes(target);
      if (outgoing ? !latest?.equals(outgoing) : latest !== undefined)
        throw new Error('EXTERNAL_CREDENTIAL_CHANGE');
      await write('target', target, await readPrivateCredential(stage));
      await phase('replaced');
      active = {
        schemaVersion: 1,
        home,
        generation,
        profileId: profile.id,
        bindingId: selected.id,
        transactionId: transaction.id,
      };
      await write('active', activePath, JSON.stringify(active));
      await phase('active');
      await phase('complete');
      await rm(stage, { force: true });
    } else if (!active || active.bindingId !== selected.id || !outgoing)
      throw new Error('TARGET_BINDING_MISMATCH');
    let released = false;
    let prepared = false;
    const revalidateBeforeLaunch = async () => {
      if (released) throw new Error('ACTIVATION_RELEASED');
      if (!prepared) throw new Error('LAUNCH_PREPARATION_REQUIRED');
      await guard!.revalidate();
      for (const path of invocationPaths) {
        const current =
          process.platform === 'linux'
            ? statSync(path.path, { bigint: true })
            : await stat(path.path, { bigint: true });
        if (
          (process.platform === 'linux'
            ? realpathSync.native(path.path)
            : await realpath(path.path)) !== path.physical ||
          current.dev !== path.info.dev ||
          current.ino !== path.info.ino ||
          (current.isFile() &&
            (current.size !== path.info.size ||
              current.mtimeNs !== path.info.mtimeNs))
        )
          throw new Error('LAUNCH_PATH_CHANGED');
      }
      const marker = activeRecord(await metadata(activePath), home, generation);
      if (
        !marker ||
        marker.transactionId !== active!.transactionId ||
        marker.bindingId !== selected.id ||
        marker.profileId !== profile.id
      )
        throw new Error('ACTIVE_BINDING_CHANGED');
      if (!matches(await readPrivateCredential(target), selected))
        throw new Error('TARGET_BINDING_MISMATCH');
    };
    return {
      revalidateBeforeLaunch,
      registerProcess: async (pid) => {
        if (released) throw new Error('ACTIVATION_RELEASED');
        if (!prepared) throw new Error('LAUNCH_PREPARATION_REQUIRED');
        await guard!.registerProcess(pid);
      },
      prepareLaunch: async (mode) => {
        if (released || prepared) throw new Error('LAUNCH_ALREADY_PREPARED');
        if (!['tracked', 'untracked'].includes(mode))
          throw new Error('TRACKING_MODE_INVALID');
        await guard!.revalidate();
        const current = await readPrivateCredential(target);
        const marker = activeRecord(
          await metadata(activePath),
          home,
          generation,
        );
        if (
          !marker ||
          marker.transactionId !== active!.transactionId ||
          marker.bindingId !== selected.id ||
          marker.profileId !== profile.id
        )
          throw new Error('ACTIVE_BINDING_CHANGED');
        if (!matches(current, selected) || active!.bindingId !== selected.id)
          throw new Error('TARGET_BINDING_MISMATCH');
        const id = randomUUID();
        const directory =
          mode === 'tracked'
            ? await privateDirectory(join(root, 'launches'))
            : journal;
        const path = join(directory, 'launch-' + id + '.json');
        await write(
          'launch',
          path,
          JSON.stringify({
            schemaVersion: 1,
            id,
            status: 'prepared',
            profileId: profile.id,
            bindingId: selected.id,
            target: 'local',
            targetGeneration: generation,
            projectPath: project,
            codexHome: home,
            codexExecutable: executable,
            codexEntrypoint: prefix[0] ?? null,
            mode,
          }),
          true,
        );
        prepared = true;
        return { id, path, mode };
      },
      syncAfterExit: async () => {
        if (released) throw new Error('ACTIVATION_RELEASED');
        const marker = activeRecord(
          await metadata(activePath),
          home,
          generation,
        );
        if (
          !marker ||
          marker.transactionId !== active!.transactionId ||
          marker.bindingId !== selected.id
        )
          throw new Error('ACTIVE_BINDING_CHANGED');
        await save(
          selected,
          await readPrivateCredential(target),
          'exit-refresh',
        );
      },
      release: async () => {
        if (released) throw new Error('ACTIVATION_RELEASED');
        await guard!.release();
        for (const lease of others.reverse()) await lease.release();
        await mutex.release();
        released = true;
      },
    };
  } catch (error) {
    try {
      await guard?.release();
    } finally {
      try {
        for (const lease of others.reverse()) await lease.release();
      } finally {
        await mutex.release();
      }
    }
    throw error;
  }
}

/** Activate a saved local profile, explicitly reconcile interrupted state, or sync the active binding. Root flags follow resolveStateHome before state access. Requires an existing executable and stable profile ID; never starts or stops Codex. Outputs references and redacted recovery errors only. */
export async function activationCommand(args: string[]): Promise<number> {
  const json = args.includes('--json');
  let lease: ActivationLease | undefined;
  try {
    const operation =
      args[0] === 'recover' || args[0] === 'sync'
        ? (args.shift() as 'recover' | 'sync')
        : 'activate';
    const values = new Map<string, string>();
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--json') continue;
      if (
        ![
          '--home',
          '--state-home',
          '--codex-home',
          '--identity',
          '--codex-executable',
          '--codex-script',
          '--project',
        ].includes(args[i]) ||
        !args[i + 1] ||
        values.has(args[i])
      )
        throw new Error('INVALID_ARGUMENTS');
      values.set(args[i], args[++i]);
    }
    if (!values.has('--identity') || !values.has('--codex-executable'))
      throw new Error('ACTIVATION_OPTIONS_REQUIRED');
    lease = await activateIdentity({
      stateHome: await resolveStateHome({
        home: values.get('--home'),
        stateHome: values.get('--state-home'),
      }),
      codexHome:
        values.get('--codex-home') ??
        process.env.CODEX_HOME ??
        join(homedir(), '.codex'),
      profileId: values.get('--identity')!,
      command: {
        executable: values.get('--codex-executable')!,
        ...(values.has('--codex-script')
          ? { prefix: [resolve(values.get('--codex-script')!)] }
          : {}),
      },
      projectPath: values.get('--project') ?? process.cwd(),
      operation,
    });
    await lease.release();
    lease = undefined;
    process.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        ok: true,
        status:
          operation === 'activate'
            ? 'activated'
            : operation === 'recover'
              ? 'recovered'
              : 'synced',
        profileId: values.get('--identity'),
      }) + '\n',
    );
    return 0;
  } catch (error) {
    const code = /^[A-Z_]+$/.test((error as Error).message)
      ? (error as Error).message
      : 'ACTIVATION_FAILED';
    let recoveryCode: string | undefined;
    try {
      await lease?.release();
    } catch (recovery) {
      const message = (recovery as Error).message;
      recoveryCode = /^[A-Z_]+$/.test(message) ? message : 'ACTIVATION_FAILED';
    }
    process.stderr.write(
      json
        ? JSON.stringify({
            schemaVersion: 1,
            ok: false,
            code,
            recoveryRequired: true,
            ...(recoveryCode ? { recoveryCode } : {}),
          }) + '\n'
        : code + ' RECOVERY_REQUIRED\n',
    );
    return 2;
  }
}
