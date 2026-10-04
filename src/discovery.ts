import { access, readFile, realpath, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import {
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  posix,
  resolve,
  sep,
} from 'node:path';

/**
 * Inputs for read-only target discovery. Path and executable overrides are
 * resolved inside the selected target; project must stay within projectRoot
 * without crossing a nested mount. Docker requires an existing local container.
 */
export type DiscoveryOptions = {
  target: 'local' | 'docker';
  container?: string;
  dockerContext?: string;
  /** Full container ID expected by the caller; a replacement fails discovery. */
  expectedGeneration?: string;
  /** Docker daemon identity expected by the operator; context aliases must resolve to this daemon. */
  expectedDaemonId?: string;
  user?: string;
  projectRoot?: string;
  project?: string;
  codexHome?: string;
  codexExecutable?: string;
};
type Paths = {
  home: string;
  codexHome: string;
  codexHomeExists: boolean;
  projectRoot: string;
  project: string;
  executable: string;
};
/**
 * Discovery snapshot with canonical paths and safe diagnostic codes. ok means
 * the checked paths, permissions and projection are usable; hook trust, durable
 * capture and full tracking remain unqualified. Failed reports may be partial.
 */
export type DiscoveryReport = {
  schemaVersion: 1;
  ok: boolean;
  target: string;
  fullTracking: false;
  trust: 'unverified';
  bridge: { jsonProjection: string; durableCapture: string };
  diagnostics: string[];
  user?: string;
  paths?: Paths;
  context?: string;
  generation?: string;
  /** Stable daemon identity observed for this Docker discovery snapshot. */
  daemonId?: string;
  credentialScope?: string;
};
const initial = (target: string): DiscoveryReport => ({
  schemaVersion: 1,
  ok: false,
  target,
  fullTracking: false,
  trust: 'unverified',
  bridge: { jsonProjection: 'unverified', durableCapture: 'unverified' },
  diagnostics: [],
});
const boundedText = (value: unknown, limit: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= limit &&
  // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
  !/[\x00-\x1f\x7f]/.test(value);
/** Resolve an absolute path through physical aliases, including an absent destination beneath its existing canonical ancestor. Does not create files; relative paths throw. */
export async function canonicalPath(path: string): Promise<string> {
  if (!isAbsolute(path)) throw new Error('PATH_ABSOLUTE_REQUIRED');
  try {
    return await realpath(path);
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== 'ENOENT' ||
      dirname(path) === path
    )
      throw error;
    return join(
      await canonicalPath(dirname(path)),
      path.slice(dirname(path).length + (dirname(path).endsWith(sep) ? 0 : 1)),
    );
  }
}
async function executable(requested?: string): Promise<string> {
  const name = requested ?? 'codex';
  const explicitPath =
    isAbsolute(name) || name.includes('/') || name.includes('\\');
  const supportedWindows = ['.exe', '.com', '.cmd', '.bat'];
  const extension = extname(name).toLowerCase();
  if (
    process.platform === 'win32' &&
    extension &&
    !supportedWindows.includes(extension)
  )
    throw new Error('EXECUTABLE_UNAVAILABLE');
  const suffixes =
    process.platform !== 'win32' || extension
      ? ['']
      : (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
          .split(';')
          .filter((ext) => supportedWindows.includes(ext.toLowerCase()));
  const candidates = (
    explicitPath
      ? [resolve(name)]
      : (process.env.PATH ?? '')
          .split(delimiter)
          .filter(Boolean)
          .map((dir) => join(dir, name))
  ).flatMap((path) => suffixes.map((ext) => path + ext));
  for (const path of candidates) {
    try {
      if (!(await stat(path)).isFile()) continue;
      await access(
        path,
        process.platform === 'win32' ? constants.R_OK : constants.X_OK,
      );
      const canonical = await realpath(path);
      if (
        process.platform === 'win32' &&
        !supportedWindows.includes(extname(canonical).toLowerCase())
      )
        continue;
      return canonical;
    } catch {
      /* Search next PATH entry without exposing errors. */
    }
  }
  throw new Error('EXECUTABLE_UNAVAILABLE');
}
/**
 * Inspect host paths or an existing Docker container without launching Codex,
 * reading credentials or creating target files. Docker runs read-only shell and
 * Python probes and rejects remote endpoints or a changed container generation.
 * An optional daemon pin is checked before entering a container; daemon and
 * container identities are rechecked before paths and scope are published.
 * These snapshots do not provide an atomic discovery-to-activation guarantee.
 * Returns failures as diagnostic codes; run can replace the Docker command reader.
 */
export async function discoverTarget(
  options: DiscoveryOptions,
  run: DockerRead = dockerRead,
): Promise<DiscoveryReport> {
  const report = initial(options.target);
  if (options.target === 'docker') return discoverDocker(options, run);
  try {
    const home = await realpath(homedir());
    const root = await realpath(resolve(options.projectRoot ?? process.cwd()));
    const project = await realpath(resolve(options.project ?? root));
    const contained = relative(root, project);
    if (
      contained === '..' ||
      contained.startsWith('..' + sep) ||
      isAbsolute(contained)
    )
      throw new Error('PROJECT_OUTSIDE_REGISTERED_ROOT');
    if (
      !(await stat(root)).isDirectory() ||
      !(await stat(project)).isDirectory()
    )
      throw new Error('PROJECT_UNAVAILABLE');
    if ((await stat(root)).dev !== (await stat(project)).dev)
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
            mount !== root &&
            mount.startsWith(root.replace(/\/$/, '') + '/') &&
            (project === mount ||
              project.startsWith(mount.replace(/\/$/, '') + '/')),
        )
      )
        throw new Error('PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT');
    }
    await access(project, constants.R_OK | constants.X_OK);
    const codexHome = await canonicalPath(
      resolve(
        options.codexHome ?? process.env.CODEX_HOME ?? join(home, '.codex'),
      ),
    );
    let codexHomeExists = false;
    try {
      if (!(await stat(codexHome)).isDirectory())
        throw new Error('CODEX_HOME_NOT_DIRECTORY');
      codexHomeExists = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    let writableParent = codexHome;
    while (true) {
      try {
        await stat(writableParent);
        break;
      } catch (error) {
        if (
          (error as NodeJS.ErrnoException).code !== 'ENOENT' ||
          dirname(writableParent) === writableParent
        )
          throw error;
        writableParent = dirname(writableParent);
      }
    }
    await access(writableParent, constants.W_OK | constants.X_OK);
    report.paths = {
      home,
      codexHome,
      codexHomeExists,
      projectRoot: root,
      project,
      executable: await executable(options.codexExecutable),
    };
    report.user = userInfo().username;
    report.credentialScope = `${process.platform}:local:${codexHome}`;
    report.bridge.jsonProjection = 'host-built-in';
    report.ok = true;
    report.diagnostics.push(
      'HOOK_TRUST_UNVERIFIED',
      'DURABLE_CAPTURE_UNVERIFIED',
      'LIFECYCLE_UNQUALIFIED',
    );
  } catch (error) {
    const message = (error as Error).message;
    report.diagnostics.push(
      [
        'PROJECT_OUTSIDE_REGISTERED_ROOT',
        'PROJECT_UNAVAILABLE',
        'EXECUTABLE_UNAVAILABLE',
        'CODEX_HOME_NOT_DIRECTORY',
        'PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT',
      ].includes(message)
        ? message
        : 'PATH_OR_USER_INACCESSIBLE',
    );
  }
  return report;
}
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
/** Execute Docker with the supplied argument vector and return stdout, rejecting on failure. */
export type DockerRead = (args: string[]) => Promise<string>;
const runFile = promisify(execFile);
const dockerRead: DockerRead = async (args) =>
  (
    await runFile('docker', args, {
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 32768,
      windowsHide: true,
    })
  ).stdout;
