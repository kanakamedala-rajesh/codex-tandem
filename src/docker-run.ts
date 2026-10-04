import { spawn } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve, posix } from 'node:path';
import { readDockerTargets, mappedDockerProject } from './docker-targets.js';
import {
  activateDockerIdentity,
  type DockerActivationLease,
} from './docker-activation.js';
import { discoverTarget } from './discovery.js';

/** Selected identity and unchanged Codex invocation for a named existing Docker target. Host projects map only through the target's explicit registrations. */
export type DockerRunOptions = {
  stateHome: string;
  profileId: string;
  targetId: string;
  hostProject: string;
  args: string[];
  policyArguments: string[];
  directories: string[];
  resume?: string;
  rawResume?: string;
  untracked: boolean;
  interactive: boolean;
  /** Emit a sanitized diagnostic and return the status chosen by the caller. */
  error: (code: string, message: string) => number;
};
/** Launch a named pinned Docker target with private selected credentials, inherited terminal/streams and exact child status. Client loss preserves remote and saved-binding ownership; post-exit synchronization failures remain explicit. */
export async function runDockerTarget(
  options: DockerRunOptions,
): Promise<number> {
  const target = (await readDockerTargets(options.stateHome)).find(
    (t) => t.id === options.targetId,
  );
  if (!target) throw new Error('TARGET_UNKNOWN');
  const host = await realpath(resolve(options.hostProject));
  const initial = await mappedDockerProject(target, host);
  const mapping = target.workspaceMappings.find((m) => {
    const suffix = posix.relative(m.targetRoot, initial);
    return (
      suffix !== '..' && !suffix.startsWith('../') && !posix.isAbsolute(suffix)
    );
  })!;
  const inspect = async (path: string) => {
    const report = await discoverTarget({
      target: 'docker',
      container: target.containerSelector,
      dockerContext: target.dockerContext,
      expectedGeneration: target.expectedContainerId,
      expectedDaemonId: target.daemonId,
      user: target.user,
      projectRoot: mapping.targetRoot,
      project: path,
      codexHome: target.codexHome,
      codexExecutable: target.codexExecutable,
    });
    if (!report.ok || !report.paths)
      throw new Error(report.diagnostics[0] ?? 'TARGET_UNAVAILABLE');
    return report.paths.project;
  };
  const initialPhysical = await inspect(initial);
  const paths = [
    initial,
    ...options.directories.map((path) => posix.resolve(initialPhysical, path)),
  ];
  let project = initialPhysical;
  for (const path of paths.slice(1)) project = await inspect(path);
  let lease: DockerActivationLease | undefined,
    status: number | undefined,
    started = false;
  let cleanupSignals: (() => void) | undefined;
  try {
    lease = await activateDockerIdentity({
      stateHome: options.stateHome,
      profileId: options.profileId,
      target,
      project,
      invocationPaths: paths.map((path) => ({
        path,
        root: mapping.targetRoot,
      })),
      policyArguments: options.policyArguments,
      resumeSelection: options.resume ?? options.rawResume,
    });
    const owned = lease;
    let args = options.args;
    if (options.resume) args = ['resume', owned.resolvedResume!, ...args];
    const launch = await owned.prepareLaunch(
      options.untracked ? 'untracked' : 'tracked',
    );
    if (options.untracked)
      options.error(
        'UNTRACKED_LAUNCH',
        'This explicitly untracked launch has only a private intended-launch record.',
      );
    await owned.revalidateBeforeLaunch();
    const child = spawn(
      'docker',
      owned.runtime.launchArguments(launch.id, args, options.interactive),
      { stdio: 'inherit', shell: false, windowsHide: false },
    );
    const exit = new Promise<number>((done, reject) => {
      child.once('error', () => reject(new Error('CHILD_START_FAILED')));
      child.once('close', (code, signal) =>
        done(
          code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1),
        ),
      );
    });
    started = !!child.pid;
    const interrupt = () => {
      void owned.runtime
        .interrupt(launch.id, 'SIGINT')
        .catch(() =>
          options.error(
            'REMOTE_SIGNAL_FAILED',
            'Remote cancellation could not be verified; ownership remains held.',
          ),
        );
    };
    const terminate = () => {
      void owned.runtime
        .interrupt(launch.id, 'SIGTERM')
        .catch(() =>
          options.error(
            'REMOTE_SIGNAL_FAILED',
            'Remote termination could not be verified; ownership remains held.',
          ),
        );
    };
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    cleanupSignals = () => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    };
    status = await exit;
    await owned.syncAfterExit();
    await owned.release();
    lease = undefined;
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    options.error(
      /^[A-Z][A-Z0-9_]+$/.test(message) ? message : 'DOCKER_LAUNCH_FAILED',
      started
        ? 'Managed Docker launch needs diagnosis; target credentials are preserved.'
        : 'Docker launch was refused; check target state, identity, paths and effective policy.',
    );
    if (lease) {
      const retained = lease;
      try {
        await retained.release();
        lease = undefined;
      } catch {
        retained.runtime.disconnect();
        options.error(
          'LEASE_RETAINED',
          'Remote ownership is retained until in-container processes can be verified.',
        );
      }
    }
    return status ?? 2;
  } finally {
    cleanupSignals?.();
  }
}
