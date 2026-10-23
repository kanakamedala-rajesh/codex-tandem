// Used only by the local-launch fast-exit regression. Hold the manager inside
// native registration until its harmless child terminates, before Node can
// deliver close. The real ownership proof still runs and must refuse the child.
import { registerHooks, syncBuiltinESMExports } from 'node:module';
import childProcess from 'node:child_process';
import { appendFileSync, readFileSync, readdirSync } from 'node:fs';

globalThis.__tandemRegistrationCloseControl = (pid) => {
  const deadline = Date.now() + 1500;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  let terminal = false,
    creation;
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
      const fields = raw
        .slice(raw.lastIndexOf(')') + 2)
        .trim()
        .split(/\s+/);
      if (
        !raw.startsWith(`${pid} (`) ||
        !/^[A-Za-z]$/.test(fields[0] ?? '') ||
        !/^\d+$/.test(fields[19] ?? '')
      )
        throw new Error('REGISTRATION_CONTROL_UNPROVEN');
      creation ??= fields[19];
      if (fields[19] !== creation)
        throw new Error('REGISTRATION_CONTROL_IDENTITY_CHANGED');
      if (['Z', 'X'].includes(fields[0])) {
        const tasks = readdirSync(`/proc/${pid}/task`);
        const fresh = readFileSync(`/proc/${pid}/stat`, 'utf8');
        const confirmed = fresh
          .slice(fresh.lastIndexOf(')') + 2)
          .trim()
          .split(/\s+/);
        if (!fresh.startsWith(`${pid} (`) || confirmed[19] !== creation)
          throw new Error('REGISTRATION_CONTROL_IDENTITY_CHANGED');
        // Match the production terminal-proof precondition: a dead leader
        // alone does not prove the remaining task group has terminated.
        if (
          tasks.length === 1 &&
          tasks[0] === String(pid) &&
          ['Z', 'X'].includes(confirmed[0])
        ) {
          terminal = true;
          break;
        }
      }
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) {
        try {
          readFileSync(`/proc/${pid}/stat`);
        } catch (again) {
          if (['ENOENT', 'ESRCH'].includes(again.code)) {
            terminal = true;
            break;
          }
          throw again;
        }
      } else throw error;
    }
    Atomics.wait(pause, 0, 0, 5);
  }
  if (!terminal) throw new Error('REGISTRATION_CONTROL_TIMEOUT');
  appendFileSync(process.env.TANDEM_TEST_NATIVE_TERMINAL, 'native-terminal\n', {
    mode: 0o600,
  });
};

// The parent test explicitly releases close after native termination proof.
// Old code instead emits its refusal, which the parent observes before release.
// No timer or assumed number of event-loop turns decides this handshake.
if (process.env.TANDEM_TEST_HOLD_CLOSE === '1') {
  const spawn = childProcess.spawn;
  let release;
  process.on('message', (message) => {
    if (message.releaseRegistrationClose && release) {
      release();
      process.disconnect();
    }
  });
  childProcess.spawn = (...args) => {
    const child = spawn(...args);
    if (!args[2]?.env?.TANDEM_LAUNCH_ID) return child;
    const emit = child.emit;
    child.emit = function (event, ...values) {
      if (event !== 'close') return emit.call(this, event, ...values);
      release = () => emit.call(this, event, ...values);
      process.send({ registrationCloseHeld: true });
      return true;
    };
    return child;
  };
  syncBuiltinESMExports();
}
globalThis.__tandemNativeTerminationVerified = () => {
  if (process.env.TANDEM_TEST_HOLD_CLOSE === '1')
    process.send({ nativeTerminationVerified: true });
};

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/dist/processes.js')) return result;
    const source = String(result.source);
    const marker = 'export async function proveManagedProcess(';
    if (!source.includes(marker))
      throw new Error('REGISTRATION_CONTROL_UNAVAILABLE');
    const termination = 'export async function processTerminated(';
    const terminalProof = source.includes(termination)
      ? source.replace(termination, 'async function nativeTermination(') +
        `\nexport async function processTerminated(...args) {
          const terminal = await nativeTermination(...args);
          if (terminal) globalThis.__tandemNativeTerminationVerified();
          return terminal;
        }\n`
      : source;
    return {
      ...result,
      source:
        terminalProof.replace(marker, 'async function registrationProof(') +
        `\nexport async function proveManagedProcess(...args) {
          globalThis.__tandemRegistrationCloseControl(args[0]);
          return registrationProof(...args);
        }\n`,
    };
  },
});
