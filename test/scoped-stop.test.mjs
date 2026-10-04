import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  rename,
  symlink,
  copyFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const packageRoot = process.env.TANDEM_TEST_PACKAGE
  ? pathToFileURL(process.env.TANDEM_TEST_PACKAGE + '/')
  : new URL('../', import.meta.url);
const { acquireGuard, stopScopedProcesses } = await import(
  new URL('dist/scope-guard.js', packageRoot)
);
const { processIdentity } = await import(
  new URL('dist/processes.js', packageRoot)
);
const { writePrivate } = await import(
  new URL('dist/private-files.js', packageRoot)
);

async function fixture(ignoresGraceful = false, aliasedHome = false) {
  const root = await mkdtemp(join(tmpdir(), 'ct12-stop-'));
  const home = join(root, 'home');
  await mkdir(home);
  const executable = join(
    root,
    process.platform === 'win32' ? 'ct12 stop probe.exe' : 'ct12 stop probe',
  );
  await copyFile(process.execPath, executable);
  const binding = join(root, 'binding.json');
  await writeFile(binding, 'SYNTHETIC-SAVED');
  await writeFile(join(home, 'auth.json'), 'SYNTHETIC-ACTIVE');
  const options = {
    stateHome: join(root, 'state'),
    codexHome: home,
    bindingPath: binding,
    codexExecutable: executable,
  };
  const lease = await acquireGuard(options);
  const processHome = aliasedHome ? join(root, 'home-alias') : home;
  if (aliasedHome)
    await symlink(
      home,
      processHome,
      process.platform === 'win32' ? 'junction' : 'dir',
    );
  const child = spawn(
    options.codexExecutable,
    [
      '-e',
      `${ignoresGraceful ? "process.on('SIGTERM',()=>{});" : ''}process.send('ready');process.on('message',()=>{});`,
      'app-server',
    ],
    {
      env: {
        ...process.env,
        CODEX_HOME: processHome,
        TANDEM_GUARD_NONCE: lease.nonce,
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  await once(child, 'message');
  await lease.registerProcess(child.pid);
  return {
    root,
    home,
    binding,
    options,
    lease,
    child,
    async cleanup() {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGKILL');
        await once(child, 'exit');
      }
      await lease.release();
      await rm(root, { recursive: true, force: true });
    },
  };
}

test('cancel displays the owned scope and leaves its process and credentials unchanged', async () => {
  const { home, binding, options, child, cleanup } = await fixture();
  try {
    const before = await processIdentity(child.pid);
    const prompts = [];
    assert.deepEqual(
      await stopScopedProcesses(options, async (prompt) => {
        prompts.push(prompt);
        return false;
      }),
      { status: 'cancelled', stopped: [], remaining: [child.pid] },
    );
    assert.equal(prompts.length, 1);
    assert.equal(prompts[0].phase, 'graceful');
    assert.equal(prompts[0].codexHome, home);
    assert.deepEqual(
      prompts[0].processes.map((p) => [p.pid, p.creation, p.ownership]),
      [[child.pid, before.creation, 'managed']],
    );
    assert.match(prompts[0].consequences, /credentials/);
    assert.deepEqual(await processIdentity(child.pid), before);
    assert.equal(
      await readFile(join(home, 'auth.json'), 'utf8'),
      'SYNTHETIC-ACTIVE',
    );
    assert.equal(await readFile(binding, 'utf8'), 'SYNTHETIC-SAVED');
  } finally {
    await cleanup();
  }
});

test('a graceful timeout requires a second decision and denied force preserves the survivor', async () => {
  const { home, options, child, cleanup } = await fixture(true);
  try {
    const before = await processIdentity(child.pid);
    const phases = [];
    const result = await stopScopedProcesses(
      { ...options, gracePeriodMs: 100 },
      async (prompt) => {
        phases.push(prompt.phase);
        return prompt.phase === 'graceful';
      },
    );
    assert.deepEqual(phases, ['graceful', 'force']);
    assert.deepEqual(result, {
      status: 'remaining',
      stopped: [],
      remaining: [child.pid],
    });
    assert.deepEqual(await processIdentity(child.pid), before);
    assert.equal(
      await readFile(join(home, 'auth.json'), 'utf8'),
      'SYNTHETIC-ACTIVE',
    );
  } finally {
    await cleanup();
  }
});

test('separately approved force stops only the verified survivor and keeps guard ownership held until release', async () => {
  const { root, home, options, child, cleanup } = await fixture(true);
  const otherHome = join(root, 'other');
  await mkdir(otherHome);
  const other = spawn(
    options.codexExecutable,
    ['-e', "process.send('ready');process.on('message',()=>{});", 'app-server'],
    {
      env: { ...process.env, CODEX_HOME: otherHome },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  await once(other, 'message');
  try {
    const unrelated = await processIdentity(other.pid);
    const ownerBefore = await readFile(
      join(home, '.tandem-home.lock', 'owner.json'),
    );
    const phases = [];
    const result = await stopScopedProcesses(
      { ...options, gracePeriodMs: 100 },
      async (prompt) => {
        phases.push(prompt.phase);
        return true;
      },
    );
    assert.deepEqual(phases, ['graceful', 'force']);
    assert.deepEqual(result, {
      status: 'stopped',
      stopped: [child.pid],
      remaining: [],
    });
    assert.equal(await processIdentity(child.pid), null);
    assert.deepEqual(await processIdentity(other.pid), unrelated);
    assert.deepEqual(
      await readFile(join(home, '.tandem-home.lock', 'owner.json')),
      ownerBefore,
    );
    assert.equal(
      await readFile(join(home, 'auth.json'), 'utf8'),
      'SYNTHETIC-ACTIVE',
    );
  } finally {
    other.kill('SIGKILL');
    await once(other, 'exit');
    await cleanup();
  }
});

test('the installed processes stop command displays a scoped decision and cancel preserves the child', async () => {
  const { home, options, child, cleanup } = await fixture();
  try {
    const cli = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('dist/cli.js', packageRoot)),
        'processes',
        'stop',
        '--codex-home',
        home,
        '--codex-executable',
        options.codexExecutable,
        '--json',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
    let display = '',
      output = '';
    cli.stdout.on('data', (bytes) => (output += bytes));
    cli.stderr.on('data', (bytes) => {
      display += bytes;
      if (display.includes('Type stop')) cli.stdin.end('cancel\n');
    });
    const [code] = await once(cli, 'exit');
    assert.equal(code, 130);
    assert.match(display, /credentials/);
    assert.ok(display.includes(home));
    assert.ok(display.includes(String(child.pid)));
    assert.ok(
      display.includes('executable ' + JSON.stringify(options.codexExecutable)),
    );
    assert.match(display, /reason:.*blocks switching/);
    assert.doesNotMatch(display, /SYNTHETIC-(?:ACTIVE|SAVED|PRIVATE)/);
    assert.equal(display.includes(String.fromCharCode(27)), false);
    assert.equal(JSON.parse(output).status, 'cancelled');
    assert.notEqual(await processIdentity(child.pid), null);
  } finally {
    await cleanup();
  }
});

test(
  'a normal POSIX signal stops an owned server without requesting force',
  { skip: process.platform === 'win32' },
  async () => {
    const { options, child, cleanup } = await fixture();
    try {
      const phases = [];
      const result = await stopScopedProcesses(
        { ...options, gracePeriodMs: 1000 },
        async (prompt) => {
          phases.push(prompt.phase);
          return true;
        },
      );
      assert.deepEqual(phases, ['graceful']);
      assert.deepEqual(result, {
        status: 'stopped',
        stopped: [child.pid],
        remaining: [],
      });
      assert.equal(child.signalCode, 'SIGTERM');
    } finally {
      await cleanup();
    }
  },
);

test('an unregistered old-context server blocks stopping without presenting an approval', async () => {
  const { options, home, child, cleanup } = await fixture();
  const unknown = spawn(
    options.codexExecutable,
    ['-e', "process.send('ready');process.on('message',()=>{});", 'app-server'],
    {
      env: { ...process.env, CODEX_HOME: home },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  await once(unknown, 'message');
  try {
    let prompted = false;
    await assert.rejects(
      stopScopedProcesses(options, async () => {
        prompted = true;
        return true;
      }),
      /PROCESS_OWNERSHIP_UNPROVEN/,
    );
    assert.equal(prompted, false);
    assert.notEqual(await processIdentity(unknown.pid), null);
    assert.notEqual(await processIdentity(child.pid), null);
  } finally {
    unknown.kill('SIGKILL');
    await once(unknown, 'exit');
    await cleanup();
  }
});

for (const changed of ['nonce', 'creation']) {
  test(`changed ${changed} after force consent blocks termination of the still-live process`, async () => {
    const { home, options, child, cleanup } = await fixture(true);
    const ownerPath = join(home, '.tandem-home.lock', 'owner.json');
    const before = await readFile(ownerPath);
    try {
      const identity = await processIdentity(child.pid);
      await assert.rejects(
        stopScopedProcesses(
          { ...options, gracePeriodMs: 100 },
          async (prompt) => {
            if (prompt.phase === 'force') {
              const owner = JSON.parse(before);
              if (changed === 'nonce') owner.nonce = 'f'.repeat(64);
              else owner.processes[0].creation = 'unrelated-reused-creation';
              await writePrivate(ownerPath, JSON.stringify(owner));
            }
            return true;
          },
        ),
        /LOCK_OWNER_CHANGED|LOCK_OWNER_INVALID|PROCESS_OWNERSHIP_UNPROVEN|PID_REUSED/,
      );
      assert.deepEqual(await processIdentity(child.pid), identity);
      assert.equal(
        await readFile(join(home, 'auth.json'), 'utf8'),
        'SYNTHETIC-ACTIVE',
      );
    } finally {
      await writePrivate(ownerPath, before);
      await cleanup();
    }
  });
}

test('replaced physical home generation after consent blocks stopping and preserves the process', async () => {
  const { home, options, child, cleanup } = await fixture();
  const moved = home + '-original';
  let replaced = false;
  try {
    const identity = await processIdentity(child.pid);
    await assert.rejects(
      stopScopedProcesses(options, async () => {
        await rename(home, moved);
        await mkdir(home);
        replaced = true;
        return true;
      }),
      /SCOPE_PATH_CHANGED/,
    );
    assert.deepEqual(await processIdentity(child.pid), identity);
    assert.equal(
      await readFile(join(moved, 'auth.json'), 'utf8'),
      'SYNTHETIC-ACTIVE',
    );
  } finally {
    if (replaced) {
      await rm(home, { recursive: true });
      await rename(moved, home);
    }
    await cleanup();
  }
});

test('separately approved stop resolves a process home alias by physical identity', async () => {
  const { options, child, cleanup } = await fixture(true, true);
  try {
    const result = await stopScopedProcesses(
      { ...options, gracePeriodMs: 100 },
      async () => true,
    );
    assert.deepEqual(result, {
      status: 'stopped',
      stopped: [child.pid],
      remaining: [],
    });
    assert.equal(await processIdentity(child.pid), null);
  } finally {
    await cleanup();
  }
});

test('omitting the executable still presents and stops every registered live process', async () => {
  const { home, binding, child, cleanup } = await fixture(true);
  try {
    const before = await processIdentity(child.pid);
    const ownerPath = join(home, '.tandem-home.lock', 'owner.json');
    const ownerBefore = await readFile(ownerPath);
    const prompts = [];
    assert.deepEqual(
      await stopScopedProcesses({ codexHome: home }, async (prompt) => {
        prompts.push(prompt);
        return false;
      }),
      { status: 'cancelled', stopped: [], remaining: [child.pid] },
    );
    assert.equal(prompts.length, 1);
    assert.deepEqual(
      prompts[0].processes.map((p) => p.pid),
      [child.pid],
    );
    assert.deepEqual(await processIdentity(child.pid), before);
    await assert.rejects(
      stopScopedProcesses(
        { codexHome: home, codexExecutable: process.execPath },
        async () => {
          throw new Error('An incompatible selector must not present consent');
        },
      ),
      /PROCESS_SELECTOR_MISMATCH/,
    );
    assert.deepEqual(await readFile(ownerPath), ownerBefore);
    const phases = [];
    assert.deepEqual(
      await stopScopedProcesses(
        { codexHome: home, gracePeriodMs: 100 },
        async (prompt) => {
          phases.push(prompt.phase);
          return true;
        },
      ),
      { status: 'stopped', stopped: [child.pid], remaining: [] },
    );
    assert.deepEqual(phases, ['graceful', 'force']);
    assert.equal(await processIdentity(child.pid), null);
    assert.deepEqual(await readFile(ownerPath), ownerBefore);
    assert.equal(await readFile(binding, 'utf8'), 'SYNTHETIC-SAVED');
  } finally {
    await cleanup();
  }
});

test('both installed stop decisions display the executable and blocking reason without private data', async () => {
  const { home, options, child, cleanup } = await fixture(true);
  try {
    const identity = await processIdentity(child.pid);
    const cli = spawn(
      process.execPath,
      [
        fileURLToPath(new URL('dist/cli.js', packageRoot)),
        'processes',
        'stop',
        '--codex-home',
        home,
        '--codex-executable',
        options.codexExecutable,
        '--json',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    let display = '',
      output = '',
      approved = false,
      declined = false;
    cli.stdout.on('data', (bytes) => (output += bytes));
    cli.stderr.on('data', (bytes) => {
      display += bytes;
      if (!approved && display.includes('Type stop')) {
        approved = true;
        cli.stdin.write('stop\n');
      }
      if (!declined && display.includes('Type force')) {
        declined = true;
        cli.stdin.end('cancel\n');
      }
    });
    const [code] = await once(cli, 'exit');
    assert.equal(code, 2);
    assert.equal(JSON.parse(output).status, 'remaining');
    const decisions = display.split('Local scope:').slice(1);
    assert.equal(decisions.length, 2);
    for (const decision of decisions) {
      assert.ok(
        decision.includes(
          'executable ' + JSON.stringify(options.codexExecutable),
        ),
      );
      assert.match(decision, /reason:.*blocks switching/);
      assert.ok(decision.includes(String(child.pid)));
      assert.ok(decision.includes(home));
      assert.doesNotMatch(decision, /SYNTHETIC-(?:ACTIVE|SAVED|PRIVATE)/);
      assert.equal(decision.includes(String.fromCharCode(27)), false);
    }
    assert.deepEqual(await processIdentity(child.pid), identity);
  } finally {
    await cleanup();
  }
});

test(
  'a disappearing unrelated global Node worker is excluded by the fixture executable',
  { skip: process.platform !== 'linux' },
  async () => {
    const { root, options, child, cleanup } = await fixture();
    const otherHome = join(root, 'global-worker-home');
    await mkdir(otherHome);
    const worker = spawn(
      process.execPath,
      [
        '-e',
        "process.on('message',()=>{});process.send('ready');",
        'app-server',
      ],
      {
        env: { ...process.env, CODEX_HOME: otherHome },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    );
    const exited = once(worker, 'exit');
    await once(worker, 'message');
    const owner = await processIdentity(worker.pid);
    const fs = (await import('node:fs/promises')).default;
    const { syncBuiltinESMExports } = await import('node:module');
    const nativeReadFile = fs.readFile;
    let candidateStatReads = 0;
    try {
      fs.readFile = async (path, ...args) => {
        if (
          path === '/proc/' + worker.pid + '/stat' &&
          ++candidateStatReads === 2
        ) {
          assert.deepEqual(await processIdentity(worker.pid), owner);
          assert.equal(worker.kill('SIGKILL'), true);
          await exited;
          assert.equal(await processIdentity(worker.pid), null);
          throw Object.assign(new Error('synthetic disappearing worker'), {
            code: 'ESRCH',
          });
        }
        return nativeReadFile(path, ...args);
      };
      syncBuiltinESMExports();
      assert.deepEqual(await stopScopedProcesses(options, async () => false), {
        status: 'cancelled',
        stopped: [],
        remaining: [child.pid],
      });
      assert.equal(candidateStatReads, 0);
      assert.deepEqual(await processIdentity(worker.pid), owner);
    } finally {
      fs.readFile = nativeReadFile;
      syncBuiltinESMExports();
      if (worker.exitCode === null && worker.signalCode === null) {
        assert.deepEqual(await processIdentity(worker.pid), owner);
        worker.kill('SIGKILL');
        await exited;
      }
      await cleanup();
    }
  },
);
