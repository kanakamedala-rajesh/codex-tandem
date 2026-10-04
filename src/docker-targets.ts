import { open, lstat, realpath, stat, readFile } from 'node:fs/promises';
import { join, relative, isAbsolute, posix, resolve, sep } from 'node:path';
import { claimPrivateState } from './private-state.js';
import { acquireProfileMutex } from './binding-lock.js';
import { verifyPrivate, writePrivateDurable } from './private-files.js';
import { discoverTarget } from './discovery.js';
import { homedir } from 'node:os';

/** A named existing Docker execution configuration independent of saved identities. Pins the daemon/container and explicitly mapped physical project roots; contains no credentials. */
export type DockerTarget = {
  id: string;
  type: 'docker';
  dockerContext: string;
  daemonId: string;
  containerSelector: string;
  expectedContainerId: string;
  user: string;
  home: string;
  codexHome: string;
  codexExecutable: string;
  bridgeInterpreter: string;
  workspaceMappings: { hostRoot: string; targetRoot: string }[];
  /** Optional operator-approved absolute executable wrapper. Receives the Codex executable and argv without shell interpolation. */
  environmentWrapper?: string;
};
const safeText = (v: unknown, limit = 4096): v is string =>
  typeof v === 'string' &&
  v.length > 0 &&
  v.length <= limit &&
  !/[\p{Cc}\p{Cf}]/u.test(v);
const targetPath = (v: unknown): v is string =>
  safeText(v) && v.startsWith('/') && posix.normalize(v) === v;
