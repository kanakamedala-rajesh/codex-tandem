import { readSync, openSync, fstatSync, closeSync } from 'node:fs';
import { selectProfile } from './selector.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { realpath, stat } from 'node:fs/promises';
import { activateIdentity, type ActivationLease } from './activation.js';
import { discoverTarget } from './discovery.js';
import { claimPrivateState } from './private-state.js';
import { readProfileManifest } from './profiles.js';

function invocationOptions(args: string[], operation: 'run' | 'resume') {
  const configArguments: string[] = [];
  const directories: string[] = [];
  let resume: string | undefined;
  let last = false;
  let commandSeen = operation === 'resume',
    execSeen = false,
    positional = operation === 'resume';
  const valueFlags = [
    '-c',
    '--config',
    '-p',
    '--profile',
    '-C',
    '--cd',
    '-m',
    '--model',
    '-s',
    '--sandbox',
    '-a',
    '--ask-for-approval',
    '--enable',
    '--disable',
    '--add-dir',
    '-i',
    '--image',
    '-o',
    '--output-last-message',
    '--output-schema',
    '--thread-source',
  ];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--') break;
    if (
      [
        '--remote',
        '--code-mode-host',
        '--worktree',
        '--oss',
        '--local-provider',
        '--ignore-user-config',
      ].some((name) => arg === name || arg.startsWith(name + '='))
    )
      throw new Error('CODEX_SCOPE_UNPROVEN');
    if (arg === '--last') last = true;
    const attachedShort = /^-[cpCmsaio].+/.test(arg)
      ? arg.slice(0, 2)
      : undefined;
    const flag = attachedShort ?? arg.split('=', 1)[0];
    if (valueFlags.includes(flag)) {
      const value = attachedShort
        ? arg.slice(2)
        : arg.includes('=')
          ? arg.slice(arg.indexOf('=') + 1)
          : args[++i];
      if (!value) throw new Error('INVALID_ARGUMENTS');
      if (
        ['-c', '--config', '-p', '--profile', '--enable', '--disable'].includes(
          flag,
        )
      )
        configArguments.push(flag, value);
      if (flag === '-C' || flag === '--cd') directories.push(value);
      continue;
    }
    if (arg.startsWith('-')) continue;
    if (positional) continue;
    if ((!commandSeen || execSeen) && arg === 'resume') {
      resume = '';
      commandSeen = true;
      execSeen = false;
      continue;
    }
    if (!commandSeen && (arg === 'exec' || arg === 'e')) {
      execSeen = true;
      commandSeen = true;
      continue;
    }
    if (resume === '') resume = arg;
    positional = true;
  }
  if (resume === '' || (resume !== undefined && last))
    throw new Error('RESUME_SCOPE_UNPROVEN');
  return { configArguments, directories, resume, last };
}
/**
 * Run the bundled harmless G0 child using a bounded synthetic profile fixture;
 * production credential activation is unavailable. args are run options followed
 * by an optional -- and child arguments. Inherits stdio and forwards signals.
 * Returns the child exit status, 130 on selection cancellation, or 2 on validation
 * or launch failure; failures are written to stderr, using JSON with --json.
 */
