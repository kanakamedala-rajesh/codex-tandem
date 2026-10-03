import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir, release } from 'node:os';

// Run only after explicit destination-specific credential-copy approval.
// The caller manually activates A/B between fully exited processes.
const [binary, root, mode] = process.argv.slice(2);
if (
  !binary ||
  !['A', 'B'].includes(mode) ||
  resolve(root) !== join(homedir(), 'codex-tandem-ct06-qualification-20261002')
)
  throw new Error('INVALID_EXPERIMENT_SCOPE');
const context = {
  launchId: `ct06_${process.platform}_${mode}`,
  identity: mode,
  platform: process.platform,
};
const contextPath = join(root, `context-${mode}.json`);
writeFileSync(contextPath, JSON.stringify(context), {
  flag: 'wx',
  mode: 0o400,
});
const env = {
  ...process.env,
  CODEX_HOME: join(root, 'codex-home'),
  TANDEM_CT06_CONTEXT: contextPath,
};
delete env.OPENAI_API_KEY;
delete env.CODEX_API_KEY;
delete env.OPENAI_BASE_URL;
const command = [
  '--no-daemon',
  '--sandbox',
  'read-only',
  '-c',
  'cli_auth_credentials_store="file"',
  'exec',
];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
let session;
if (mode === 'B') {
  session = readFileSync(join(root, 'session-id'), 'utf8');
  if (!uuid.test(session)) throw new Error('INVALID_SESSION');
  command.push('resume', '--skip-git-repo-check', '--json', session);
} else command.push('--skip-git-repo-check', '--json');
command.push('Reply only OK. Do not use tools.');
const probe = spawnSync(binary, command, {
  cwd: root,
  env,
  encoding: 'utf8',
  timeout: 55000,
  maxBuffer: 1024 * 1024,
});
const records = [];
for (const line of (probe.stdout ?? '').split('\n')) {
  try {
    const value = JSON.parse(line);
    if (value && typeof value === 'object') records.push(value);
  } catch {
    /* no raw persistence */
  }
}
const started = records.find((value) => value.type === 'thread.started');
if (!uuid.test(started?.thread_id ?? ''))
  throw new Error('NATIVE_SESSION_UNAVAILABLE');
if (mode === 'A')
  writeFileSync(join(root, 'session-id'), started.thread_id, {
    flag: 'wx',
    mode: 0o600,
  });
const nativeStart = records.find((value) => value.type === 'turn.started');
const errors = JSON.stringify(
  records.filter((value) => ['error', 'turn.failed'].includes(value.type)),
).toLowerCase();
const result = {
  platform: process.platform,
  release: release(),
  node: process.version,
  mode,
  context,
  exit: probe.status,
  timedOut: probe.error?.code === 'ETIMEDOUT',
  sessionId: started.thread_id,
  sameSession: mode === 'A' || started.thread_id === session,
  nativeTurnStarted: Boolean(nativeStart),
  nativeTurnIdAvailable: uuid.test(nativeStart?.turn_id ?? ''),
  nativeTurnCompleted: records.some((value) => value.type === 'turn.completed'),
  nativeTurnFailed: records.some((value) => value.type === 'turn.failed'),
  failureCategory:
    errors === '[]'
      ? 'NONE'
      : /usage limit|insufficient_quota|rate limit/.test(errors)
        ? 'QUOTA'
        : /unauthorized|authentication|status 401/.test(errors)
          ? 'AUTHENTICATION'
          : 'OTHER',
  hooks: 'NOT_INSTALLED',
  propagation: 'PARENT_PROCESS_ONLY',
  backgroundServerReuse: 'NOT_EXECUTED',
  rawExported: false,
};
if (readFileSync(contextPath, 'utf8') !== JSON.stringify(context))
  throw new Error('CONTEXT_CHANGED');
writeFileSync(join(root, `result-${mode}.json`), JSON.stringify(result), {
  flag: 'wx',
  mode: 0o600,
});
console.log(JSON.stringify(result));
