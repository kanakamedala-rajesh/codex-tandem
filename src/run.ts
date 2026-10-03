import { readSync, openSync, fstatSync, closeSync } from 'node:fs';
import { selectProfile } from './selector.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
export async function run(args: string[]): Promise<number> {
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