async function runFixture(args: string[]): Promise<number> {
  const boundary = args.indexOf('--');
  const options = boundary < 0 ? args : args.slice(0, boundary);
  const json = options.includes('--json');
  const error = (code: string, message: string) => {
    process.stderr.write(
      json
        ? JSON.stringify({ schemaVersion: 1, ok: false, code, message }) + '\n'
        : `${code}: ${message}\n`,
    );
    return 2;
  };
  const values = new Map<string, string>();
  for (let i = 0; i < options.length; i++) {
    if (options[i] === '--json') continue;
    if (
      !['--g0-fixture', '--identity', '--target'].includes(options[i]) ||
      !options[i + 1] ||
      values.has(options[i])
    )
      return error(
        'INVALID_ARGUMENTS',
        'Use [run] --g0-fixture PATH --identity ID --target local -- CHILD_ARGS',
      );
    values.set(options[i], options[++i]);
  }
  if (!values.has('--g0-fixture'))
    return error(
      'G1_ACTIVATION_UNAVAILABLE',
      'Production credential activation is unavailable in G0.',
    );
  if (values.get('--target') !== 'local')
    return error(
      'TARGET_REQUIRED',
      'Specify --target local for the harmless G0 fixture.',
    );
  if (
    !values.has('--identity') &&
    (!(process.stdin.isTTY && process.stdout.isTTY && process.stderr.isTTY) ||
      json)
  )
    return error(
      'IDENTITY_REQUIRED',
      'Without a usable terminal, specify --identity STABLE_ID.',
    );

  let profiles: { id: string; label: string }[];
  try {
    const fd = openSync(values.get('--g0-fixture')!, 'r');
    let raw: string;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.size > 65536) throw new Error();
      const buffer = Buffer.alloc(65537);
      const count = readSync(fd, buffer, 0, buffer.length, 0);
      if (count > 65536) throw new Error();
      raw = buffer.subarray(0, count).toString('utf8');
    } finally {
      closeSync(fd);
    }
    if (Buffer.byteLength(raw) > 65536) throw new Error();
    const manifest = JSON.parse(raw);
    if (
      manifest.schemaVersion !== 1 ||
      manifest.synthetic !== true ||
      Object.keys(manifest).some(
        (k) => !['schemaVersion', 'synthetic', 'profiles'].includes(k),
      ) ||
      !Array.isArray(manifest.profiles)
    )
      throw new Error();
    profiles = manifest.profiles;
    if (
      profiles.length > 500 ||
      profiles.some(
        (p) =>
          !p ||
          Object.keys(p).some((k) => !['id', 'label'].includes(k)) ||
          typeof p.id !== 'string' ||
          !/^[a-zA-Z0-9_-]{1,80}$/.test(p.id) ||
          typeof p.label !== 'string' ||
          p.label.length < 1 ||
          p.label.length > 200 ||
          // eslint-disable-next-line no-control-regex -- Reject control characters in untrusted input.
          /[\x00-\x1f\x7f-\x9f]/.test(p.label),
      ) ||
      new Set(profiles.map((p) => p.id)).size !== profiles.length
    )
      throw new Error();
  } catch {
    return error(
      'INVALID_FIXTURE',
      'Provide bounded schemaVersion 1 synthetic metadata containing only unique profile IDs and labels.',
    );
  }
  if (!profiles.length)
    return error(
      'NO_PROFILES',
      'Add synthetic profile metadata to the G0 fixture.',
    );
  if (!values.has('--identity')) {
    try {
      const selected = await selectProfile(profiles);
      if (selected === null) return 130;
      values.set('--identity', selected);
      process.stderr.write(`Selected synthetic profile [${selected}]\n`);
    } catch {
      return error(
        'SELECTOR_FAILED',
        'Selection failed; no child was launched.',
      );
    }
  }
  if (!profiles.some((p) => p.id === values.get('--identity')))
    return error(
      'IDENTITY_UNKNOWN',
      'Specify a stable profile ID from the fixture.',
    );
  return await new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('./g0-child.js', import.meta.url)),
        ...(boundary < 0 ? [] : args.slice(boundary + 1)),
      ],
      { stdio: 'inherit', shell: false },
    );
    const interrupt = () => {
      child.kill('SIGINT');
    };
    const terminate = () => {
      child.kill('SIGTERM');
    };
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const cleanup = () => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    };
    child.once('error', () => {
      cleanup();
      resolve(
        error(
          'CHILD_START_FAILED',
          'The bundled harmless child could not start.',
        ),
      );
    });
    child.once('exit', (code, signal) => {
      cleanup();
      resolve(
        code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1),
      );
    });
  });
}

