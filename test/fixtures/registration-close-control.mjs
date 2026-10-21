// Used only by the local-launch fast-exit regression. Hold the manager inside
// native registration until its harmless child terminates, before Node can
// deliver close. The real ownership proof still runs and must refuse the child.
import { registerHooks } from 'node:module';
import { appendFileSync, readFileSync } from 'node:fs';

globalThis.__tandemRegistrationCloseControl = (pid) => {
  const deadline = Date.now() + 1500;
  const pause = new Int32Array(new SharedArrayBuffer(4));
  let terminal = false;
  while (Date.now() < deadline) {
    try {
      const raw = readFileSync(`/proc/${pid}/stat`, 'utf8');
      if (/^Z\s/.test(raw.slice(raw.lastIndexOf(')') + 2))) {
        terminal = true;
        break;
      }
    } catch (error) {
      if (['ENOENT', 'ESRCH'].includes(error.code)) {
        terminal = true;
        break;
      }
      throw error;
    }
    Atomics.wait(pause, 0, 0, 5);
  }
  if (!terminal) throw new Error('REGISTRATION_CONTROL_TIMEOUT');
  appendFileSync(process.env.TANDEM_TEST_NATIVE_TERMINAL, 'native-terminal\n', {
    mode: 0o600,
  });
};

registerHooks({
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (!url.endsWith('/dist/processes.js')) return result;
    const source = String(result.source);
    const marker = 'export async function proveManagedProcess(';
    if (!source.includes(marker))
      throw new Error('REGISTRATION_CONTROL_UNAVAILABLE');
    return {
      ...result,
      source:
        source.replace(marker, 'async function registrationProof(') +
        `\nexport async function proveManagedProcess(...args) {
          globalThis.__tandemRegistrationCloseControl(args[0]);
          return registrationProof(...args);
        }\n`,
    };
  },
});