const inspectFormat =
  '{"id":{{json .Id}},"running":{{json .State.Running}},"paused":{{json .State.Paused}},"status":{{json .State.Status}}}';
async function discoverDocker(
  options: DiscoveryOptions,
  run: DockerRead,
): Promise<DiscoveryReport> {
  const report = initial('docker');
  try {
    if (
      !options.container ||
      options.container.startsWith('-') ||
      // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
      /[\x00-\x1f]/.test(options.container)
    )
      throw new Error('CONTAINER_REQUIRED');
    const context =
      options.dockerContext ?? (await run(['context', 'show'])).trim();
    if (!boundedText(context, 256)) throw new Error('DOCKER_CONTEXT_INVALID');
    report.context = context;
    const args = ['--context', context];
    const endpoint = JSON.parse(
      await run([
        'context',
        'inspect',
        '--format',
        '{{json .Endpoints.docker.Host}}',
        context,
      ]),
    );
    if (
      typeof endpoint !== 'string' ||
      !/^(unix:\/\/\/|npipe:\/\/)/.test(endpoint)
    )
      throw new Error('REMOTE_DOCKER_UNSUPPORTED');
    const daemon = JSON.parse(
      await run([...args, 'info', '--format', '{{json .ID}}']),
    );
    if (typeof daemon !== 'string' || !/^[a-zA-Z0-9:_-]{8,200}$/.test(daemon))
      throw new Error('DOCKER_DAEMON_ID_UNAVAILABLE');
    if (options.expectedDaemonId && options.expectedDaemonId !== daemon)
      throw new Error('DOCKER_DAEMON_CHANGED_REVALIDATE');
    report.daemonId = daemon;
    const instance = JSON.parse(
      await run([
        ...args,
        'inspect',
        '--type',
        'container',
        '--format',
        inspectFormat,
        options.container,
      ]),
    );
    if (
      typeof instance.id !== 'string' ||
      !/^[a-f0-9]{64}$/.test(instance.id) ||
      typeof instance.running !== 'boolean' ||
      typeof instance.paused !== 'boolean'
    )
      throw new Error('CONTAINER_METADATA_INVALID');
    report.generation = instance.id;
    if (
      options.expectedGeneration &&
      options.expectedGeneration !== instance.id
    )
      throw new Error('CONTAINER_REPLACED_REVALIDATE');
    if (instance.paused) throw new Error('CONTAINER_PAUSED');
    if (!instance.running) throw new Error('CONTAINER_STOPPED');
    const execArgs = [
      ...args,
      'exec',
      ...(options.user ? ['--user', options.user] : []),
      instance.id,
    ];
    let interpreter: string;
    try {
      interpreter = (
        await run([
          ...execArgs,
          'sh',
          '-c',
          'command -v python3 || command -v python',
        ])
      ).trim();
    } catch {
      throw new Error('BRIDGE_UNAVAILABLE');
    }
    if (!boundedText(interpreter, 4096) || !interpreter.startsWith('/'))
      throw new Error('BRIDGE_UNAVAILABLE');
    const data = JSON.parse(
      await run([
        ...execArgs,
        interpreter,
        '-E',
        '-s',
        '-S',
        '-B',
        '-c',
        projection,
        options.projectRoot ?? '',
        options.project ?? '',
        options.codexHome ?? '',
        options.codexExecutable ?? '',
      ]),
    );
    const safeErrors = [
      'HOME_USER_MISMATCH',
      'PROJECT_UNAVAILABLE',
      'PROJECT_OUTSIDE_REGISTERED_ROOT',
      'PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT',
      'EXECUTABLE_UNAVAILABLE',
      'CODEX_HOME_NOT_DIRECTORY',
      'PATH_OR_USER_INACCESSIBLE',
    ];
    if (data.error) {
      report.diagnostics.push(
        safeErrors.includes(data.error)
          ? data.error
          : 'TARGET_PROJECTION_INVALID',
      );
      return report;
    }
    if (
      !boundedText(data.user, 256) ||
      !data.paths ||
      !['home', 'codexHome', 'projectRoot', 'project', 'executable'].every(
        (k) =>
          boundedText(data.paths[k], 4096) &&
          data.paths[k].startsWith('/') &&
          posix.normalize(data.paths[k]) === data.paths[k],
      ) ||
      typeof data.paths.codexHomeExists !== 'boolean' ||
      typeof data.permissions?.projectReadable !== 'boolean' ||
      typeof data.permissions?.codexHomeWritable !== 'boolean'
    )
      throw new Error('TARGET_PROJECTION_INVALID');
    const containedProject = posix.relative(
      data.paths.projectRoot,
      data.paths.project,
    );
    if (
      containedProject === '..' ||
      containedProject.startsWith('../') ||
      posix.isAbsolute(containedProject)
    )
      throw new Error('TARGET_PROJECTION_INVALID');
    const afterDaemon = JSON.parse(
      await run([...args, 'info', '--format', '{{json .ID}}']),
    );
    if (afterDaemon !== daemon)
      throw new Error('DOCKER_DAEMON_CHANGED_DURING_DISCOVERY');
    const after = JSON.parse(
      await run([
        ...args,
        'inspect',
        '--type',
        'container',
        '--format',
        inspectFormat,
        options.container,
      ]),
    );
    if (after.id !== instance.id || !after.running || after.paused)
      throw new Error('CONTAINER_CHANGED_DURING_DISCOVERY');
    const {
      home,
      codexHome,
      codexHomeExists,
      projectRoot,
      project,
      executable,
    } = data.paths;
    report.paths = {
      home,
      codexHome,
      codexHomeExists,
      projectRoot,
      project,
      executable,
    };
    report.user = data.user;
    report.credentialScope = `docker:${daemon}:${instance.id}:${data.paths.codexHome}`;
    report.bridge.jsonProjection =
      data.jsonProjection === true ? 'verified' : 'unavailable';
    report.bridge.durableCapture =
      data.durableFacility === true
        ? 'facility-present-unverified'
        : 'unavailable';
    report.ok =
      data.jsonProjection === true &&
      data.permissions.projectReadable &&
      data.permissions.codexHomeWritable;
    report.diagnostics.push(
      'HOOK_TRUST_UNVERIFIED',
      'DURABLE_CAPTURE_UNVERIFIED',
      'LIFECYCLE_UNQUALIFIED',
    );
    if (!report.ok)
      report.diagnostics.push('TARGET_CAPABILITY_OR_PERMISSION_MISSING');
  } catch (error) {
    const code = (error as Error).message;
    report.diagnostics.push(
      [
        'CONTAINER_REQUIRED',
        'DOCKER_CONTEXT_INVALID',
        'CONTAINER_METADATA_INVALID',
        'CONTAINER_REPLACED_REVALIDATE',
        'CONTAINER_PAUSED',
        'CONTAINER_STOPPED',
        'BRIDGE_UNAVAILABLE',
        'TARGET_PROJECTION_INVALID',
        'CONTAINER_CHANGED_DURING_DISCOVERY',
        'REMOTE_DOCKER_UNSUPPORTED',
        'DOCKER_DAEMON_ID_UNAVAILABLE',
        'DOCKER_DAEMON_CHANGED_REVALIDATE',
        'DOCKER_DAEMON_CHANGED_DURING_DISCOVERY',
      ].includes(code)
        ? code
        : 'DOCKER_CONTEXT_OR_CONTAINER_INACCESSIBLE',
    );
  }
  return report;
}

