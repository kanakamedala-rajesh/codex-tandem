import { spawn } from 'node:child_process';
import { posix } from 'node:path';

/** Explicitly scoped qualification input, not a production target or activation API. */
export interface G0ContainerExperiment {
  experimental: true;
  generation: string;
  uid: number;
  home: string;
  codexHome: string;
  project: string;
  executable: string;
}

/** Host-only, noninteractive G0 launch. Credentials must already be staged by consent. */
export function planG0ContainerExperiment(
  target: G0ContainerExperiment,
  prompt: string,
) {
  const path = (value: string) =>
    typeof value === 'string' &&
    value.length <= 4096 &&
    value.startsWith('/') &&
    posix.normalize(value) === value &&
    !value.includes('\0');
  if (
    !target ||
    target.experimental !== true ||
    !/^[a-f0-9]{64}$/.test(target.generation) ||
    !Number.isSafeInteger(target.uid) ||
    target.uid <= 0 ||
    ![target.home, target.codexHome, target.project, target.executable].every(
      path,
    ) ||
    !target.codexHome.startsWith(target.home + '/') ||
    !target.project.startsWith(target.home + '/') ||
    typeof prompt !== 'string' ||
    prompt.length < 1 ||
    prompt.length > 4096 ||
    prompt.includes('\0')
  ) {
    throw new Error('INVALID_G0_CONTAINER_EXPERIMENT');
  }
  return {
    executable: 'docker',
    args: [
      'exec',
      '-i',
      '--user',
      String(target.uid),
      '--workdir',
      target.project,
      '--env',
      `HOME=${target.home}`,
      '--env',
      `CODEX_HOME=${target.codexHome}`,
      target.generation,
      '/usr/bin/env',
      '-u',
      'OPENAI_API_KEY',
      '-u',
      'CODEX_API_KEY',
      '-u',
      'OPENAI_BASE_URL',
      target.executable,
      '--no-daemon',
      '--sandbox',
      'workspace-write',
      '-c',
      'cli_auth_credentials_store="file"',
      'exec',
      '--skip-git-repo-check',
      '--json',
      prompt,
    ],
  };
}

export async function runG0ContainerExperiment(
  target: G0ContainerExperiment,
  prompt: string,
): Promise<number> {
  if (process.platform !== 'linux')
    throw new Error('G0_CONTAINER_REQUIRES_LINUX_HOST');
  const command = planG0ContainerExperiment(target, prompt);
  return new Promise((resolve) => {
    const child = spawn(command.executable, command.args, {
      stdio: 'inherit',
      shell: false,
    });
    const interrupt = () => {
      child.kill('SIGINT');
    };
    const terminate = () => {
      child.kill('SIGTERM');
    };
    process.on('SIGINT', interrupt);
    process.on('SIGTERM', terminate);
    const finish = (code: number) => {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', terminate);
      resolve(code);
    };
    child.once('error', () => finish(2));
    child.once('exit', (code, signal) =>
      finish(
        code ?? (signal === 'SIGINT' ? 130 : signal === 'SIGTERM' ? 143 : 1),
      ),
    );
  });
}
