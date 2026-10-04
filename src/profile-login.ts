import { spawn } from 'node:child_process';
import { readFile, rm, lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  privateDirectory,
  writePrivate,
  verifyPrivate,
} from './private-files.js';
/** Existing Codex invocation. prefix permits a Node-hosted existing CLI entrypoint; no shell or credential arguments are accepted. */
export type CodexCommand = { executable: string; prefix?: string[] };
/** Explicit login inputs. File-mode consent authorizes a staging-only override and restricted backup; the live Codex home is never patched. */
export type StagedLoginOptions = {
  command: CodexCommand;
  codexHome: string;
  stateHome: string;
  cwd: string;
  approveFileMode?: boolean;
};
type Policy = {
  mode: string;
  forcedMethod: unknown;
  forcedWorkspace: unknown;
  provider: unknown;
  providers: unknown;
  baseUrl: unknown;
};
async function inspect(
  command: CodexCommand,
  home: string,
  cwd: string,
  policyArguments: string[] = [],
): Promise<Policy> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command.executable,
      [...(command.prefix ?? []), 'app-server', ...policyArguments],
      {
        cwd,
        env: { ...process.env, CODEX_HOME: home },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        shell: false,
      },
    );
    let buffer = '';
    let size = 0;
    let settled = false;
    let result: Policy | undefined;
    let config: Record<string, unknown> | undefined;
    const stop = (error?: string) => {
      if (settled) return;
      settled = true;
      if (error) reject(new Error(error));
      else resolve(result!);
    };
    const kill = (error: string) => {
      result = undefined;
      failure = error;
      child.kill();
    };
    let failure: string | undefined;
    const timer = setTimeout(() => kill('POLICY_INSPECTION_FAILED'), 15000);
    const send = (value: unknown) =>
      child.stdin.write(JSON.stringify(value) + '\n');
    child.stdin.on('error', () => kill('POLICY_INSPECTION_FAILED'));
    child.stderr.on('data', (bytes: Buffer) => {
      size += bytes.length;
      if (size > 1048576) kill('POLICY_INSPECTION_FAILED');
    });
    child.stdout.on('data', (bytes: Buffer) => {
      size += bytes.length;
      if (size > 1048576) return kill('POLICY_INSPECTION_FAILED');
      buffer += bytes.toString('utf8');
      while (buffer.includes('\n')) {
        const end = buffer.indexOf('\n');
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const message = JSON.parse(line);
          if (message.error) return kill('POLICY_INSPECTION_FAILED');
          if (message.id === 0) {
            send({ method: 'initialized' });
            send({
              id: 1,
              method: 'config/read',
              params: { includeLayers: true, cwd },
            });
          }
          if (message.id === 1) {
            config = message.result?.config;
            const layers = message.result?.layers;
            if (
              !config ||
              !Array.isArray(layers) ||
              layers.some((layer: unknown) =>
                JSON.stringify(layer).includes('enterpriseManaged'),
              )
            )
              return kill('POLICY_UNVERIFIABLE');
            send({ id: 2, method: 'configRequirements/read', params: null });
          }
          if (message.id === 2) {
            if (
              !config ||
              !message.result ||
              !Object.hasOwn(message.result, 'requirements')
            )
              return kill('POLICY_UNVERIFIABLE');
            const requirements = message.result.requirements;
            if (
              requirements?.cliAuthCredentialsStore &&
              requirements.cliAuthCredentialsStore !== 'file'
            )
              return kill('FILE_STORAGE_PROHIBITED');
            if (requirements !== null) return kill('POLICY_UNVERIFIABLE');
            const mode = config.cli_auth_credentials_store;
            if (
              !['file', 'keyring', 'auto', 'ephemeral'].includes(String(mode))
            )
              return kill('POLICY_UNVERIFIABLE');
            const method = config.forced_login_method ?? null;
            const workspace = config.forced_chatgpt_workspace_id ?? null;
            const safeText = (value: unknown) =>
              typeof value === 'string' &&
              value.length > 0 &&
              value.length <= 256 &&
              !/[\p{Cc}\p{Cf}]/u.test(value);
            if (
              (method !== null &&
                !['chatgpt', 'api'].includes(String(method))) ||
              (workspace !== null &&
                !(
                  safeText(workspace) ||
                  (Array.isArray(workspace) &&
                    workspace.length > 0 &&
                    workspace.every(safeText))
                )) ||
              (config.model_provider && config.model_provider !== 'openai') ||
              (config.model_providers &&
                (typeof config.model_providers !== 'object' ||
                  Object.keys(config.model_providers).length > 0))
            )
              return kill('POLICY_UNVERIFIABLE');
            if (method === 'api') return kill('AUTH_METHOD_UNSUPPORTED');
            result = {
              mode: String(mode),
              forcedMethod: config.forced_login_method ?? null,
              forcedWorkspace: config.forced_chatgpt_workspace_id ?? null,
              provider: config.model_provider ?? null,
              providers: config.model_providers ?? null,
              baseUrl: config.chatgpt_base_url ?? null,
            };
            child.kill();
          }
        } catch {
          return kill('POLICY_INSPECTION_FAILED');
        }
      }
    });
    child.once('error', () => {
      clearTimeout(timer);
      stop('CODEX_UNAVAILABLE');
    });
    child.once('close', () => {
      clearTimeout(timer);
      stop(failure ?? (result ? undefined : 'POLICY_INSPECTION_FAILED'));
    });
    send({
      id: 0,
      method: 'initialize',
      params: {
        clientInfo: { name: 'codex-tandem', version: '0.1.0' },
        capabilities: { experimentalApi: true },
      },
    });
  });
}
async function configBytes(home: string): Promise<Buffer> {
  try {
    const path = join(home, 'config.toml');
    if (!(await lstat(path)).isFile()) throw new Error('CONFIG_UNSUPPORTED');
    const handle = await open(path, 'r');
    try {
      if ((await handle.stat()).size > 262144)
        throw new Error('CONFIG_UNSUPPORTED');
      const data = Buffer.alloc(262145);
      const { bytesRead } = await handle.read(data, 0, data.length, 0);
      if (bytesRead > 262144) throw new Error('CONFIG_UNSUPPORTED');
      return data.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return Buffer.alloc(0);
    throw error;
  }
}
/** Preview effective storage through existing Codex RPC. Returns allowlisted policy only; incomplete managed/cloud policy blocks staging instead of being overridden. */
export async function previewLogin(
  options: StagedLoginOptions,
): Promise<{ mode: string; change: string; backupRequired: boolean }> {
  const policy = await inspect(options.command, options.codexHome, options.cwd);
  return {
    mode: policy.mode,
    change: policy.mode === 'file' ? 'none' : 'staging-only file mode',
    backupRequired: policy.mode !== 'file',
  };
}
/** Require effective file-backed policy for activation and check the selected workspace against local restrictions. Optional policyArguments are pairs of -c/--config/--enable/--disable and their unchanged values, applied only to this read-only probe. Does not change stored configuration or initiate login; malformed arguments and unproven policy throw. */
export async function verifyActivationPolicy(
  options: StagedLoginOptions & {
    /** Qualified config/feature flag-value pairs for this activation's policy probe. Prompts, subcommands and named profiles are not supported. */
    policyArguments?: string[];
  },
  account: string,
): Promise<void> {
  const argumentsForPolicy = options.policyArguments ?? [];
  if (
    argumentsForPolicy.length % 2 ||
    argumentsForPolicy.some((value, index) =>
      index % 2 === 0
        ? !['-c', '--config', '--enable', '--disable'].includes(value)
        : typeof value !== 'string',
    )
  )
    throw new Error('POLICY_ARGUMENTS_INVALID');
  const policy = await inspect(
    options.command,
    options.codexHome,
    options.cwd,
    options.policyArguments,
  );
  if (policy.mode !== 'file') throw new Error('FILE_STORAGE_REQUIRED');
  if (
    policy.forcedWorkspace !== null &&
    !(
      Array.isArray(policy.forcedWorkspace)
        ? policy.forcedWorkspace
        : [policy.forcedWorkspace]
    ).includes(account)
  )
    throw new Error('WORKSPACE_POLICY_MISMATCH');
}
/**
 * Run explicitly requested Codex login in a restricted staging home and return
 * bounded private auth bytes after success. Tandem does not replace live credentials
 * or configuration; existing Codex policy inspection may perform its normal refresh.
 * Unproven effective policy blocks login.
 */
export async function stagedCredential(
  options: StagedLoginOptions,
): Promise<Buffer> {
  const original = await inspect(
    options.command,
    options.codexHome,
    options.cwd,
  );
  if (original.mode !== 'file' && !options.approveFileMode)
    throw new Error('FILE_MODE_APPROVAL_REQUIRED');
  const bytes = await configBytes(options.codexHome);
  const stage = await privateDirectory(
    join(options.stateHome, `login-${randomUUID()}`),
  );
  try {
    if (original.mode !== 'file')
      await writePrivate(
        join(options.stateHome, `config-backup-${randomUUID()}.toml`),
        bytes,
      );
    await writePrivate(join(stage, 'config.toml'), bytes);
    const command = {
      ...options.command,
      prefix: [
        ...(options.command.prefix ?? []),
        '-c',
        'cli_auth_credentials_store="file"',
      ],
    };
    const staged = await inspect(command, stage, options.cwd);
    if (
      staged.mode !== 'file' ||
      JSON.stringify({ ...original, mode: 'file' }) !== JSON.stringify(staged)
    )
      throw new Error('STAGING_POLICY_MISMATCH');
    const status = await new Promise<number>((resolve, reject) => {
      const child = spawn(
        command.executable,
        [...(command.prefix ?? []), 'login'],
        {
          cwd: options.cwd,
          env: { ...process.env, CODEX_HOME: stage },
          stdio: ['inherit', process.stderr, process.stderr],
          windowsHide: true,
          shell: false,
        },
      );
      const interrupt = () => child.kill('SIGINT');
      const terminate = () => child.kill('SIGTERM');
      process.on('SIGINT', interrupt);
      process.on('SIGTERM', terminate);
      const cleanup = () => {
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', terminate);
      };
      child.once('error', () => {
        cleanup();
        reject(new Error('CODEX_UNAVAILABLE'));
      });
      child.once('close', (code, signal) => {
        cleanup();
        resolve(code ?? (signal === 'SIGINT' ? 130 : 1));
      });
    });
    if (status !== 0)
      throw new Error(status === 130 ? 'LOGIN_CANCELED' : 'LOGIN_FAILED');
    const after = await inspect(command, stage, options.cwd);
    if (JSON.stringify(staged) !== JSON.stringify(after))
      throw new Error('STAGING_POLICY_MISMATCH');
    const auth = join(stage, 'auth.json');
    await verifyPrivate(auth);
    if ((await lstat(auth)).size > 65536) throw new Error('CREDENTIAL_INVALID');
    const credential = await readFile(auth);
    if (credential.length > 65536) throw new Error('CREDENTIAL_INVALID');
    return credential;
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}