// Python 2.7/3 compatible; no writes, environment enumeration or Codex execution.
const projection = String.raw`
import sys
# Do not import even os/json until cwd, PYTHONPATH and site paths are excluded.
# sys is built in; the interpreter's own prefix defines its trusted stdlib.
prefix = getattr(sys, 'base_prefix', sys.prefix).rstrip('/')
version = '%d.%d' % sys.version_info[:2]
stdlib = [prefix + '/lib/python' + version, prefix + '/lib64/python' + version]
safe_paths = stdlib + [path + '/lib-dynload' for path in stdlib] + [prefix + '/lib/python%d%d.zip' % sys.version_info[:2]]
sys.path[:] = [path for path in sys.path if path.startswith('/') and path in safe_paths]
import os, json, pwd, re
try:
 root_arg, project_arg, codex_arg, exe_arg = sys.argv[1:]
 identity = pwd.getpwuid(os.geteuid())
 home = os.path.realpath(os.environ.get('HOME') or identity.pw_dir)
 if home != os.path.realpath(identity.pw_dir):
  raise ValueError('HOME_USER_MISMATCH')
 root = os.path.realpath(root_arg or os.getcwd())
 project = os.path.realpath(project_arg or root)
 if not os.path.isdir(root) or not os.path.isdir(project):
  raise ValueError('PROJECT_UNAVAILABLE')
 if project != root and not project.startswith(root.rstrip('/') + '/'):
  raise ValueError('PROJECT_OUTSIDE_REGISTERED_ROOT')
 if os.stat(root).st_dev != os.stat(project).st_dev:
  raise ValueError('PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT')
 with open('/proc/self/mountinfo','r') as mountinfo:
  mounts = [re.sub(r'\\([0-7]{3})',lambda match:chr(int(match.group(1),8)),line.split(' ')[4]) for line in mountinfo]
 if any(mount != root and mount.startswith(root.rstrip('/') + '/') and (project == mount or project.startswith(mount.rstrip('/') + '/')) for mount in mounts):
  raise ValueError('PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT')
 codex = os.path.realpath(codex_arg or os.environ.get('CODEX_HOME') or os.path.join(home,'.codex'))
 name = exe_arg or 'codex'
 candidates = [name] if '/' in name else [os.path.join(p,name) for p in os.environ.get('PATH','').split(os.pathsep)]
 executable = next((os.path.realpath(p) for p in candidates if os.path.isfile(p) and os.access(p,os.X_OK)), None)
 if executable is None:
  raise ValueError('EXECUTABLE_UNAVAILABLE')
 parent = codex
 while not os.path.exists(parent) and os.path.dirname(parent) != parent:
  parent = os.path.dirname(parent)
 if os.path.exists(codex) and not os.path.isdir(codex):
  raise ValueError('CODEX_HOME_NOT_DIRECTORY')
 print(json.dumps({'user':identity.pw_name,'paths':{'home':home,'codexHome':codex,'codexHomeExists':os.path.isdir(codex),'projectRoot':root,'project':project,'executable':executable},'jsonProjection':json.loads(json.dumps({'value':1})) == {'value':1},'durableFacility':all(callable(getattr(os,n,None)) for n in ['fsync','rename','open','write']),'permissions':{'projectReadable':os.access(project,os.R_OK | os.X_OK),'codexHomeWritable':os.access(parent,os.W_OK | os.X_OK)}}))
except Exception as error:
 allowed = ['HOME_USER_MISMATCH','PROJECT_UNAVAILABLE','PROJECT_OUTSIDE_REGISTERED_ROOT','PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT','EXECUTABLE_UNAVAILABLE','CODEX_HOME_NOT_DIRECTORY']
 print(json.dumps({'error':str(error) if str(error) in allowed else 'PATH_OR_USER_INACCESSIBLE'}))
`;
