import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import {
  acquireGuard,
  processesForScope,
  type GuardOptions,
  stopScopedProcesses,
} from './scope-guard.js';
import { readDockerTargets, mappedDockerProject } from './docker-targets.js';
import {
  inspectDockerProcesses,
  stopDockerProcesses,
} from './docker-processes.js';
/** Inspect local or named Docker conflicts, offer separately confirmed scoped stops, or hold a local diagnostic guard. Docker resolves the configured project mapping and never takes over its remote guard. Stop cancellation returns 130; surviving or unknown processes block safety. Never changes credentials or launches Codex. */
export async function guardCommand(
  command: 'guard' | 'processes',
  args: string[],
): Promise<number> {
  const json = args.includes('--json');
  const stop = command === 'processes' && args[0] === 'stop';
  if (stop) args = args.slice(1);
  let lease: Awaited<ReturnType<typeof acquireGuard>> | undefined;
  try {
    const values = new Map<string, string>();
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--json' || args[i] === '--hold') continue;
      if (
        ![
          '--state-home',
          '--codex-home',
          '--binding',
          '--analytics-path',
          '--codex-executable',
          '--target',
          '--project',
          '--confirm-scope',
          '--confirm-processes',
          '--confirm-force',
        ].includes(args[i]) ||
        !args[i + 1] ||
        values.has(args[i])
      )
        throw new Error('INVALID_ARGUMENTS');
      values.set(args[i], args[++i]);
    }
    const stateHome =
      values.get('--state-home') ??
      join(
        homedir(),
        process.platform === 'win32'
          ? '.codex-tandem-windows'
          : '.codex-tandem',
      );
    if (values.has('--target') && values.get('--target') !== 'local') {
      if (
        command !== 'processes' ||
        args.includes('--hold') ||
        [
          '--codex-home',
          '--binding',
          '--analytics-path',
          '--codex-executable',
        ].some((k) => values.has(k))
      )
        throw new Error('INVALID_ARGUMENTS');
      const target = (await readDockerTargets(stateHome)).find(
        (t) => t.id === values.get('--target'),
      );
      if (!target) throw new Error('TARGET_NOT_FOUND');
      const project = await mappedDockerProject(
        target,
        resolve(values.get('--project') ?? process.cwd()),
      );
      if (!stop) {
        if (
          ['--confirm-scope', '--confirm-processes', '--confirm-force'].some(
            (k) => values.has(k),
          )
        )
          throw new Error('INVALID_ARGUMENTS');
        process.stdout.write(
          JSON.stringify({
            schemaVersion: 1,
            ok: true,
            ...(await inspectDockerProcesses(target, project)),
          }) + '\n',
        );
        return 0;
      }
      const interactive = !!(
        process.stdin.isTTY &&
        process.stdout.isTTY &&
        process.stderr.isTTY &&
        !json
      );
      const input = interactive
        ? createInterface({ input: process.stdin })
        : undefined;
      const answers = input?.[Symbol.asyncIterator]();
      try {
        const result = await stopDockerProcesses(
          target,
          project,
          async (prompt) => {
            process.stderr.write(
              `Docker scope: ${prompt.scope}\n${prompt.processes.map((p) => `PID ${p.pid}; creation ${p.creation}; ${p.role}; executable ${JSON.stringify(p.executable.replace(/[\p{Cc}\p{Cf}]/gu, '?').slice(0, 4096))}`).join('\n')}\n${prompt.consequences}\nProcess consent key: ${prompt.consentKey}\n`,
            );
            if (!answers)
              return (
                values.get('--confirm-scope') === prompt.scope &&
                values.get(
                  prompt.phase === 'graceful'
                    ? '--confirm-processes'
                    : '--confirm-force',
                ) === prompt.consentKey
              );
            process.stderr.write(
              `Type ${prompt.phase === 'graceful' ? 'stop' : 'force'} to approve this ${prompt.phase} action; anything else cancels: `,
            );
            const answer = await answers.next();
            return (
              !answer.done &&
              answer.value === (prompt.phase === 'graceful' ? 'stop' : 'force')
            );
          },
        );
        process.stdout.write(
          JSON.stringify({
            schemaVersion: 1,
            ok: result.status === 'stopped',
            ...result,
          }) + '\n',
        );
        return result.status === 'cancelled'
          ? 130
          : result.status === 'stopped'
            ? 0
            : 2;
      } finally {
        input?.close();
        if (input) process.stdin.pause();
      }
    }
    if (
      [
        '--project',
        '--confirm-scope',
        '--confirm-processes',
        '--confirm-force',
      ].some((k) => values.has(k))
    )
      throw new Error('INVALID_ARGUMENTS');
    const options: GuardOptions = {
      stateHome:
        values.get('--state-home') ??
        join(
          homedir(),
          process.platform === 'win32'
            ? '.codex-tandem-windows'
            : '.codex-tandem',
        ),
      codexHome:
        values.get('--codex-home') ??
        process.env.CODEX_HOME ??
        join(homedir(), '.codex'),
      bindingPath: values.get('--binding') ?? '',
      analyticsPath: values.get('--analytics-path'),
      codexExecutable: values.get('--codex-executable'),
    };
    if (command === 'processes') {
      if (args.includes('--hold')) throw new Error('INVALID_ARGUMENTS');
      if (stop) {
        const input = createInterface({ input: process.stdin });
        const answers = input[Symbol.asyncIterator]();
        try {
          const result = await stopScopedProcesses(options, async (prompt) => {
            process.stderr.write(
              `Local scope: ${prompt.codexHome}\nGeneration: ${prompt.targetGeneration}\n${prompt.processes.map((p) => `PID ${p.pid}; creation ${p.creation}; ${p.role}; managed; executable ${JSON.stringify((p.executable ?? 'unknown').replace(/[\p{Cc}\p{Cf}]/gu, '?').slice(0, 4096))}; reason: live managed process retains this credential scope and blocks switching`).join('\n')}\n${prompt.consequences}\nType ${prompt.phase === 'graceful' ? 'stop' : 'force'} to approve this ${prompt.phase} action; anything else cancels: `,
            );
            const answer = await answers.next();
            return (
              !answer.done &&
              answer.value === (prompt.phase === 'graceful' ? 'stop' : 'force')
            );
          });
          process.stdout.write(
            JSON.stringify({
              schemaVersion: 1,
              ok: result.status === 'stopped',
              ...result,
            }) + '\n',
          );
          return result.status === 'cancelled'
            ? 130
            : result.status === 'stopped'
              ? 0
              : 2;
        } finally {
          input.close();
          process.stdin.pause();
        }
      }
      const processes = await processesForScope(options);
      const safe = processes.every((p) => p.ownership === 'unrelated');
      process.stdout.write(
        JSON.stringify({ schemaVersion: 1, ok: true, safe, processes }) + '\n',
      );
      return 0;
    }
    if (!options.bindingPath || !args.includes('--hold'))
      throw new Error('GUARD_OPTIONS_REQUIRED');
    lease = await acquireGuard(options);
    process.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        ok: true,
        status: 'held',
        nonce: lease.nonce,
      }) + '\n',
    );
    let interrupted = false;
    await new Promise<void>((resolve) => {
      const finish = () => {
        cleanup();
        resolve();
      };
      const interrupt = () => {
        interrupted = true;
        finish();
      };
      const cleanup = () => {
        process.stdin.off('data', finish);
        process.stdin.off('end', finish);
        process.off('SIGINT', interrupt);
        process.off('SIGTERM', interrupt);
        process.stdin.pause();
      };
      process.stdin.once('data', finish);
      process.stdin.once('end', finish);
      process.once('SIGINT', interrupt);
      process.once('SIGTERM', interrupt);
      process.stdin.resume();
    });
    await lease.release();
    lease = undefined;
    process.stdout.write(
      JSON.stringify({ schemaVersion: 1, ok: true, status: 'released' }) + '\n',
    );
    return interrupted ? 130 : 0;
  } catch (error) {
    let recoveryCode: string | undefined;
    if (lease) {
      try {
        await lease.release();
      } catch (recovery) {
        const reason = (recovery as Error).message;
        recoveryCode = /^[A-Z_]+$/.test(reason)
          ? reason
          : 'GUARD_OPERATION_FAILED';
      }
    }
    const message = (error as Error).message;
    const code = /^[A-Z_]+$/.test(message) ? message : 'GUARD_OPERATION_FAILED';
    process.stderr.write(
      json
        ? JSON.stringify({
            schemaVersion: 1,
            ok: false,
            code,
            ...(recoveryCode ? { recoveryRequired: true, recoveryCode } : {}),
          }) + '\n'
        : code +
            (recoveryCode ? ' RECOVERY_REQUIRED ' + recoveryCode : '') +
            '\n',
    );
    return 2;
  }
}
