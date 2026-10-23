import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { posix } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { discoverTarget } from './discovery.js';
import { dockerExecArguments, type DockerProcess } from './docker-runtime.js';
import type { DockerTarget } from './docker-targets.js';

/** Execute one external bounded Docker inspection/stop request. Arguments/input contain only scoped ownership metadata; the production driver never emits captured target output on failure. */
export type DockerProcessTransport = (
  args: string[],
  input: string,
) => Promise<string>;
const nativeTransport: DockerProcessTransport = (args, input) =>
  new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });
    let output = '',
      size = 0,
      failure = false;
    const refuse = () => {
      failure = true;
      child.stdin.destroy();
      child.kill();
      reject(new Error('DOCKER_PROCESS_INSPECTION_FAILED'));
    };
    const timer = setTimeout(refuse, 15000);
    child.stdin.on('error', refuse);
    child.once('error', refuse);
    child.stdout.on('data', (value: Buffer) => {
      output += value.toString('utf8');
      if (Buffer.byteLength(output) > 262144) refuse();
    });
    child.stderr.on('data', (value: Buffer) => {
      size += value.length;
      if (size > 1048576) refuse();
    });
    child.once('close', () => {
      clearTimeout(timer);
      if (!failure) resolve(output);
    });
    child.stdin.end(input);
  });
type Observed = { processes: DockerProcess[]; owner: unknown };
/** A read-only remote scope snapshot. Unknown external Codex remains visible and blocking; losing the Docker client never marks it safe. */
export type DockerProcessInventory = {
  scope: string;
  safe: boolean;
  processes: DockerProcess[];
  consentKey: string;
};
const scopeFor = (target: DockerTarget) =>
  `docker:${target.daemonId}:${target.expectedContainerId}:${target.codexHome}`;
const stable = (values: DockerProcess[]) =>
  values
    .map((p) => ({
      pid: p.pid,
      creation: p.creation,
      executable: p.executable,
      managed: p.managed,
      launchId: p.launchId,
      role: p.role,
    }))
    .sort((a, b) => a.pid - b.pid);
const keyFor = (values: DockerProcess[]) =>
  createHash('sha256')
    .update(JSON.stringify(stable(values)))
    .digest('hex');
