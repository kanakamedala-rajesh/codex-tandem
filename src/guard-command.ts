import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  acquireGuard,
  processesForScope,
  type GuardOptions,
} from './scope-guard.js';
/** Inspect local process conflicts or hold a diagnostic credential guard until Enter, EOF or interruption. An explicit home overrides CODEX_HOME, then the native user's .codex default. Never activates credentials, launches Codex or stops processes. */
export async function guardCommand(
  command: 'guard' | 'processes',
  args: string[],
): Promise<number> {
  const json = args.includes('--json');
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
        ].includes(args[i]) ||
        !args[i + 1] ||
        values.has(args[i])
      )
        throw new Error('INVALID_ARGUMENTS');
      values.set(args[i], args[++i]);
    }
    if (values.has('--target') && values.get('--target') !== 'local')
      throw new Error('TARGET_NOT_IMPLEMENTED');
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
