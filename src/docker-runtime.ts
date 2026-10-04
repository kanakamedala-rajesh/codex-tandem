import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import type { DockerTarget } from './docker-targets.js';
import { discoverTarget } from './discovery.js';
import { posix } from 'node:path';
const retainedScopes = new WeakMap<DockerRuntime, string>();
const nativeTransport: DockerControlTransport = (args) =>
  spawn('docker', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    windowsHide: true,
  });
/** Build the non-secret shell-free Docker exec prefix for the configured user, physical cwd and Codex home. TTY is opt-in for a real interactive launch; controls and inspections use false. */
export function dockerExecArguments(
  target: DockerTarget,
  project: string,
  interactive = false,
): string[] {
  return [
    '--context',
    target.dockerContext,
    'exec',
    '-i',
    ...(interactive ? ['-t'] : []),
    '--user',
    target.user,
    '--workdir',
    project,
    '--env',
    'HOME=' + target.home,
    '--env',
    'CODEX_HOME=' + target.codexHome,
  ];
}

/** Spawn the external Docker command using exactly the supplied non-secret argv and piped stdio. The default transport uses shell-free native spawn. */
export type DockerControlTransport = (
  args: string[],
) => ChildProcessWithoutNullStreams;
/** Allowlisted remote process identity; creation binds the kernel boot, start ticks and UID. Managed means a persisted supervisor or child identity, or its verified descendant. Lost roots without a durable completion record block inventory. */
export type DockerProcess = {
  pid: number;
  creation: string;
  executable: string;
  managed: boolean;
  launchId: string | null;
  state: string;
  role: 'supervisor' | 'child' | 'external';
};
/** A retained private control connection to the pinned target. EOF/disconnect never releases remote ownership or proves process absence. */
export type DockerRuntime = {
  /** Read current private credential bytes and activation metadata only after remote idle verification. No payload is logged. */
  snapshot: () => Promise<{
    auth: Buffer | null;
    active: unknown;
    transaction: unknown;
  }>;
  /** Require the exact pinned physical invocation paths, owned guard and idle remote scope. */
  check: () => Promise<void>;
  /** Pin the original target spawn cwd, every raw directory resolution and optional approved environment wrapper before policy inspection. Rechecked on every protected request and by the target supervisor before execution. */
  pinInvocation: (
    paths: { path: string; root: string }[],
    wrapper?: string,
  ) => Promise<void>;
  /** Read a bounded allowlisted effective-policy projection through target Codex RPC under the same configured environment wrapper. */
  policy: (argumentsForPolicy: string[]) => Promise<unknown>;
  /** Return fresh remote ownership metadata without process argv or arbitrary environment values. */
  inventory: () => Promise<DockerProcess[]>;
  /** Resolve an explicit rollout UUID or opt-in last session from bounded metadata in this target's physical project. */
  resume: (selection: string) => Promise<string>;
  /** Forward a caller's signal only to freshly verified descendants of this owned launch, retaining the supervisor. */
  interrupt: (launchId: string, signal: 'SIGINT' | 'SIGTERM') => Promise<void>;
  /** Publish one bounded private transaction or active record with remote durability barriers. */
  metadata: (name: 'active' | 'transaction', value: unknown) => Promise<void>;
  /** Send only selected bounded credential bytes through stdin into private target staging. */
  stage: (auth: Buffer) => Promise<void>;
  /** Atomically publish staged credentials only if the current outgoing bytes still match. */
  replace: (expected: Buffer | null) => Promise<void>;
  /** Persist an immutable intended launch record before the supervised child can execute. */
  prepare: (value: { id: string; [key: string]: unknown }) => Promise<void>;
  /** Return a shell-free supervised Docker exec argv; -t is included only for a real interactive terminal. */
  launchArguments: (
    id: string,
    args: string[],
    interactive: boolean,
  ) => string[];
  /** Release remote ownership only after fresh in-container absence verification. */
  release: () => Promise<void>;
  /** Close this host control transport while retaining its remote guard for diagnosis/recovery. */
  disconnect: () => void;
};
/** Open a private Python control connection using existing verified target facilities. The caller must freshly verify daemon/container and registered paths first. Bounded JSON stdin carries credentials; argv/environment never contain credential values. Target failures are redacted codes. */
export async function openDockerRuntime(
  target: DockerTarget,
  project: string,
  transport: DockerControlTransport = nativeTransport,
): Promise<DockerRuntime> {
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
      expectedGeneration: target.expectedContainerId,
      expectedDaemonId: target.daemonId,
      user: target.user,
      projectRoot: root.targetRoot,
      project,
      codexHome: target.codexHome,
      codexExecutable: target.codexExecutable,
    });
    if (!report.ok || !report.paths)
      throw new Error(report.diagnostics[0] ?? 'TARGET_UNAVAILABLE');
    if (
      report.paths.home !== target.home ||
      report.paths.codexHome !== target.codexHome ||
      report.paths.project !== project ||
      report.paths.executable !== target.codexExecutable ||
      report.user !== target.user
    )
      throw new Error('TARGET_PATHS_CHANGED_REVALIDATE');
  }
  const code = await readFile(
    new URL('./docker-runtime.py', import.meta.url),
    'utf8',
  );
  const nonce = randomBytes(32).toString('hex');
  const common = dockerExecArguments(target, project);
  const script = [target.bridgeInterpreter, '-E', '-s', '-S', '-B', '-c', code];
  const child = transport([
    ...common,
    target.expectedContainerId,
    ...script,
    'control',
    target.codexHome,
    project,
    target.codexExecutable,
    nonce,
  ]);
  let buffer = '',
    size = 0,
    closed = false;
  let waiting:
    | {
        resolve: (value: unknown) => void;
        reject: (error: Error) => void;
        timer: NodeJS.Timeout;
      }
    | undefined;
  const failed = () => {
    closed = true;
    if (waiting) {
      clearTimeout(waiting.timer);
      waiting.reject(new Error('DOCKER_CONTROL_LOST'));
      waiting = undefined;
    }
  };
  const response = () =>
    new Promise<unknown>((resolve, reject) => {
      if (closed || waiting) return reject(new Error('DOCKER_CONTROL_LOST'));
      const timer = setTimeout(() => {
        failed();
        child.stdin.destroy();
      }, 15000);
      waiting = { resolve, reject, timer };
    });
  const ready = response();
  child.once('error', failed);
  child.once('close', failed);
  child.stdin.on('error', failed);
  child.stderr.on('data', (data: Buffer) => {
    size += data.length;
    if (size > 1048576) {
      failed();
      child.stdin.destroy();
    }
  });
  child.stdout.on('data', (data: Buffer) => {
    buffer += data.toString('utf8');
    if (Buffer.byteLength(buffer) > 262144) {
      failed();
      child.stdin.destroy();
      return;
    }
    while (buffer.includes('\n')) {
      const end = buffer.indexOf('\n'),
        line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      const pending = waiting;
      if (!pending) {
        failed();
        child.stdin.destroy();
        return;
      }
      waiting = undefined;
      clearTimeout(pending.timer);
      try {
        const value = JSON.parse(line);
        if (!value || typeof value.ok !== 'boolean') throw new Error();
        if (!value.ok)
          pending.reject(
            new Error(
              typeof value.code === 'string' &&
                /^(?:REMOTE_|RESUME_)[A-Z_]+$|^EXTERNAL_REFRESH_CONFLICT$/.test(
                  value.code,
                )
                ? value.code
                : 'REMOTE_OPERATION_FAILED',
            ),
          );
        else pending.resolve(value.result === undefined ? value : value.result);
      } catch {
        pending.reject(new Error('DOCKER_CONTROL_INVALID'));
        closed = true;
        child.stdin.destroy();
      }
    }
  });
  const initial = (await ready) as {
    manager?: { pid?: unknown; creation?: unknown; uid?: unknown };
  };
  if (
    !initial?.manager ||
    !Number.isSafeInteger(initial.manager.pid) ||
    (initial.manager.pid as number) < 2 ||
    typeof initial.manager.creation !== 'string' ||
    !Number.isSafeInteger(initial.manager.uid) ||
    (initial.manager.uid as number) < 1
  ) {
    child.stdin.destroy();
    throw new Error('REMOTE_MANAGER_UNPROVEN');
  }
  let serial: Promise<unknown> = Promise.resolve();
  const request = (value: unknown) => {
    const action = async () => {
      const bytes = JSON.stringify(value) + '\n';
      if (Buffer.byteLength(bytes) > 262144)
        throw new Error('REMOTE_REQUEST_TOO_LARGE');
      const result = response();
      child.stdin.write(bytes);
      return result;
    };
    const result = serial.then(action);
    serial = result.catch(() => {});
    return result;
  };
  const empty = async (value: unknown) => {
    await request(value);
  };
  const runtime: DockerRuntime = {
    snapshot: async () => {
      const value = (await request({ action: 'snapshot' })) as {
        auth: unknown;
        active: unknown;
        transaction: unknown;
      };
      if (
        !value ||
        (value.auth !== null &&
          (typeof value.auth !== 'string' ||
            value.auth.length > 87384 ||
            !/^[A-Za-z0-9+/]*={0,2}$/.test(value.auth)))
      )
        throw new Error('REMOTE_SNAPSHOT_INVALID');
      return {
        ...value,
        auth:
          value.auth === null
            ? null
            : Buffer.from(value.auth as string, 'base64'),
      };
    },
    check: () => empty({ action: 'check' }),
    pinInvocation: (paths, wrapper) => {
      if (
        !Array.isArray(paths) ||
        paths.length < 1 ||
        paths.length > 34 ||
        paths.some(
          (p) =>
            !p ||
            ![p.path, p.root].every(
              (v) =>
                typeof v === 'string' &&
                posix.isAbsolute(v) &&
                posix.normalize(v) === v &&
                !/[\p{Cc}\p{Cf}]/u.test(v),
            ),
        )
      )
        return Promise.reject(new Error('REMOTE_PATH_INVALID'));
      return empty({ action: 'pin', paths, wrapper: wrapper ?? null });
    },
    resume: async (selection) => {
      if (
        selection !== 'last' &&
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          selection,
        )
      )
        throw new Error('RESUME_ID_INVALID');
      const value = await request({ action: 'resume', selection });
      if (
        typeof value !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          value,
        )
      )
        throw new Error('RESUME_METADATA_INVALID');
      if (selection !== 'last' && value !== selection)
        throw new Error('RESUME_METADATA_CONFLICT');
      return value;
    },
    interrupt: (launchId, signal) =>
      empty({ action: 'interrupt', launchId, signal }),
    policy: (argumentsForPolicy) =>
      request({
        action: 'policy',
        arguments: argumentsForPolicy,
        wrapper: target.environmentWrapper ?? null,
      }),
    inventory: async () => {
      const value = await request({ action: 'inventory' });
      if (
        !Array.isArray(value) ||
        value.length > 10000 ||
        value.some(
          (p) =>
            !p ||
            !Number.isSafeInteger(p.pid) ||
            p.pid < 1 ||
            typeof p.creation !== 'string' ||
            typeof p.executable !== 'string' ||
            typeof p.managed !== 'boolean' ||
            typeof p.state !== 'string' ||
            !['supervisor', 'child', 'external'].includes(p.role),
        )
      )
        throw new Error('REMOTE_INVENTORY_INVALID');
      return value;
    },
    metadata: (name, value) => empty({ action: 'metadata', name, value }),
    stage: (auth) => {
      if (auth.length > 65536)
        return Promise.reject(new Error('CREDENTIAL_INVALID'));
      return empty({ action: 'stage', auth: auth.toString('base64') });
    },
    replace: (expected) =>
      empty({
        action: 'replace',
        expected: expected?.toString('base64') ?? null,
      }),
    prepare: (value) => {
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
          value.id,
        )
      )
        return Promise.reject(new Error('REMOTE_LAUNCH_INVALID'));
      return empty({ action: 'prepare', value });
    },
    launchArguments: (id, args, interactive) => [
      ...common,
      ...(interactive ? ['-t'] : []),
      '--env',
      'TANDEM_LAUNCH_ID=' + id,
      '--env',
      'TANDEM_MANAGER_NONCE=' + nonce,
      target.expectedContainerId,
      ...script,
      'launch',
      target.codexHome,
      project,
      target.codexExecutable,
      nonce,
      id,
      ...args,
    ],
    release: async () => {
      await empty({ action: 'release' });
      retainedScopes.delete(runtime);
      child.stdin.end();
    },
    disconnect: () => {
      retainedScopes.delete(runtime);
      child.stdin.destroy();
    },
  };
  if (transport === nativeTransport)
    retainedScopes.set(
      runtime,
      `docker:${target.daemonId}:${target.expectedContainerId}:${target.codexHome}`,
    );
  return runtime;
}
/** Prove that an actual native Docker control session still owns the requested remote scope and sees no in-container processes. Injected transports and caller-constructed inventories cannot authorize saved-binding recovery. */
export async function verifyRetainedDockerScope(
  runtime: DockerRuntime,
  scope: string,
): Promise<void> {
  if (retainedScopes.get(runtime) !== scope)
    throw new Error('REMOTE_GUARD_UNPROVEN');
  await runtime.check();
}
