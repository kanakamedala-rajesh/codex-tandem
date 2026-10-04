import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { claimPrivateState } from './private-state.js';
import {
  acquireProfileMutex,
  acquireDockerBindingLease,
  type BindingLease,
} from './binding-lock.js';
import {
  readProfileManifest,
  credentialIdentity,
  type Binding,
} from './profiles.js';
import {
  readPrivateCredential,
  validateActivationState,
} from './activation.js';
import { verifyProjectedActivationPolicy } from './profile-login.js';
import { privateDirectory, writePrivateDurable } from './private-files.js';
import {
  openDockerRuntime,
  type DockerRuntime,
  type DockerControlTransport,
} from './docker-runtime.js';
import type { DockerTarget } from './docker-targets.js';

/** Explicit inputs for selected-only Docker activation. The named configuration is separate from the saved identity. Boundary observers receive metadata only and can interrupt a synthetic operation to verify recovery. */
export type DockerActivationOptions = {
  stateHome: string;
  profileId: string;
  target: DockerTarget;
  project: string;
  /** Original target spawn cwd followed by raw -C resolutions, each within its explicit mapped root. Omission pins the effective project as the cwd. */
  invocationPaths?: { path: string; root: string }[];
  /** Optional bounded project-scoped resume selection, resolved before any credential replacement. */
  resumeSelection?: string;
  policyArguments?: string[];
  transport?: DockerControlTransport;
  /** Observe a transaction boundary without credential payloads; rejection interrupts activation and retains recovery state. */
  boundary?: (phase: string, event: 'before' | 'after') => void | Promise<void>;
};
/** A Docker identity held under saved-binding and remote ownership until fresh process absence and credential synchronization are proved. */
export type DockerActivationLease = {
  /** Owned target runtime used for supervised launch and fresh inventory. */
  runtime: DockerRuntime;
  /** UUID proved within the target project before activation, when resume was requested. */
  resolvedResume?: string;
  /** Persist immutable intended-launch metadata before starting the target child. */
  prepareLaunch: (
    mode: 'tracked' | 'untracked',
  ) => Promise<{ id: string; mode: 'tracked' | 'untracked' }>;
  /** Save only current matching target refreshes after verified remote process absence. Target bytes remain recoverable on error. */
  syncAfterExit: () => Promise<void>;
  /** Recheck target ownership and selected active binding immediately before spawn. */
  revalidateBeforeLaunch: () => Promise<void>;
  /** Release remote and saved-binding ownership only after fresh remote idle proof. */
  release: () => Promise<void>;
};
const matches = (bytes: Buffer, binding: Binding) => {
  const value = credentialIdentity(bytes);
  return value.account === binding.account && value.subject === binding.subject;
};
/** Activate one saved identity inside a freshly pinned existing Docker target. Preserves validated outgoing refreshes before restricted target staging and atomic replacement. Interrupted transactions reconcile current matching bytes rather than reinstall old snapshots; client loss retains saved-binding ownership until native Docker recovery proves remote idle. */
export async function activateDockerIdentity(
  options: DockerActivationOptions,
): Promise<DockerActivationLease> {
  const root = await claimPrivateState(
      resolve(options.stateHome),
      'installation',
    ),
    mutex = await acquireProfileMutex(root);
  const bindings: BindingLease[] = [];
  let runtime: DockerRuntime | undefined;
  const scope = `docker:${options.target.daemonId}:${options.target.expectedContainerId}:${options.target.codexHome}`;
  try {
    const manifest = await readProfileManifest(root),
      profile = manifest.profiles.find(
        (p) => p.id === options.profileId && p.status === 'available',
      );
    const selected = manifest.bindings.find(
      (b) => b.id === profile?.bindingId && !b.retired,
    );
    if (!profile || !selected) throw new Error('IDENTITY_UNKNOWN');
    runtime = await openDockerRuntime(
      options.target,
      options.project,
      options.transport,
    );
    const activeRuntime = runtime,
      held = new Set<string>(),
      credentialPath = (id: string) => join(root, 'credentials', id + '.json');
    const registered = options.target.workspaceMappings.find(
      (m) =>
        options.project === m.targetRoot ||
        options.project.startsWith(m.targetRoot.replace(/\/$/, '') + '/'),
    );
    if (!registered) throw new Error('PROJECT_OUTSIDE_REGISTERED_ROOT');
    await activeRuntime.pinInvocation(
      options.invocationPaths ?? [
        { path: options.project, root: registered.targetRoot },
      ],
      options.target.environmentWrapper,
    );
    const resolvedResume = options.resumeSelection
      ? await activeRuntime.resume(options.resumeSelection)
      : undefined;
    const protect = async (binding: Binding) => {
      if (!held.has(binding.id)) {
        bindings.push(
          await acquireDockerBindingLease(
            credentialPath(binding.id),
            scope,
            activeRuntime,
          ),
        );
        held.add(binding.id);
      }
    };
    await protect(selected);
    verifyProjectedActivationPolicy(
      await activeRuntime.policy(options.policyArguments ?? []),
      selected.account,
    );
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
    const save = async (binding: Binding, bytes: Buffer) => {
      if (!matches(bytes, binding)) throw new Error('TARGET_BINDING_MISMATCH');
      await protect(binding);
      const current = (await activeRuntime.snapshot()).auth;
      if (!current?.equals(bytes))
        throw new Error('EXTERNAL_CREDENTIAL_CHANGE');
      await writePrivateDurable(credentialPath(binding.id), bytes);
    };
    let snapshot = await activeRuntime.snapshot();
    let { active, transaction } = validateActivationState(
      snapshot,
      options.target.codexHome,
      scope,
    );
    const metadata = async (
      name: 'active' | 'transaction',
      value: unknown,
      phase: string,
    ) => {
      await options.boundary?.(phase, 'before');
      await activeRuntime.metadata(name, value);
      await options.boundary?.(phase, 'after');
    };
    if (transaction && transaction.phase !== 'complete') {
      if (
        active &&
        active.transactionId !== transaction.id &&
        active.transactionId !== transaction.outgoing?.transactionId
      )
        throw new Error('STALE_TRANSACTION_RECOVERY_REQUIRED');
      const bytes = snapshot.auth;
      if (!bytes) throw new Error('RECOVERABLE_CREDENTIAL_ALTERNATIVES');
      const chosen = bindingFor(
          transaction.selected.profileId,
          transaction.selected.bindingId,
        ),
        previous = transaction.outgoing
          ? bindingFor(
              transaction.outgoing.profileId,
              transaction.outgoing.bindingId,
            )
          : undefined;
      const chosenMatch = matches(bytes, chosen),
        previousMatch = previous && matches(bytes, previous);
      if (
        chosenMatch &&
        previousMatch &&
        chosen.id !== previous!.id &&
        !(
          active?.transactionId === transaction.id &&
          active.bindingId === chosen.id &&
          active.profileId === chosen.profileId
        )
      )
        throw new Error('RECOVERABLE_CREDENTIAL_ALTERNATIVES');
      const binding = chosenMatch
        ? chosen
        : previousMatch
          ? previous
          : undefined;
      if (!binding) throw new Error('RECOVERABLE_CREDENTIAL_ALTERNATIVES');
      await save(binding, bytes);
      active = {
        schemaVersion: 1,
        home: options.target.codexHome,
        generation: scope,
        profileId: binding.profileId,
        bindingId: binding.id,
        transactionId: chosenMatch
          ? transaction.id
          : transaction.outgoing!.transactionId,
      };
      await metadata('active', active, 'recovery-active');
      transaction.phase = 'complete';
      transaction.resolved = {
        profileId: binding.profileId,
        bindingId: binding.id,
      };
      await metadata('transaction', transaction, 'recovery-complete');
      snapshot = await activeRuntime.snapshot();
    }
    if (snapshot.auth) {
      if (!active) throw new Error('OUTGOING_BINDING_RECOVERY_REQUIRED');
      await save(bindingFor(active.profileId, active.bindingId), snapshot.auth);
    } else if (active) throw new Error('RECOVERABLE_CREDENTIAL_ALTERNATIVES');
    const selectedBytes = await readPrivateCredential(
      credentialPath(selected.id),
    );
    if (!matches(selectedBytes, selected))
      throw new Error('SAVED_BINDING_MISMATCH');
    transaction = {
      schemaVersion: 1,
      id: randomUUID(),
      home: options.target.codexHome,
      generation: scope,
      selected: { profileId: profile.id, bindingId: selected.id },
      outgoing: active ?? null,
      resolved: null,
      phase: 'begun',
    };
    const phase = async (value: typeof transaction.phase) => {
      transaction!.phase = value;
      if (value === 'complete')
        transaction!.resolved = {
          profileId: profile.id,
          bindingId: selected.id,
        };
      await metadata('transaction', transaction, 'journal-' + value);
    };
    await phase('begun');
    await phase('outgoing-saved');
    await options.boundary?.('stage', 'before');
    await activeRuntime.stage(selectedBytes);
    await options.boundary?.('stage', 'after');
    await phase('staged');
    await options.boundary?.('target', 'before');
    await activeRuntime.replace(snapshot.auth);
    await options.boundary?.('target', 'after');
    await phase('replaced');
    active = {
      schemaVersion: 1,
      home: options.target.codexHome,
      generation: scope,
      profileId: profile.id,
      bindingId: selected.id,
      transactionId: transaction.id,
    };
    await metadata('active', active, 'active');
    await phase('active');
    await phase('complete');
    const expectedActive = active;
    const revalidate = async () => {
      await activeRuntime.check();
      const current = await activeRuntime.snapshot(),
        state = validateActivationState(
          current,
          options.target.codexHome,
          scope,
        );
      if (
        !state.active ||
        state.active.schemaVersion !== expectedActive.schemaVersion ||
        state.active.home !== expectedActive.home ||
        state.active.generation !== expectedActive.generation ||
        state.active.profileId !== expectedActive.profileId ||
        state.active.bindingId !== expectedActive.bindingId ||
        state.active.transactionId !== expectedActive.transactionId ||
        !current.auth ||
        !matches(current.auth, selected)
      )
        throw new Error('ACTIVE_BINDING_CHANGED');
    };
    let released = false;
    return {
      runtime: activeRuntime,
      ...(resolvedResume ? { resolvedResume } : {}),
      prepareLaunch: async (mode) => {
        await revalidate();
        const id = randomUUID(),
          record = {
            schemaVersion: 1,
            id,
            profileId: profile.id,
            bindingId: selected.id,
            targetId: options.target.id,
            generation: scope,
            home: options.target.codexHome,
            project: options.project,
            executable: options.target.codexExecutable,
            mode,
            state: 'prepared',
            ...(options.target.environmentWrapper
              ? { environmentWrapper: options.target.environmentWrapper }
              : {}),
          };
        await activeRuntime.prepare(record);
        if (mode === 'tracked') {
          const directory = await privateDirectory(join(root, 'launches'));
          await writePrivateDurable(
            join(directory, 'launch-' + id + '.json'),
            JSON.stringify(record),
            { exclusive: true },
          );
        }
        return { id, mode };
      },
      revalidateBeforeLaunch: revalidate,
      syncAfterExit: async () => {
        await revalidate();
        const current = (await activeRuntime.snapshot()).auth!;
        await save(selected, current);
      },
      release: async () => {
        if (released) return;
        await activeRuntime.release();
        for (const binding of [...bindings].reverse()) await binding.release();
        await mutex.release();
        released = true;
      },
    };
  } catch (error) {
    if (runtime) {
      try {
        await runtime.release();
        for (const binding of [...bindings].reverse()) await binding.release();
        await mutex.release();
      } catch {
        runtime.disconnect();
        throw new Error('DOCKER_LEASE_RETAINED', { cause: error });
      }
    } else {
      for (const binding of [...bindings].reverse()) await binding.release();
      await mutex.release();
    }
    throw error;
  }
}