/** Launch existing local Codex with a guarded saved identity, or resume a project-scoped UUID when operation is `resume`. Options precede `--`; trailing child arguments and streams remain unchanged, including resume prompt tokens. Physical spawn cwd and raw directory inputs are checked again immediately before spawn; this is not an atomic OS guarantee. Signal observers remain installed through post-exit synchronization and failure cleanup, then are removed. Observed child exit status survives post-exit health errors, reported on stderr; pre-execution failures return 2 and selection cancellation returns 130. Named Codex profiles are refused until their effective policy can be proved. Fixture mode retains the harmless G0 adapter. */
export async function run(
  args: string[],
  operation: 'run' | 'resume' = 'run',
): Promise<number> {
  const boundary = args.indexOf('--');
  const options = boundary < 0 ? args : args.slice(0, boundary);
  if (options.includes('--g0-fixture')) return runFixture(args);
  const json = options.includes('--json');
  const usableTerminal =
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    process.stderr.isTTY &&
    !json;
  const error = (code: string, message: string) => {
    process.stderr.write(
      json
        ? JSON.stringify({ schemaVersion: 1, ok: false, code, message }) + '\n'
        : `${code}: ${message}\n`,
    );
    return 2;
  };
  if (!options.includes('--target') && !usableTerminal)
    return error(
      'TARGET_REQUIRED',
      'Specify --target local or a registered Docker target ID.',
    );
  if (!options.includes('--identity') && !usableTerminal)
    return error(
      'IDENTITY_REQUIRED',
      'Without a usable terminal, specify --identity STABLE_ID.',
    );
  let lease: ActivationLease | undefined;
  let childStarted = false;
  let childStatus: number | undefined;
  let removeSignalHandlers: (() => void) | undefined;
  try {
    let resumeSelection: string | undefined;
    let untracked = false;
    const values = new Map<string, string>();
    for (let i = 0; i < options.length; i++) {
      if (options[i] === '--json') continue;
      if (options[i] === '--untracked') {
        if (untracked) throw new Error('INVALID_ARGUMENTS');
        untracked = true;
        continue;
      }
      if (operation === 'resume' && options[i] === '--last') {
        if (resumeSelection) throw new Error('INVALID_ARGUMENTS');
        resumeSelection = 'last';
        continue;
      }
      if (operation === 'resume' && !options[i].startsWith('-')) {
        if (resumeSelection) throw new Error('INVALID_ARGUMENTS');
        resumeSelection = options[i];
        continue;
      }
      if (
        ![
          '--identity',
          '--target',
          '--state-home',
          '--codex-home',
          '--codex-executable',
          '--codex-script',
          '--project',
        ].includes(options[i]) ||
        !options[i + 1] ||
        options[i + 1].startsWith('--') ||
        values.has(options[i])
      )
        throw new Error('INVALID_ARGUMENTS');
      values.set(options[i], options[++i]);
    }
    if (operation === 'resume' && !resumeSelection)
      throw new Error('RESUME_SELECTION_REQUIRED');
    let childArgs = boundary < 0 ? [] : args.slice(boundary + 1);
    const invocation = invocationOptions(childArgs, operation);
    if (
      invocation.configArguments.some(
        (flag, index) =>
          index % 2 === 0 && (flag === '-p' || flag === '--profile'),
      )
    )
      throw new Error('PROFILE_POLICY_UNVERIFIABLE');
    const rawResume = invocation.resume;
    if (operation === 'resume' && (rawResume || invocation.last))
      throw new Error('RESUME_SCOPE_UNPROVEN');
    const stateHome =
      values.get('--state-home') ??
      join(
        homedir(),
        process.platform === 'win32'
          ? '.codex-tandem-windows'
          : '.codex-tandem',
      );
    let profileId = values.get('--identity');
    if (!profileId) {
      const root = await claimPrivateState(resolve(stateHome), 'installation');
      const profiles = (await readProfileManifest(root)).profiles.filter(
        (p) => p.status === 'available',
      );
      if (!profiles.length) throw new Error('NO_PROFILES');
      profileId = (await selectProfile(profiles)) ?? undefined;
      if (!profileId) return 130;
    }
    if ((values.get('--target') ?? 'local') !== 'local') {
      if (
        ['--codex-home', '--codex-executable', '--codex-script'].some((flag) =>
          values.has(flag),
        )
      )
        throw new Error('TARGET_OVERRIDE_CONFLICT');
      if (invocation.last) throw new Error('RESUME_SCOPE_UNPROVEN');
      const { runDockerTarget } = await import('./docker-run.js');
      return await runDockerTarget({
        stateHome,
        profileId,
        targetId: values.get('--target')!,
        hostProject: values.get('--project') ?? process.cwd(),
        args: childArgs,
        policyArguments: invocation.configArguments,
        directories: invocation.directories,
        resume: resumeSelection,
        rawResume,
        untracked,
        interactive: !!usableTerminal,
        error,
      });
    }
    const initialProject = await realpath(
      resolve(values.get('--project') ?? process.cwd()),
    );
    // Codex resolves unchanged raw -C arguments from this exact spawn cwd, not the canonical effective project.
    const invocationPaths = await Promise.all(
      [
        initialProject,
        ...invocation.directories.map((value) =>
          resolve(initialProject, value),
        ),
      ].map(async (path) => ({
        path,
        physical: await realpath(path),
        info: await stat(path, { bigint: true }),
      })),
    );
    let project = initialProject;
    for (const value of invocation.directories) {
      const effective = await realpath(resolve(initialProject, value));
      if (values.has('--project') && effective !== project)
        throw new Error('PROJECT_OVERRIDE_CONFLICT');
      project = effective;
    }
    const discovery = await discoverTarget({
      target: 'local',
      projectRoot: project,
      project,
      codexHome: values.get('--codex-home'),
      codexExecutable: values.get('--codex-executable'),
    });
    if (!discovery.ok || !discovery.paths)
      throw new Error(discovery.diagnostics[0] ?? 'TARGET_UNAVAILABLE');
    if (/\.(cmd|bat)$/i.test(discovery.paths.executable))
      throw new Error('NATIVE_CODEX_REQUIRED');
    const command = {
      executable: discovery.paths.executable,
      ...(values.has('--codex-script')
        ? { prefix: [resolve(values.get('--codex-script')!)] }
        : {}),
    };
    if (resumeSelection || rawResume) {
      const { resolveLocalResume } = await import('./resume.js');
      const id = await resolveLocalResume(
        discovery.paths.codexHome,
        project,
        resumeSelection ?? rawResume!,
      );
      if (resumeSelection) childArgs = ['resume', id, ...childArgs];
    }
    lease = await activateIdentity({
      stateHome,
      codexHome: discovery.paths.codexHome,
      profileId,
      command,
      projectPath: project,
      policyArguments: invocation.configArguments,
    });
    const launch = await lease.prepareLaunch(
      untracked ? 'untracked' : 'tracked',
    );
    if (untracked)
      error(
        'UNTRACKED_LAUNCH',
        'This explicitly untracked launch has only a private intended-launch record; full capture and attribution are not established.',
      );
    await lease.revalidateBeforeLaunch();
    for (const path of invocationPaths) {
      try {
        const current = await stat(path.path, { bigint: true });
        if (
          (await realpath(path.path)) !== path.physical ||
          current.dev !== path.info.dev ||
          current.ino !== path.info.ino
        )
          throw new Error('LAUNCH_PATH_CHANGED');
      } catch {
        throw new Error('LAUNCH_PATH_CHANGED');
      }
    }
    const child = spawn(
      command.executable,
      [...(command.prefix ?? []), ...childArgs],
      {
        cwd: initialProject,
        env: {
          ...process.env,
          CODEX_HOME: discovery.paths.codexHome,
          TANDEM_LAUNCH_ID: launch.id,
        },
        stdio: 'inherit',
        shell: false,
      },
    );
    const exit = new Promise<number>((resolveExit, reject) => {
      child.once('error', () => reject(new Error('CHILD_START_FAILED')));
      child.once('close', (code, signal) =>
        resolveExit(
          code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1),
        ),
      );
    });
    // Observe exit while native registration runs: short-lived children can disappear
    // before a native reader opens them, but disappearance alone is never success.
    void exit.then(
      (code) => {
        childStatus = code;
      },
      () => {},
    );
    const interrupt = () => {
      if (process.platform !== 'win32') child.kill('SIGINT');
    };
    const terminate = () => {
      if (process.platform !== 'win32') child.kill('SIGTERM');
    };
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    removeSignalHandlers = () => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
    };
    if (child.pid) {
      childStarted = true;
      try {
        await lease.registerProcess(child.pid);
      } catch (registrationError) {
        if (childStatus === undefined) throw registrationError;
        await lease.revalidateBeforeLaunch();
      }
    }
    childStatus = await exit;
    await lease.syncAfterExit();
    await lease.release();
    lease = undefined;
    return childStatus;
  } catch (failure) {
    const code =
      failure instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(failure.message)
        ? failure.message
        : 'LOCAL_LAUNCH_FAILED';
    error(
      code,
      childStarted
        ? 'Managed launch needs diagnosis; target credentials are preserved.'
        : 'Local launch was refused; check identity, target paths, policy and scoped processes.',
    );
    if (lease && (!childStarted || childStatus !== undefined)) {
      try {
        await lease.release();
      } catch {
        error(
          'LEASE_RETAINED',
          'Ownership could not be proved idle; diagnose the retained guard before switching.',
        );
      }
    } else if (lease)
      error(
        'LEASE_RETAINED',
        'The child may remain active; use scoped process diagnosis before switching.',
      );
    return childStatus ?? 2;
  } finally {
    // Keep console interrupts observed while credential and ownership cleanup is still pending.
    removeSignalHandlers?.();
  }
}