async function operation(
  target: DockerTarget,
  project: string,
  mode: 'inspect' | 'stop',
  input: unknown,
  transport: DockerProcessTransport,
): Promise<Observed> {
  if (transport === nativeTransport) {
    const root = target.workspaceMappings.find((m) => {
      const suffix = posix.relative(m.targetRoot, project);
      return (
        suffix !== '..' &&
        !suffix.startsWith('../') &&
        !posix.isAbsolute(suffix)
      );
    });
    if (!root) throw new Error('PROJECT_OUTSIDE_REGISTERED_ROOT');
    const report = await discoverTarget({
      target: 'docker',
      container: target.containerSelector,
      dockerContext: target.dockerContext,
      expectedDaemonId: target.daemonId,
      expectedGeneration: target.expectedContainerId,
      user: target.user,
      projectRoot: root.targetRoot,
      project,
      codexHome: target.codexHome,
      codexExecutable: target.codexExecutable,
    });
    if (!report.ok || !report.paths)
      throw new Error(report.diagnostics[0] ?? 'TARGET_UNAVAILABLE');
    if (
      report.user !== target.user ||
      report.paths.home !== target.home ||
      report.paths.codexHome !== target.codexHome ||
      report.paths.project !== project ||
      report.paths.executable !== target.codexExecutable
    )
      throw new Error('TARGET_PATHS_CHANGED_REVALIDATE');
  }
  const code = await readFile(
    new URL('./docker-runtime.py', import.meta.url),
    'utf8',
  );
  const raw = await transport(
    [
      ...dockerExecArguments(target, project),
      target.expectedContainerId,
      target.bridgeInterpreter,
      '-E',
      '-s',
      '-S',
      '-B',
      '-c',
      code,
      mode,
      target.codexHome,
      project,
      target.codexExecutable,
      'inspection',
    ],
    JSON.stringify(input) + '\n',
  );
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error('REMOTE_INVENTORY_INVALID', { cause: error });
  }
  if (value?.ok === false)
    throw new Error(
      typeof value.code === 'string' && /^REMOTE_[A-Z_]+$/.test(value.code)
        ? value.code
        : 'REMOTE_PROCESS_INSPECTION_FAILED',
    );
  const observed = value?.result as Observed;
  if (
    value?.ok !== true ||
    !observed ||
    !Array.isArray(observed.processes) ||
    observed.processes.length > 10000 ||
    observed.processes.some(
      (p) =>
        !p ||
        !Number.isSafeInteger(p.pid) ||
        p.pid < 1 ||
        typeof p.creation !== 'string' ||
        typeof p.executable !== 'string' ||
        typeof p.managed !== 'boolean' ||
        !['supervisor', 'child', 'external'].includes(p.role),
    )
  )
    throw new Error('REMOTE_INVENTORY_INVALID');
  return observed;
}
/** Inspect processes inside a freshly pinned named Docker target without acquiring/releasing its guard or mutating credentials. Candidate ownership that cannot be proved throws; a known external candidate is returned as blocking. */
export async function inspectDockerProcesses(
  target: DockerTarget,
  project: string,
  transport: DockerProcessTransport = nativeTransport,
): Promise<DockerProcessInventory> {
  const observed = await operation(target, project, 'inspect', null, transport);
  return {
    scope: scopeFor(target),
    safe: observed.processes.length === 0,
    processes: observed.processes,
    consentKey: keyFor(observed.processes),
  };
}
/** Exact scoped process set and consequences displayed for each separate graceful or force consent decision. */
export type DockerStopPrompt = {
  phase: 'graceful' | 'force';
  scope: string;
  processes: DockerProcess[];
  consentKey: string;
  consequences: string;
};
/** Stop status after fresh remote inspection. Cancellation performs no signals; blocked/surviving processes retain credential ownership. */
export type DockerStopResult = {
  status: 'stopped' | 'cancelled' | 'blocked';
  processes: DockerProcess[];
};
/** Signal only the freshly revalidated approved remote process set, with graceful first and separate force consent. Supervisors reap descendants and exit themselves; PID1, unknown owners and unrelated builds are never eligible. Does not release any credential guard. */
export async function stopDockerProcesses(
  target: DockerTarget,
  project: string,
  consent: (prompt: DockerStopPrompt) => Promise<boolean>,
  options: { transport?: DockerProcessTransport; waitMs?: number } = {},
): Promise<DockerStopResult> {
  const transport = options.transport ?? nativeTransport,
    waitMs = options.waitMs ?? 1500;
  if (!Number.isInteger(waitMs) || waitMs < 100 || waitMs > 10000)
    throw new Error('STOP_WAIT_INVALID');
  let observed = await operation(target, project, 'inspect', null, transport);
  if (!observed.processes.length) return { status: 'stopped', processes: [] };
  if (observed.processes.some((p) => !p.managed || p.pid === 1))
    return { status: 'blocked', processes: observed.processes };
  for (const phase of ['graceful', 'force'] as const) {
    if (
      !(await consent({
        phase,
        scope: scopeFor(target),
        processes: observed.processes,
        consentKey: keyFor(observed.processes),
        consequences:
          phase === 'graceful'
            ? 'Stop exactly these managed remote processes; their work can be interrupted. Credential ownership remains held until remote absence is verified.'
            : 'Force exactly these surviving managed remote children; unsaved work may be lost. The container, PID1 and unrelated processes are excluded.',
      }))
    )
      return { status: 'cancelled', processes: observed.processes };
    const fresh = await operation(target, project, 'inspect', null, transport);
    if (
      !isDeepStrictEqual(fresh.owner, observed.owner) ||
      keyFor(fresh.processes) !== keyFor(observed.processes)
    )
      throw new Error('REMOTE_STOP_SCOPE_CHANGED');
    await operation(
      target,
      project,
      'stop',
      {
        owner: observed.owner,
        processes: observed.processes,
        force: phase === 'force',
      },
      transport,
    );
    const deadline = Date.now() + waitMs;
    while (true) {
      observed = await operation(target, project, 'inspect', null, transport);
      if (!observed.processes.length)
        return { status: 'stopped', processes: [] };
      if (observed.processes.some((p) => !p.managed || p.pid === 1))
        return { status: 'blocked', processes: observed.processes };
      if (Date.now() >= deadline) break;
      await delay(50);
    }
  }
  return { status: 'blocked', processes: observed.processes };
}
