import assert from 'node:assert/strict';
import { spawn, execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { once } from 'node:events';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
async function readProcesses(pids, directory = 'System32') {
  const source = await readFile(
    new URL('../src/windows-process-reader.ps1', import.meta.url),
    'utf8',
  );
  // Strip full-line comments and indentation before encoding to keep the Windows
  // command line below its length limit without changing executable content.
  const script = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .join('\n');
  const { stdout, stderr } = await execute(
    join(
      process.env.SystemRoot,
      directory,
      'WindowsPowerShell/v1.0/powershell.exe',
    ),
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-EncodedCommand',
      Buffer.from(script, 'utf16le').toString('base64'),
    ],
    {
      env: { ...process.env, TANDEM_PROCESS_PIDS: JSON.stringify(pids) },
      windowsHide: true,
      timeout: 15000,
      maxBuffer: 32768,
    },
  ).catch((error) => {
    throw new Error(`Reader failed: ${error.code}; ${error.stdout}`);
  });
  assert.equal(stderr, '');
  return { raw: stdout, value: JSON.parse(stdout) };
}

function startChild(scope = {}) {
  return spawn(
    process.execPath,
    ['-e', "process.stdout.write('ready'); setInterval(()=>{},1000)"],
    {
      env: {
        ...process.env,
        CODEX_HOME: 'C:\\tandem scope\\codex',
        HOME: 'C:\\tandem home',
        USERPROFILE: 'C:\\tandem user',
        TANDEM_GUARD_NONCE: 'a'.repeat(64),
        TANDEM_TEST_SECRET: 'must-never-appear-in-reader-output',
        ...scope,
      },
      windowsHide: true,
    },
  );
}

async function stopChild(child) {
  child.kill();
  await once(child, 'exit');
}

test(
  'Windows reader returns bounded scope from a live child without exposing other environment values',
  { skip: process.platform !== 'win32' },
  async () => {
    const child = startChild();
    try {
      await once(child.stdout, 'data');
      const { raw, value: response } = await readProcesses([child.pid]);
      assert.equal(raw.includes('must-never-appear'), false);
      assert.equal(response.version, 1);
      const [row] = response.rows;
      assert.equal(row.status, 'known');
      assert.equal(row.pid, child.pid);
      assert.equal(row.parentPid, process.pid);
      assert.match(row.creation, /^\d+:S-1-/);
      assert.equal(row.role, 'foreground');
      assert.deepEqual(row.scope, {
        CODEX_HOME: 'C:\\tandem scope\\codex',
        HOME: 'C:\\tandem home',
        USERPROFILE: 'C:\\tandem user',
        TANDEM_GUARD_NONCE: 'a'.repeat(64),
      });
    } finally {
      await stopChild(child);
    }
  },
);

test(
  'Windows reader keeps relative scope and invalid nonce unknown while proving absent PIDs separately',
  { skip: process.platform !== 'win32' },
  async () => {
    const relative = startChild({ CODEX_HOME: 'relative\\codex' });
    const invalidNonce = startChild({ TANDEM_GUARD_NONCE: 'untrusted marker' });
    try {
      await Promise.all([
        once(relative.stdout, 'data'),
        once(invalidNonce.stdout, 'data'),
      ]);
      const { value: response } = await readProcesses([
        relative.pid,
        invalidNonce.pid,
        2147483647,
      ]);
      assert.deepEqual(response.rows, [
        { status: 'unknown', pid: relative.pid },
        { status: 'unknown', pid: invalidNonce.pid },
        { status: 'absent', pid: 2147483647 },
      ]);
    } finally {
      await Promise.all([stopChild(relative), stopChild(invalidNonce)]);
    }
  },
);

test(
  'Windows reader returns unknown without scope when the caller architecture is unsupported',
  { skip: process.platform !== 'win32' || process.arch !== 'x64' },
  async () => {
    const child = startChild();
    try {
      await once(child.stdout, 'data');
      const { value: response } = await readProcesses([child.pid], 'SysWOW64');
      assert.deepEqual(response.rows, [{ status: 'unknown', pid: child.pid }]);
    } finally {
      await stopChild(child);
    }
  },
);