function validated(value: unknown): DockerTarget {
  const v = value as DockerTarget;
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some(
      (k) =>
        ![
          'id',
          'type',
          'dockerContext',
          'daemonId',
          'containerSelector',
          'expectedContainerId',
          'user',
          'home',
          'codexHome',
          'codexExecutable',
          'bridgeInterpreter',
          'workspaceMappings',
          'environmentWrapper',
        ].includes(k),
    ) ||
    !safeText(v.id, 64) ||
    !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(v.id) ||
    ['local', 'docker'].includes(v.id) ||
    v.type !== 'docker' ||
    !safeText(v.dockerContext, 256) ||
    !safeText(v.daemonId, 200) ||
    !/^[a-zA-Z0-9:_-]{8,200}$/.test(v.daemonId) ||
    !safeText(v.containerSelector, 256) ||
    v.containerSelector.startsWith('-') ||
    !/^[a-f0-9]{64}$/.test(v.expectedContainerId) ||
    !safeText(v.user, 256) ||
    ['root', '0'].includes(v.user) ||
    v.user.startsWith('-') ||
    ![v.home, v.codexHome, v.codexExecutable, v.bridgeInterpreter].every(
      targetPath,
    ) ||
    (v.environmentWrapper !== undefined && !targetPath(v.environmentWrapper)) ||
    !Array.isArray(v.workspaceMappings) ||
    v.workspaceMappings.length < 1 ||
    v.workspaceMappings.length > 32 ||
    v.workspaceMappings.some(
      (m) =>
        !m ||
        Object.keys(m).sort().join() !== 'hostRoot,targetRoot' ||
        !safeText(m.hostRoot) ||
        !isAbsolute(m.hostRoot) ||
        !targetPath(m.targetRoot),
    ) ||
    new Set(v.workspaceMappings.map((m) => m.hostRoot)).size !==
      v.workspaceMappings.length
  )
    throw new Error('TARGET_CONFIGURATION_INVALID');
  return v;
}
async function read(root: string): Promise<DockerTarget[]> {
  const path = join(root, 'targets.json');
  try {
    await verifyPrivate(path);
    const before = await lstat(path);
    if (!before.isFile() || before.nlink !== 1 || before.size > 262144)
      throw new Error('TARGET_CONFIGURATION_INVALID');
    const handle = await open(path, 'r');
    try {
      const info = await handle.stat();
      if (
        info.dev !== before.dev ||
        info.ino !== before.ino ||
        info.size > 262144
      )
        throw new Error('TARGET_CONFIGURATION_INVALID');
      const bytes = Buffer.alloc(262145),
        result = await handle.read(bytes, 0, bytes.length, 0);
      if (result.bytesRead > 262144)
        throw new Error('TARGET_CONFIGURATION_INVALID');
      const data = JSON.parse(
        bytes.subarray(0, result.bytesRead).toString('utf8'),
      );
      if (
        !data ||
        Object.keys(data).sort().join() !== 'schemaVersion,targets' ||
        data.schemaVersion !== 1 ||
        !Array.isArray(data.targets) ||
        data.targets.length > 100
      )
        throw new Error('TARGET_CONFIGURATION_INVALID');
      const targets = data.targets.map(validated);
      if (
        new Set(targets.map((t: DockerTarget) => t.id)).size !== targets.length
      )
        throw new Error('TARGET_CONFIGURATION_INVALID');
      return targets;
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    // eslint-disable-next-line preserve-caught-error -- Native paths and malformed source contents must not cross the public configuration boundary.
    throw new Error('TARGET_CONFIGURATION_INVALID');
  }
}
/** Read bounded private named Docker configurations for this native installation. Invalid or inaccessible state is refused; absent configuration returns an empty list. */
export async function readDockerTargets(
  stateHome: string,
): Promise<DockerTarget[]> {
  const root = await claimPrivateState(resolve(stateHome), 'installation');
  return read(root);
}
/** Save an explicitly configured named target under the profile mutex. Physical host roots must exist; replacing an existing name requires explicit replace=true. Does not qualify target capabilities or deploy helpers. */
export async function saveDockerTarget(
  stateHome: string,
  target: DockerTarget,
  replace = false,
): Promise<void> {
  validated(target);
  const mappings = await Promise.all(
    target.workspaceMappings.map(async (m) => ({
      hostRoot: await realpath(m.hostRoot),
      targetRoot: m.targetRoot,
    })),
  );
  for (const m of mappings)
    if (!(await stat(m.hostRoot)).isDirectory())
      throw new Error('PROJECT_UNAVAILABLE');
  const root = await claimPrivateState(resolve(stateHome), 'installation');
  const mutex = await acquireProfileMutex(root);
  try {
    const targets = await read(root),
      existing = targets.findIndex((t) => t.id === target.id);
    if (existing >= 0 && !replace) throw new Error('TARGET_EXISTS');
    const canonical = { ...target, workspaceMappings: mappings };
    if (existing < 0) targets.push(canonical);
    else targets[existing] = canonical;
    await writePrivateDurable(
      join(root, 'targets.json'),
      JSON.stringify({ schemaVersion: 1, targets }),
    );
  } finally {
    await mutex.release();
  }
}
/** Project an existing host directory into exactly one registered physical root. Refuses escaped aliases, cross-device/nested mounts and ambiguous overlapping registrations. */
export async function mappedDockerProject(
  target: DockerTarget,
  project: string,
): Promise<string> {
  validated(target);
  const physical = await realpath(resolve(project));
  const matches = [];
  for (const m of target.workspaceMappings) {
    if ((await realpath(m.hostRoot)) !== m.hostRoot)
      throw new Error('REGISTERED_ROOT_CHANGED');
    const suffix = relative(m.hostRoot, physical);
    if (suffix === '..' || suffix.startsWith('..' + sep) || isAbsolute(suffix))
      continue;
    if ((await stat(m.hostRoot)).dev !== (await stat(physical)).dev)
      throw new Error('PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT');
    if (process.platform === 'linux') {
      const mounts = (await readFile('/proc/self/mountinfo', 'utf8'))
        .split('\n')
        .filter(Boolean)
        .map((line) =>
          line
            .split(' ')[4]
            .replace(/\\([0-7]{3})/g, (_, octal) =>
              String.fromCharCode(parseInt(octal, 8)),
            ),
        );
      if (
        mounts.some(
          (mount) =>
            mount !== m.hostRoot &&
            mount.startsWith(m.hostRoot.replace(/\/$/, '') + '/') &&
            (physical === mount ||
              physical.startsWith(mount.replace(/\/$/, '') + '/')),
        )
      )
        throw new Error('PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT');
    }
    matches.push(posix.join(m.targetRoot, ...suffix.split(sep)));
  }
  if (matches.length !== 1)
    throw new Error(
      matches.length
        ? 'PROJECT_MAPPING_AMBIGUOUS'
        : 'PROJECT_OUTSIDE_REGISTERED_ROOT',
    );
  return matches[0];
}

/** Register, inspect, explicitly replace or remove named Docker configurations. Registration revalidates daemon/container and physical target paths; no credentials or helpers are transferred. Replacement/removal require --confirm-id matching the target name. Errors contain only safe codes. */
export async function dockerTargetsCommand(args: string[]): Promise<number> {
  const json = args.includes('--json');
  try {
    const operation = args[0],
      values = new Map<string, string>();
    for (let i = 1; i < args.length; i++) {
      if (args[i] === '--json') continue;
      if (
        !['--state-home', '--config', '--id', '--confirm-id'].includes(
          args[i],
        ) ||
        !args[i + 1] ||
        values.has(args[i])
      )
        throw new Error('INVALID_ARGUMENTS');
      values.set(args[i], args[++i]);
    }
    const state =
      values.get('--state-home') ??
      join(
        homedir(),
        process.platform === 'win32'
          ? '.codex-tandem-windows'
          : '.codex-tandem',
      );
    if (!['add', 'edit', 'list', 'show', 'check', 'remove'].includes(operation))
      throw new Error('INVALID_ARGUMENTS');
    let target: DockerTarget | undefined;
    if (operation === 'add' || operation === 'edit') {
      const config = values.get('--config');
      if (!config || values.has('--id')) throw new Error('INVALID_ARGUMENTS');
      const handle = await open(resolve(config), 'r');
      try {
        const info = await handle.stat();
        if (!info.isFile() || info.size > 262144)
          throw new Error('TARGET_CONFIGURATION_INVALID');
        const bytes = Buffer.alloc(262145),
          result = await handle.read(bytes, 0, bytes.length, 0);
        if (result.bytesRead > 262144)
          throw new Error('TARGET_CONFIGURATION_INVALID');
        target = validated(
          JSON.parse(bytes.subarray(0, result.bytesRead).toString('utf8')),
        );
      } finally {
        await handle.close();
      }
      if (operation === 'edit' && values.get('--confirm-id') !== target.id)
        throw new Error('TARGET_CONFIRMATION_REQUIRED');
    } else if (operation !== 'list') {
      if (!values.get('--id') || values.has('--config'))
        throw new Error('INVALID_ARGUMENTS');
      target = (await readDockerTargets(state)).find(
        (t) => t.id === values.get('--id'),
      );
      if (!target) throw new Error('TARGET_UNKNOWN');
    }
    let report;
    if (target && ['add', 'edit', 'check'].includes(operation)) {
      report = await discoverTarget({
        target: 'docker',
        container: target.containerSelector,
        dockerContext: target.dockerContext,
        expectedGeneration: target.expectedContainerId,
        expectedDaemonId: target.daemonId,
        user: target.user,
        projectRoot: target.workspaceMappings[0].targetRoot,
        project: target.workspaceMappings[0].targetRoot,
        codexHome: target.codexHome,
        codexExecutable: target.codexExecutable,
      });
      if (!report.ok || !report.paths)
        throw new Error(report.diagnostics[0] ?? 'TARGET_UNAVAILABLE');
      if (
        report.user !== target.user ||
        report.paths.home !== target.home ||
        report.paths.codexHome !== target.codexHome ||
        report.paths.executable !== target.codexExecutable ||
        report.paths.projectRoot !== target.workspaceMappings[0].targetRoot
      )
        throw new Error('TARGET_PATHS_CHANGED_REVALIDATE');
      if (operation !== 'check')
        await saveDockerTarget(state, target, operation === 'edit');
    }
    if (operation === 'remove') {
      if (values.get('--confirm-id') !== target!.id)
        throw new Error('TARGET_CONFIRMATION_REQUIRED');
      const root = await claimPrivateState(resolve(state), 'installation'),
        mutex = await acquireProfileMutex(root);
      try {
        const targets = (await read(root)).filter((t) => t.id !== target!.id);
        await writePrivateDurable(
          join(root, 'targets.json'),
          JSON.stringify({ schemaVersion: 1, targets }),
        );
      } finally {
        await mutex.release();
      }
    }
    const result = {
      schemaVersion: 1,
      ok: true,
      ...(operation === 'list'
        ? { targets: await readDockerTargets(state) }
        : { target }),
      ...(report ? { discovery: report } : {}),
    };
    process.stdout.write(JSON.stringify(result) + '\n');
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const code = /^[A-Z][A-Z0-9_]+$/.test(message)
      ? message
      : 'TARGET_CONFIGURATION_INVALID';
    process.stderr.write(
      json
        ? JSON.stringify({ schemaVersion: 1, ok: false, code }) + '\n'
        : code + '\n',
    );
    return 2;
  }
}
