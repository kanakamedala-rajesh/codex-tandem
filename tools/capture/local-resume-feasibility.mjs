import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, release } from 'node:os';
import { join } from 'node:path';

// Credential-free local boundary probe. Authentication approvals cover only the container.
const binary = process.argv[2];
if (!binary) throw new Error('CODEX_BINARY_REQUIRED');
const root = mkdtempSync(join(tmpdir(), 'tandem-ct06-local-'));
try {
  writeFileSync(
    join(root, 'config.toml'),
    'cli_auth_credentials_store = "file"\n',
    { mode: 0o600 },
  );
  const env = { ...process.env, CODEX_HOME: root };
  delete env.OPENAI_API_KEY;
  delete env.CODEX_API_KEY;
  const version = execFileSync(binary, ['--version'], {
    env,
    encoding: 'utf8',
  }).trim();
  if (!/^codex-cli [0-9A-Za-z.+-]+$/.test(version))
    throw new Error('INVALID_VERSION');
  const probe = spawnSync(
    binary,
    [
      '--no-daemon',
      '--sandbox',
      'read-only',
      'exec',
      '--skip-git-repo-check',
      '--json',
      'Reply only OK. Do not use tools.',
    ],
    {
      cwd: root,
      env,
      encoding: 'utf8',
      timeout: 20000,
      maxBuffer: 1024 * 1024,
    },
  );
  const records = [];
  for (const line of (probe.stdout ?? '').split('\n')) {
    try {
      const value = JSON.parse(line);
      if (value && typeof value === 'object') records.push(value);
    } catch {
      /* Raw output stays in memory. */
    }
  }
  const diagnostic = `${probe.stdout ?? ''}${probe.stderr ?? ''}`.toLowerCase();
  const result = {
    platform: process.platform,
    release: release(),
    node: process.version,
    codex: version,
    exit: probe.status,
    timedOut: probe.error?.code === 'ETIMEDOUT',
    authenticationBoundary: /auth|login|log in|sign in|credential/.test(
      diagnostic,
    ),
    nativeTurnStarted: records.some((value) => value.type === 'turn.started'),
    nativeTurnCompleted: records.some(
      (value) => value.type === 'turn.completed',
    ),
    authenticatedResume: 'NOT_EXECUTED',
    hooks: 'NOT_INSTALLED',
    rawExported: false,
  };
  rmSync(root, { recursive: true, force: true });
  console.log(JSON.stringify({ ...result, disposableHomeRemoved: true }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
