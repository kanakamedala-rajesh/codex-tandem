import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
const windowsIcacls = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'icacls.exe',
);
const packageRoot = process.env.TANDEM_TEST_PACKAGE
  ? pathToFileURL(process.env.TANDEM_TEST_PACKAGE + '/')
  : new URL('../', import.meta.url);
const { acquireGuard } = await import(
  new URL('dist/scope-guard.js', packageRoot)
);
async function probeExecutable(root) {
  const path = join(
    root,
    process.platform === 'win32' ? 'codex-probe.exe' : 'codex-probe',
  );
  await copyFile(process.execPath, path);
  return path;
}

test('the processes command uses CODEX_HOME unless an explicit home overrides it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const home = join(root, 'home'),
    other = join(root, 'other');
  await mkdir(home);
  await mkdir(other);
  const executable = await probeExecutable(root);
  const { spawn, execFile } = await import('node:child_process');
  const { once } = await import('node:events');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const child = spawn(
    executable,
    ['-e', 'setInterval(()=>{},1000)', 'app-server'],
    {
      env: { ...process.env, CODEX_HOME: home },
      stdio: 'ignore',
    },
  );
  try {
    const entry = fileURLToPath(new URL('dist/cli.js', packageRoot));
    const args = [
      entry,
      'processes',
      '--json',
      '--codex-executable',
      executable,
    ];
    const env = { ...process.env, CODEX_HOME: home };
    const selected = JSON.parse(
      (await run(process.execPath, args, { env })).stdout,
    );
    assert.equal(selected.ok, true);
    assert.equal(selected.safe, false);
    assert.equal(
      selected.processes.find((row) => row.pid === child.pid)?.ownership,
      'unknown',
    );
    const overridden = JSON.parse(
      (await run(process.execPath, [...args, '--codex-home', other], { env }))
        .stdout,
    );
    assert.equal(overridden.safe, true);
    assert.equal(
      overridden.processes.find((row) => row.pid === child.pid)?.ownership,
      'unrelated',
    );
  } finally {
    child.kill();
    await once(child, 'exit');
    await rm(root, { recursive: true, force: true });
  }
});

test('a competing manager cannot hold a different home in the same installation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const stateHome = join(root, 'state');
  const home = join(root, 'home');
  const second = join(root, 'second');
  const bindingPath = join(root, 'binding.json');
  await mkdir(home);
  await mkdir(second);
  await writeFile(bindingPath, '{}');
  let lease;
  try {
    lease = await acquireGuard({
      stateHome,
      codexHome: home,
      bindingPath,
      codexExecutable: await probeExecutable(root),
    });
    await assert.rejects(
      acquireGuard({
        stateHome,
        codexHome: second,
        bindingPath,
        codexExecutable: join(
          root,
          process.platform === 'win32' ? 'codex-probe.exe' : 'codex-probe',
        ),
      }),
      /INSTALLATION_BUSY/,
    );
    await lease.release();
    lease = undefined;
    const next = await acquireGuard({
      stateHome,
      codexHome: second,
      bindingPath,
      codexExecutable: await probeExecutable(root),
    });
    await next.release();
  } finally {
    await lease?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('physical home aliases and shared mutable bindings block across installations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const home = join(root, 'home'),
    other = join(root, 'other'),
    alias = join(root, 'alias');
  const bindingPath = join(root, 'binding.json');
  await mkdir(home);
  await mkdir(other);
  await writeFile(bindingPath, '{}');
  const { symlink } = await import('node:fs/promises');
  await symlink(home, alias, process.platform === 'win32' ? 'junction' : 'dir');
  let first;
  try {
    first = await acquireGuard({
      stateHome: join(root, 'one'),
      codexHome: home,
      bindingPath,
      codexExecutable: await probeExecutable(root),
    });
    await assert.rejects(
      acquireGuard({
        stateHome: join(root, 'two'),
        codexHome: alias,
        bindingPath,
        codexExecutable: join(
          root,
          process.platform === 'win32' ? 'codex-probe.exe' : 'codex-probe',
        ),
      }),
      /HOME_BUSY/,
    );
    await assert.rejects(
      acquireGuard({
        stateHome: join(root, 'two'),
        codexHome: other,
        bindingPath,
        codexExecutable: join(
          root,
          process.platform === 'win32' ? 'codex-probe.exe' : 'codex-probe',
        ),
      }),
      /BINDING_BUSY/,
    );
    await first.release();
    first = undefined;
    const next = await acquireGuard({
      stateHome: join(root, 'two'),
      codexHome: other,
      bindingPath,
      codexExecutable: await probeExecutable(root),
    });
    await next.release();
  } finally {
    await first?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('an exited manager can be recovered but reused PID and changed nonce cannot release its scope', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    codexExecutable: await probeExecutable(root),
    bindingPath: join(root, 'binding.json'),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const script = `import {acquireGuard} from ${JSON.stringify(new URL('dist/scope-guard.js', packageRoot).href)}; await acquireGuard(${JSON.stringify(options)});process.send('ready');setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let lease;
  try {
    await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(() => {
        throw new Error('child acquisition failed');
      }),
    ]);
    child.kill();
    await once(child, 'exit');
    const fs = await import('node:fs/promises');
    const managerFile = join(options.stateHome, 'manager.lock', 'owner.json');
    const beforeRecovery = await fs.readFile(managerFile, 'utf8');
    const displacedHome = options.codexHome + '-displaced';
    const nextHome = join(root, 'next-home');
    await mkdir(nextHome);
    const { writePrivate: replaceOwner } = await import(
      new URL('dist/private-files.js', packageRoot)
    );
    const prior = JSON.parse(beforeRecovery);
    for (const inventory of [
      undefined,
      { codexExecutable: 'relative-probe', executableIdentity: '1:2' },
      { codexExecutable: options.codexExecutable, executableIdentity: null },
      { codexExecutable: null },
    ]) {
      const incomplete = JSON.stringify({ ...prior, inventory });
      await replaceOwner(managerFile, incomplete);
      await assert.rejects(
        acquireGuard({ ...options, codexHome: nextHome }),
        /LOCK_OWNER_INVALID/,
      );
      assert.equal(await fs.readFile(managerFile, 'utf8'), incomplete);
    }
    await replaceOwner(managerFile, beforeRecovery);
    const displacedExecutable = options.codexExecutable + '-displaced';
    await fs.rename(options.codexExecutable, displacedExecutable);
    await assert.rejects(
      acquireGuard({
        ...options,
        codexHome: nextHome,
        codexExecutable: displacedExecutable,
      }),
      { code: 'ENOENT' },
    );
    assert.equal(await fs.readFile(managerFile, 'utf8'), beforeRecovery);
    await copyFile(process.execPath, options.codexExecutable);
    await assert.rejects(
      acquireGuard({
        ...options,
        codexHome: nextHome,
        codexExecutable: displacedExecutable,
      }),
      /PROCESS_EXECUTABLE_CHANGED/,
    );
    assert.equal(await fs.readFile(managerFile, 'utf8'), beforeRecovery);
    await fs.rm(options.codexExecutable);
    await fs.rename(displacedExecutable, options.codexExecutable);
    await fs.rename(options.codexHome, displacedHome);
    await assert.rejects(acquireGuard({ ...options, codexHome: nextHome }), {
      code: 'ENOENT',
    });
    assert.equal(await fs.readFile(managerFile, 'utf8'), beforeRecovery);
    await mkdir(options.codexHome);
    await assert.rejects(
      acquireGuard({ ...options, codexHome: nextHome }),
      /SCOPE_PATH_CHANGED/,
    );
    assert.equal(await fs.readFile(managerFile, 'utf8'), beforeRecovery);
    await rm(options.codexHome, { recursive: true });
    await fs.rename(displacedHome, options.codexHome);
    lease = await acquireGuard(options);
    const { readFile } = await import('node:fs/promises');
    const { writePrivate } = await import(
      new URL('dist/private-files.js', packageRoot)
    );
    const lockFile = join(options.stateHome, 'manager.lock', 'owner.json');
    const original = JSON.parse(await readFile(lockFile, 'utf8'));
    await writePrivate(
      lockFile,
      JSON.stringify({ ...original, nonce: '0'.repeat(64) }),
    );
    await assert.rejects(lease.release(), /LOCK_OWNER_CHANGED/);
    await writePrivate(lockFile, JSON.stringify(original));
    await lease.release();
    lease = undefined;
    const { privateDirectory } = await import(
      new URL('dist/private-files.js', packageRoot)
    );
    await privateDirectory(join(options.stateHome, 'manager.lock'), {
      exclusive: true,
    });
    await writePrivate(
      lockFile,
      JSON.stringify({
        ...original,
        owner: { ...original.owner, creation: 'obsolete-creation' },
      }),
    );
    await assert.rejects(acquireGuard(options), /PID_REUSED/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await lease?.release();
    await rm(root, { recursive: true, force: true });
  }
});

for (const selector of ['same', 'changed', 'omitted']) {
  test(`an unregistered survivor preserves prior scopes with a ${selector} new selector`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
    const options = {
      stateHome: join(root, 'state'),
      codexHome: join(root, 'home'),
      bindingPath: join(root, 'binding.json'),
      codexExecutable: await probeExecutable(root),
    };
    const other = join(root, 'other');
    await mkdir(options.codexHome);
    await mkdir(other);
    await writeFile(options.bindingPath, '{}');
    const nextOptions = { ...options };
    if (selector === 'changed') {
      nextOptions.codexExecutable = join(
        root,
        process.platform === 'win32' ? 'second-probe.exe' : 'second-probe',
      );
      await copyFile(process.execPath, nextOptions.codexExecutable);
    } else if (selector === 'omitted') {
      delete nextOptions.codexExecutable;
    }
    const { spawn } = await import('node:child_process');
    const { once } = await import('node:events');
    const { readFile } = await import('node:fs/promises');
    const identityUrl = new URL('dist/processes.js', packageRoot);
    const { processIdentity } = await import(identityUrl);
    const script = `import {acquireGuard} from ${JSON.stringify(new URL('dist/scope-guard.js', packageRoot).href)};
    import {spawn} from 'node:child_process';import {processIdentity} from ${JSON.stringify(identityUrl.href)};
    const options=${JSON.stringify(options)};await acquireGuard(options);
    const child=spawn(options.codexExecutable,['-e','setInterval(()=>{},1000)','app-server'],{detached:true,stdio:'ignore',env:{...process.env,CODEX_HOME:options.codexHome}});
    child.unref();process.send(await processIdentity(child.pid));setInterval(()=>{},1000);`;
    const manager = spawn(
      process.execPath,
      ['--input-type=module', '-e', script],
      {
        stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      },
    );
    let survivor;
    try {
      [survivor] = await Promise.race([
        once(manager, 'message'),
        once(manager, 'exit').then(() => {
          throw new Error('manager fixture failed');
        }),
      ]);
      manager.kill();
      await once(manager, 'exit');
      assert.equal(
        (await processIdentity(survivor.pid)).creation,
        survivor.creation,
      );
      const paths = [
        join(options.stateHome, 'manager.lock', 'owner.json'),
        join(options.codexHome, '.tandem-home.lock', 'owner.json'),
        join(options.bindingPath + '.tandem-binding.lock', 'owner.json'),
      ];
      const before = await Promise.all(
        paths.map((path) => readFile(path, 'utf8')),
      );
      assert.equal(JSON.parse(before[0]).processes.length, 0);
      for (const stateHome of [options.stateHome, join(root, 'second-state')]) {
        let unexpected;
        try {
          await assert.rejects(async () => {
            unexpected = await acquireGuard({
              ...nextOptions,
              stateHome,
              codexHome: other,
            });
          }, /SCOPED_PROCESSES_CONFLICT|ACTIVE_SCOPED_PROCESS/);
        } finally {
          await unexpected?.release();
        }
        assert.deepEqual(
          await Promise.all(paths.map((path) => readFile(path, 'utf8'))),
          before,
        );
      }
    } finally {
      if (manager.exitCode === null && manager.signalCode === null) {
        manager.kill();
        await once(manager, 'exit');
      }
      if (
        survivor &&
        (await processIdentity(survivor.pid))?.creation === survivor.creation
      ) {
        process.kill(survivor.pid);
        for (let attempt = 0; attempt < 20; attempt++) {
          const current = await processIdentity(survivor.pid);
          if (!current || current.creation !== survivor.creation) break;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  });
}

test('guard recovery preserves replaced and nonce-changed recovery ownership', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    codexExecutable: await probeExecutable(root),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const fs = (await import('node:fs/promises')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const { privateDirectory, writePrivate } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  const script = `import {acquireGuard} from ${JSON.stringify(new URL('dist/scope-guard.js', packageRoot).href)};await acquireGuard(${JSON.stringify(options)});process.send('ready');setInterval(()=>{},1000);`;
  const manager = spawn(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  const lock = join(options.stateHome, 'manager.lock'),
    recovery = lock + '.recovery';
  const nativeRename = fs.rename;
  let retainedOwner;
  try {
    await Promise.race([
      once(manager, 'message'),
      once(manager, 'exit').then(() => {
        throw new Error('manager fixture failed');
      }),
    ]);
    if (process.platform === 'win32') {
      // Keep the real process object alive after exit so native helper churn cannot
      // recycle its PID before this fixture reaches the injected rename boundary.
      const pin = `$ErrorActionPreference='Stop'
$p=[System.Diagnostics.Process]::GetProcessById([int]$env:TANDEM_FIXTURE_OWNER_PID)
try { $null=$p.Handle; [Console]::WriteLine('pinned'); [Console]::Out.Flush(); $null=[Console]::In.ReadLine() }
finally { $p.Dispose() }`;
      retainedOwner = spawn(
        join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'WindowsPowerShell',
          'v1.0',
          'powershell.exe',
        ),
        [
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
          Buffer.from(pin, 'utf16le').toString('base64'),
        ],
        {
          env: {
            ...process.env,
            TANDEM_FIXTURE_OWNER_PID: String(manager.pid),
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        },
      );
      let timer;
      try {
        await Promise.race([
          once(retainedOwner.stdout, 'data').then(([data]) => {
            assert.equal(data.toString().trim(), 'pinned');
          }),
          once(retainedOwner, 'exit').then(() => {
            throw new Error('FIXTURE_OWNER_HANDLE_FAILED');
          }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('FIXTURE_OWNER_HANDLE_TIMEOUT')),
              10000,
            );
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    }
    manager.kill();
    await once(manager, 'exit');
    const { processIdentity } = await import(
      new URL('dist/processes.js', packageRoot)
    );
    assert.equal(await processIdentity(manager.pid), null);
    const before = await fs.readFile(join(lock, 'owner.json'), 'utf8');
    for (const replace of [true, false]) {
      let replacement;
      fs.rename = async (from, to) => {
        if (from === lock) {
          try {
            replacement = await fs.readFile(
              join(recovery, 'owner.json'),
              'utf8',
            );
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            replacement = JSON.stringify({ nonce: 'f'.repeat(64) });
          }
          if (replace) {
            // Retain the displaced inode so immediate filesystem reuse cannot make
            // a replacement directory appear to be the same physical directory.
            await nativeRename(recovery, recovery + '.displaced');
            await privateDirectory(recovery, { exclusive: true });
          } else {
            replacement = JSON.stringify({
              ...JSON.parse(replacement),
              nonce: 'f'.repeat(64),
            });
          }
          await writePrivate(join(recovery, 'owner.json'), replacement);
          throw new Error('INJECTED_RECOVERY_FAILURE');
        }
        return nativeRename(from, to);
      };
      syncBuiltinESMExports();
      try {
        await assert.rejects(
          acquireGuard(options),
          /INJECTED_RECOVERY_FAILURE|LOCK_OWNER_CHANGED/,
        );
      } finally {
        fs.rename = nativeRename;
        syncBuiltinESMExports();
      }
      assert.equal(
        await fs.readFile(join(recovery, 'owner.json'), 'utf8'),
        replacement,
      );
      assert.equal(await fs.readFile(join(lock, 'owner.json'), 'utf8'), before);
      await fs.rm(recovery, { recursive: true });
    }
    await privateDirectory(recovery, { exclusive: true });
    await assert.rejects(acquireGuard(options), /LOCK_RECOVERY_BUSY/);
    assert.deepEqual(await fs.readdir(recovery), []);
    await fs.rm(recovery, { recursive: true });
    const lease = await acquireGuard(options);
    await lease.release();
  } finally {
    fs.rename = nativeRename;
    syncBuiltinESMExports();
    if (manager.exitCode === null && manager.signalCode === null) {
      manager.kill();
      await once(manager, 'exit');
    }
    try {
      if (
        retainedOwner?.exitCode === null &&
        retainedOwner.signalCode === null
      ) {
        const finished = once(retainedOwner, 'exit');
        retainedOwner.stdin.end();
        let timer;
        try {
          await Promise.race([
            finished.then(([code]) => {
              assert.equal(code, 0);
            }),
            new Promise((_, reject) => {
              timer = setTimeout(() => {
                retainedOwner.kill();
                reject(new Error('FIXTURE_OWNER_HANDLE_TIMEOUT'));
              }, 10000);
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      }
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('an existing unmarked SQLite database is rejected without claiming or changing it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    analyticsPath: join(root, 'analytics.sqlite'),
    codexExecutable: await probeExecutable(root),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { DatabaseSync } = await import('node:sqlite');
  const database = new DatabaseSync(options.analyticsPath);
  database.exec(
    'CREATE TABLE synthetic (value INTEGER); INSERT INTO synthetic VALUES (1)',
  );
  database.close();
  const { readFile, stat, lstat } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const bytes = await readFile(options.analyticsPath);
  const protection =
    process.platform === 'win32'
      ? (await run(windowsIcacls, [options.analyticsPath])).stdout
      : (await stat(options.analyticsPath)).mode;
  let unexpected;
  try {
    await assert.rejects(async () => {
      unexpected = await acquireGuard(options);
    }, /ANALYTICS_OWNER_REQUIRED/);
    assert.deepEqual(await readFile(options.analyticsPath), bytes);
    assert.equal(
      process.platform === 'win32'
        ? (await run(windowsIcacls, [options.analyticsPath])).stdout
        : (await stat(options.analyticsPath)).mode,
      protection,
    );
    await assert.rejects(lstat(options.analyticsPath + '.tandem-environment'), {
      code: 'ENOENT',
    });
  } finally {
    await unexpected?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('analytics claims reject a raced database and permit an existing owned database', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    analyticsPath: join(root, 'analytics.sqlite'),
    codexExecutable: await probeExecutable(root),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { DatabaseSync } = await import('node:sqlite');
  const fs = (await import('node:fs/promises')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const nativeRename = fs.rename;
  const marker = options.analyticsPath + '.tandem-environment';
  const createDatabase = () => {
    const database = new DatabaseSync(options.analyticsPath);
    database.exec(
      'CREATE TABLE synthetic (value INTEGER); INSERT INTO synthetic VALUES (1)',
    );
    database.close();
  };
  let racedBytes, lease;
  fs.rename = async (from, to) => {
    await nativeRename(from, to);
    if (to === join(marker, 'owner.json')) {
      createDatabase();
      racedBytes = await fs.readFile(options.analyticsPath);
    }
  };
  syncBuiltinESMExports();
  try {
    await assert.rejects(acquireGuard(options), /ANALYTICS_OWNER_REQUIRED/);
    assert.deepEqual(await fs.readFile(options.analyticsPath), racedBytes);
    await assert.rejects(fs.lstat(marker), { code: 'ENOENT' });
    fs.rename = nativeRename;
    syncBuiltinESMExports();
    await fs.rm(options.analyticsPath);
    lease = await acquireGuard(options);
    createDatabase();
    const ownedBytes = await fs.readFile(options.analyticsPath);
    await lease.release();
    lease = undefined;
    lease = await acquireGuard(options);
    assert.deepEqual(await fs.readFile(options.analyticsPath), ownedBytes);
    await lease.release();
    lease = undefined;
  } finally {
    fs.rename = nativeRename;
    syncBuiltinESMExports();
    await lease?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('foreign analytics destinations are rejected before holding credential scopes', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    codexExecutable: await probeExecutable(root),
    bindingPath: join(root, 'binding.json'),
    analyticsPath: join(root, 'usage.sqlite'),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { privateDirectory, writePrivate } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  const { operatingEnvironment } = await import(
    new URL('dist/processes.js', packageRoot)
  );
  const environment = await operatingEnvironment();
  const marker = options.analyticsPath + '.tandem-environment';
  await privateDirectory(marker);
  await writePrivate(
    join(marker, 'owner.json'),
    JSON.stringify({
      schemaVersion: 1,
      environment: environment === 'windows' ? 'wsl' : 'windows',
    }),
  );
  try {
    await assert.rejects(acquireGuard(options), /SHARED_ANALYTICS_STORE/);
    const next = await acquireGuard({
      ...options,
      analyticsPath: join(root, 'independent.sqlite'),
    });
    await next.release();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('native managed background evidence keeps a lease held until the child is gone', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    codexExecutable: await probeExecutable(root),
    bindingPath: join(root, 'binding.json'),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const lease = await acquireGuard(options);
  const child = spawn(
    options.codexExecutable,
    ['-e', 'setInterval(()=>{},1000)', 'app-server'],
    {
      env: {
        ...process.env,
        CODEX_HOME: options.codexHome,
        TANDEM_GUARD_NONCE: lease.nonce,
      },
      stdio: 'ignore',
    },
  );
  try {
    await lease.registerProcess(child.pid);
    const { processesForScope } = await import(
      new URL('dist/scope-guard.js', packageRoot)
    );
    const rows = await processesForScope(options);
    assert.equal(rows.find((x) => x.pid === child.pid)?.ownership, 'managed');
    assert.equal(rows.find((x) => x.pid === child.pid)?.role, 'background');
    await assert.rejects(lease.release(), /ACTIVE_SCOPED_PROCESS/);
    await assert.rejects(
      lease.registerProcess(process.ppid),
      /PROCESS_OWNERSHIP_UNPROVEN|PROCESS_EXECUTABLE_MISMATCH/,
    );
    child.kill();
    await once(child, 'exit');
    await lease.release();
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await lease.release();
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'relative child home is resolved in that child directory and blocks acquisition',
  { skip: process.platform === 'win32' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
    const options = {
      stateHome: join(root, 'state'),
      codexHome: join(root, 'home'),
      bindingPath: join(root, 'binding.json'),
      codexExecutable: await probeExecutable(root),
    };
    await mkdir(options.codexHome);
    await writeFile(options.bindingPath, '{}');
    const { spawn } = await import('node:child_process');
    const { once } = await import('node:events');
    const child = spawn(
      options.codexExecutable,
      ['-e', 'setInterval(()=>{},1000)', 'app-server'],
      {
        cwd: root,
        env: { ...process.env, CODEX_HOME: 'home' },
        stdio: 'ignore',
      },
    );
    try {
      await assert.rejects(acquireGuard(options), /SCOPED_PROCESSES_CONFLICT/);
    } finally {
      child.kill();
      await once(child, 'exit');
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('batched private metadata preserves existing files when any parent protection is invalid', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const { privateDirectory, verifyPrivate, writePrivateBatch } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  const good = await privateDirectory(join(root, 'good'));
  const other = await privateDirectory(join(root, 'other'));
  const weak = join(root, 'weak');
  await mkdir(weak);
  const protectedFile = join(good, 'owner.json');
  await writeFile(protectedFile, 'before', { mode: 0o600 });
  const { readFile } = await import('node:fs/promises');
  try {
    await verifyPrivate([good, other]);
    await assert.rejects(
      writePrivateBatch([
        { path: protectedFile, bytes: 'after' },
        { path: join(weak, 'owner.json'), bytes: 'invalid' },
      ]),
      /PRIVATE_ACL_REQUIRED|PRIVATE_PERMISSIONS_REQUIRED/,
    );
    assert.equal(await readFile(protectedFile, 'utf8'), 'before');
    await writePrivateBatch([
      { path: protectedFile, bytes: 'after' },
      { path: join(other, 'owner.json'), bytes: 'second' },
    ]);
    await verifyPrivate([protectedFile, join(other, 'owner.json')]);
    assert.equal(await readFile(protectedFile, 'utf8'), 'after');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unregistered background work is a conflict while proven other-home work is unrelated', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    codexExecutable: await probeExecutable(root),
  };
  const other = join(root, 'other');
  await mkdir(options.codexHome);
  await mkdir(other);
  await writeFile(options.bindingPath, '{}');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const { processesForScope } = await import(
    new URL('dist/scope-guard.js', packageRoot)
  );
  const child = spawn(
    options.codexExecutable,
    ['-e', 'setInterval(()=>{},1000)', 'app-server'],
    { env: { ...process.env, CODEX_HOME: other }, stdio: 'ignore' },
  );
  try {
    const rows = await processesForScope(options);
    assert.equal(rows.find((p) => p.pid === child.pid)?.ownership, 'unrelated');
    const lease = await acquireGuard(options);
    await lease.release();
  } finally {
    child.kill();
    await once(child, 'exit');
  }
  const conflict = spawn(
    options.codexExecutable,
    ['-e', 'setInterval(()=>{},1000)', 'app-server'],
    { env: { ...process.env, CODEX_HOME: options.codexHome }, stdio: 'ignore' },
  );
  try {
    const rows = await processesForScope(options);
    assert.equal(
      rows.find((p) => p.pid === conflict.pid)?.ownership,
      'unknown',
    );
    assert.equal(rows.find((p) => p.pid === conflict.pid)?.role, 'background');
    await assert.rejects(acquireGuard(options), /SCOPED_PROCESSES_CONFLICT/);
  } finally {
    conflict.kill();
    await once(conflict, 'exit');
    await rm(root, { recursive: true, force: true });
  }
});

test('a surviving registered child keeps scope protected after its manager exits', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    codexExecutable: await probeExecutable(root),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const identityUrl = new URL('dist/processes.js', packageRoot);
  const script = `import {acquireGuard} from ${JSON.stringify(new URL('dist/scope-guard.js', packageRoot).href)};
    import {spawn} from 'node:child_process';import {processIdentity} from ${JSON.stringify(identityUrl.href)};
    const options=${JSON.stringify(options)};const lease=await acquireGuard(options);
    const child=spawn(options.codexExecutable,['-e','setInterval(()=>{},1000)','app-server'],{detached:true,stdio:'ignore',env:{...process.env,CODEX_HOME:options.codexHome,TANDEM_GUARD_NONCE:lease.nonce}});
    child.unref();await lease.registerProcess(child.pid);process.send(await processIdentity(child.pid));setInterval(()=>{},1000);`;
  const manager = spawn(
    process.execPath,
    ['--input-type=module', '-e', script],
    { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] },
  );
  const { processIdentity } = await import(identityUrl);
  let owned;
  try {
    [owned] = await Promise.race([
      once(manager, 'message'),
      once(manager, 'exit').then(() => {
        throw new Error('manager fixture failed');
      }),
    ]);
    manager.kill();
    await once(manager, 'exit');
    assert.equal((await processIdentity(owned.pid)).creation, owned.creation);
    const { acquireBindingLease } = await import(
      new URL('dist/binding-lock.js', packageRoot)
    );
    const { readFile } = await import('node:fs/promises');
    const before = await readFile(
      options.bindingPath + '.tandem-binding.lock/owner.json',
      'utf8',
    );
    await assert.rejects(
      acquireBindingLease(options.bindingPath),
      /BINDING_BUSY/,
    );
    assert.equal(
      await readFile(
        options.bindingPath + '.tandem-binding.lock/owner.json',
        'utf8',
      ),
      before,
    );
    await assert.rejects(
      acquireGuard(options),
      /SCOPED_PROCESSES_CONFLICT|ACTIVE_SCOPED_PROCESS/,
    );
  } finally {
    if (manager.exitCode === null && manager.signalCode === null) {
      manager.kill();
      await once(manager, 'exit');
    }
    if (
      owned &&
      (await processIdentity(owned.pid))?.creation === owned.creation
    ) {
      process.kill(owned.pid);
      for (let attempt = 0; attempt < 20; attempt++) {
        const current = await processIdentity(owned.pid);
        if (!current || current.creation !== owned.creation) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('hardlinked mutable bindings and incomplete lock owners fail closed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    codexExecutable: await probeExecutable(root),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { link, readFile } = await import('node:fs/promises');
  const { privateDirectory } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  try {
    const alias = join(root, 'alias.json');
    await link(options.bindingPath, alias);
    await assert.rejects(acquireGuard(options), /BINDING_ALIAS_UNSUPPORTED/);
    await rm(alias);
    await privateDirectory(options.stateHome);
    const lock = await privateDirectory(
      join(options.stateHome, 'manager.lock'),
    );
    await writeFile(join(lock, 'owner.json'), '{}', { mode: 0o600 });
    await assert.rejects(acquireGuard(options), /LOCK_OWNER_INVALID/);
    assert.equal(await readFile(join(lock, 'owner.json'), 'utf8'), '{}');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('two simultaneous installed CLI managers yield one held lease and restore it on EOF', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    codexExecutable: await probeExecutable(root),
  };
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const args = [
    fileURLToPath(new URL('dist/cli.js', packageRoot)),
    'guard',
    '--state-home',
    options.stateHome,
    '--codex-home',
    options.codexHome,
    '--binding',
    options.bindingPath,
    '--codex-executable',
    options.codexExecutable,
    '--hold',
    '--json',
  ];
  const children = [
    spawn(process.execPath, args),
    spawn(process.execPath, args),
  ];
  function outcome(child) {
    return new Promise((resolve, reject) => {
      let text = '';
      child.stdout.on('data', (bytes) => {
        text += bytes;
        if (text.includes('\n')) {
          const report = JSON.parse(text.split('\n')[0]);
          if (report.status === 'held') resolve({ child, held: true });
        }
      });
      child.on('error', reject);
      child.on('exit', (code) => resolve({ child, held: false, code }));
    });
  }
  try {
    const rows = await Promise.all(children.map(outcome));
    assert.equal(rows.filter((r) => r.held).length, 1);
    assert.equal(rows.find((r) => !r.held)?.code, 2);
    const winner = rows.find((r) => r.held).child;
    winner.stdin.end();
    const [exit] = await once(winner, 'exit');
    assert.equal(exit, 0);
    const recovered = await acquireGuard(options);
    await recovered.release();
  } finally {
    for (const child of children) {
      if (child.exitCode === null && child.signalCode === null) {
        child.stdin.end();
        child.kill();
        await once(child, 'exit');
      }
    }
    await rm(root, { recursive: true, force: true });
  }
});

test('foreign installation ownership blocks custom analytics and profiles before mutations', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    analyticsPath: join(root, 'separate.sqlite'),
    codexExecutable: await probeExecutable(root),
  };
  const { privateDirectory, writePrivate } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  const { operatingEnvironment } = await import(
    new URL('dist/processes.js', packageRoot)
  );
  const { readFile, readdir, stat } = await import('node:fs/promises');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile),
    environment = await operatingEnvironment();
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  await privateDirectory(options.stateHome);
  const marker = await privateDirectory(
    join(options.stateHome, '.tandem-installation-owner'),
  );
  const ownerFile = join(marker, 'owner.json');
  await writePrivate(
    ownerFile,
    JSON.stringify({
      schemaVersion: 1,
      environment: environment === 'windows' ? 'wsl' : 'windows',
    }),
  );
  const original = await readFile(ownerFile, 'utf8'),
    entries = await readdir(options.stateHome);
  const permissions = async () =>
    process.platform === 'win32'
      ? (await run(windowsIcacls, [options.stateHome])).stdout
      : (await stat(options.stateHome)).mode;
  const before = await permissions();
  try {
    await assert.rejects(async () => {
      const lease = await acquireGuard(options);
      await lease.release();
    }, /SHARED_STATE_STORE/);
    await assert.rejects(
      run(process.execPath, [
        fileURLToPath(new URL('dist/cli.js', packageRoot)),
        'profiles',
        'list',
        '--state-home',
        options.stateHome,
        '--json',
      ]),
      (error) =>
        error.code === 2 && error.stderr.includes('SHARED_STATE_STORE'),
    );
    assert.deepEqual(await readdir(options.stateHome), entries);
    assert.equal(await readFile(ownerFile, 'utf8'), original);
    assert.equal(await permissions(), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('native home ownership survives release and refuses foreign reuse without changing the home', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    codexExecutable: await probeExecutable(root),
  };
  const { readFile, readdir, stat } = await import('node:fs/promises');
  const { writePrivate } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  const { operatingEnvironment } = await import(
    new URL('dist/processes.js', packageRoot)
  );
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  try {
    const first = await acquireGuard(options);
    await first.release();
    const marker = join(
      options.codexHome,
      '.tandem-native-home-owner',
      'owner.json',
    );
    assert.equal(
      JSON.parse(await readFile(marker, 'utf8')).environment,
      await operatingEnvironment(),
    );
    await writePrivate(
      marker,
      JSON.stringify({
        schemaVersion: 1,
        environment:
          (await operatingEnvironment()) === 'windows' ? 'wsl' : 'windows',
      }),
    );
    const bytes = await readFile(marker, 'utf8'),
      entries = await readdir(options.codexHome);
    const permissions = async () =>
      process.platform === 'win32'
        ? (await run(windowsIcacls, [options.codexHome])).stdout
        : (await stat(options.codexHome)).mode;
    const before = await permissions();
    await assert.rejects(async () => {
      const lease = await acquireGuard({
        ...options,
        stateHome: join(root, 'second'),
      });
      await lease.release();
    }, /SHARED_NATIVE_HOME/);
    assert.deepEqual(await readdir(options.codexHome), entries);
    assert.equal(await readFile(marker, 'utf8'), bytes);
    assert.equal(await permissions(), before);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('unmarked legacy ownership and incomplete first claims cannot be adopted or relabeled', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const { claimPrivateState } = await import(
    new URL('dist/private-state.js', packageRoot)
  );
  const { readFile, stat } = await import('node:fs/promises');
  try {
    const state = join(root, 'state');
    await mkdir(state);
    await writeFile(join(state, 'profiles.lock'), 'unknown');
    const before = (await stat(state)).mode;
    await assert.rejects(
      claimPrivateState(state, 'installation'),
      /STATE_OWNER_UNVERIFIED/,
    );
    assert.equal((await stat(state)).mode, before);
    assert.equal(
      await readFile(join(state, 'profiles.lock'), 'utf8'),
      'unknown',
    );
    const partial = join(root, 'partial');
    await mkdir(partial);
    await mkdir(join(partial, '.tandem-installation-owner'));
    await assert.rejects(claimPrivateState(partial, 'installation'));
    await assert.rejects(
      readFile(join(partial, '.tandem-installation-owner', 'owner.json')),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('partial owner publication rolls back only this acquisition and preserves a replacement owner', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    codexExecutable: await probeExecutable(root),
  };
  const fs = (await import('node:fs/promises')).default;
  const { syncBuiltinESMExports } = await import('node:module');
  const { privateDirectory, writePrivate } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  await mkdir(options.codexHome);
  await writeFile(options.bindingPath, '{}');
  const nativeRename = fs.rename;
  const manager = join(options.stateHome, 'manager.lock'),
    homeLock = join(options.codexHome, '.tandem-home.lock'),
    bindingLock = options.bindingPath + '.tandem-binding.lock';
  let replaced;
  async function failSecondPublication(replace) {
    let armed = true;
    fs.rename = async (from, to) => {
      if (armed && to === join(homeLock, 'owner.json')) {
        armed = false;
        if (replace) {
          replaced = {
            ...JSON.parse(
              await fs.readFile(join(manager, 'owner.json'), 'utf8'),
            ),
            nonce: 'f'.repeat(64),
          };
          await fs.rm(bindingLock, { recursive: true });
          await privateDirectory(bindingLock, { exclusive: true });
          await writePrivate(
            join(bindingLock, 'owner.json'),
            JSON.stringify(replaced),
          );
        }
        throw Object.assign(new Error('injected publication failure'), {
          code: 'EIO',
        });
      }
      return nativeRename(from, to);
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(
        acquireGuard(options),
        replace
          ? /LOCK_ROLLBACK_UNPROVEN|LOCK_OWNER_CHANGED/
          : /injected publication failure/,
      );
    } finally {
      fs.rename = nativeRename;
      syncBuiltinESMExports();
    }
  }
  try {
    await failSecondPublication(false);
    for (const path of [manager, homeLock, bindingLock])
      await assert.rejects(fs.lstat(path), { code: 'ENOENT' });
    const retry = await acquireGuard(options);
    await retry.release();
    await failSecondPublication(true);
    assert.deepEqual(
      JSON.parse(await fs.readFile(join(bindingLock, 'owner.json'), 'utf8')),
      replaced,
    );
  } finally {
    fs.rename = nativeRename;
    syncBuiltinESMExports();
    await rm(root, { recursive: true, force: true });
  }
});

test('profile credential mutations honor a held guard binding while unrelated work remains available', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const stateHome = join(root, 'state'),
    codexHome = join(root, 'home'),
    input = join(root, 'import.json');
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const run = promisify(execFile);
  const { readFile } = await import('node:fs/promises');
  const cli = fileURLToPath(new URL('dist/cli.js', packageRoot));
  const auth = (account, secret) =>
    JSON.stringify({
      tokens: {
        account_id: account,
        id_token:
          'e30.' +
          Buffer.from(
            JSON.stringify({
              'https://api.openai.com/auth': {
                chatgpt_account_id: account,
                chatgpt_user_id: 'synthetic-user',
              },
            }),
          ).toString('base64url') +
          '.synthetic',
        access_token: secret,
        refresh_token: secret,
      },
    });
  async function command(...args) {
    try {
      const result = await run(process.execPath, [
        cli,
        'profiles',
        ...args,
        '--state-home',
        stateHome,
        '--json',
      ]);
      return { status: 0, report: JSON.parse(result.stdout) };
    } catch (error) {
      return { status: error.code, report: JSON.parse(error.stderr) };
    }
  }
  await mkdir(codexHome);
  await writeFile(input, auth('synthetic-A', 'SYNTHETIC-BEFORE'));
  let lease;
  try {
    const added = await command('add', '--label', 'Work', '--import', input);
    assert.equal(added.status, 0);
    const id = added.report.profile.id,
      bindingPath = join(
        stateHome,
        'credentials',
        added.report.profile.bindingId + '.json',
      );
    lease = await acquireGuard({
      stateHome,
      codexHome,
      bindingPath,
      codexExecutable: await probeExecutable(root),
    });
    await writeFile(input, auth('synthetic-A', 'SYNTHETIC-AFTER'));
    let before = await readFile(join(stateHome, 'profiles.json'), 'utf8'),
      credential = await readFile(bindingPath, 'utf8');
    for (const args of [
      ['login', '--identity', id, '--import', input],
      ['remove', '--identity', id, '--confirm', id],
    ]) {
      const refused = await command(...args);
      assert.equal(refused.status, 2);
      assert.equal(refused.report.code, 'BINDING_BUSY');
      assert.equal(
        await readFile(join(stateHome, 'profiles.json'), 'utf8'),
        before,
      );
      assert.equal(await readFile(bindingPath, 'utf8'), credential);
    }
    await writeFile(input, auth('synthetic-B', 'SYNTHETIC-REPLACEMENT'));
    const refused = await command(
      'login',
      '--identity',
      id,
      '--import',
      input,
      '--new-binding',
      id,
    );
    assert.equal(refused.status, 2);
    assert.equal(refused.report.code, 'BINDING_BUSY');
    assert.equal(
      await readFile(join(stateHome, 'profiles.json'), 'utf8'),
      before,
    );
    assert.equal(await readFile(bindingPath, 'utf8'), credential);
    const unrelated = await command(
      'add',
      '--label',
      'Other',
      '--import',
      input,
    );
    assert.equal(unrelated.status, 0);
    assert.equal(
      (
        await command(
          'remove',
          '--identity',
          unrelated.report.profile.id,
          '--confirm',
          unrelated.report.profile.id,
        )
      ).status,
      0,
    );
    assert.equal(
      (await command('rename', '--identity', id, '--label', 'Renamed')).status,
      0,
    );
    await lease.release();
    lease = undefined;
    await writeFile(input, auth('synthetic-A', 'SYNTHETIC-AFTER'));
    assert.equal(
      (await command('login', '--identity', id, '--import', input)).status,
      0,
    );
    assert.notEqual(await readFile(bindingPath, 'utf8'), credential);
    assert.equal(
      (await command('remove', '--identity', id, '--confirm', id)).status,
      0,
    );
  } finally {
    await lease?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('a guard transfers only a proved-dead binding mutation without changing credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const options = {
    stateHome: join(root, 'state'),
    codexHome: join(root, 'home'),
    bindingPath: join(root, 'binding.json'),
    codexExecutable: await probeExecutable(root),
  };
  await mkdir(options.codexHome);
  const bytes = Buffer.from('synthetic binding bytes');
  await writeFile(options.bindingPath, bytes);
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const { readFile } = await import('node:fs/promises');
  const { processIdentity } = await import(
    new URL('dist/processes.js', packageRoot)
  );
  const { writePrivate } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  const file = options.bindingPath + '.tandem-binding.lock/owner.json';
  const script = `import {acquireBindingLease} from ${JSON.stringify(new URL('dist/binding-lock.js', packageRoot).href)};import {processIdentity} from ${JSON.stringify(new URL('dist/processes.js', packageRoot).href)};await acquireBindingLease(${JSON.stringify(options.bindingPath)});process.on('message',()=>{});process.send(await processIdentity(process.pid));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    windowsHide: true,
  });
  const exited = once(child, 'exit');
  let owner, lease;
  try {
    [owner] = await Promise.race([
      once(child, 'message'),
      exited.then(() => {
        throw new Error('mutation fixture failed');
      }),
    ]);
    assert.deepEqual(await processIdentity(child.pid), owner);
    const before = await readFile(file);
    const original = JSON.parse(before);
    await assert.rejects(acquireGuard(options), /BINDING_BUSY/);
    assert.deepEqual(await readFile(file), before);
    assert.deepEqual(await readFile(options.bindingPath), bytes);
    await writePrivate(
      file,
      JSON.stringify({
        ...original,
        owner: { ...original.owner, creation: 'synthetic-obsolete-creation' },
      }),
    );
    const reused = await readFile(file);
    await assert.rejects(acquireGuard(options), /PID_REUSED/);
    assert.deepEqual(await readFile(file), reused);
    assert.deepEqual(await readFile(options.bindingPath), bytes);
    await writePrivate(file, before);
    assert.deepEqual(
      await processIdentity(child.pid),
      owner,
      'Only the freshly verified mutation fixture may be terminated',
    );
    assert.equal(child.kill('SIGKILL'), true);
    await exited;
    assert.equal(await processIdentity(child.pid), null);
    lease = await acquireGuard(options);
    const transferred = JSON.parse(await readFile(file, 'utf8'));
    assert.equal(transferred.kind, 'guard');
    assert.notEqual(transferred.nonce, original.nonce);
    assert.deepEqual(await readFile(options.bindingPath), bytes);
    await lease.release();
    lease = undefined;
    await assert.rejects(readFile(file), { code: 'ENOENT' });
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      assert.deepEqual(await processIdentity(child.pid), owner);
      child.kill('SIGKILL');
      await exited;
    }
    await lease?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test('verified mutation mutexes recover only native dead owners and reject changed nonce, reused PID and legacy ambiguity', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-guard-'));
  const binding = join(root, 'binding.json');
  await writeFile(binding, '{}');
  const { spawn } = await import('node:child_process');
  const { once } = await import('node:events');
  const { acquireProfileMutex, acquireBindingLease } = await import(
    new URL('dist/binding-lock.js', packageRoot)
  );
  const { readFile } = await import('node:fs/promises');
  const { writePrivate } = await import(
    new URL('dist/private-files.js', packageRoot)
  );
  const script = `import {acquireProfileMutex,acquireBindingLease} from ${JSON.stringify(new URL('dist/binding-lock.js', packageRoot).href)};await acquireProfileMutex(${JSON.stringify(root)});await acquireBindingLease(${JSON.stringify(binding)});process.send('ready');setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  let mutex, bindingLease;
  try {
    await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(() => {
        throw new Error('mutation fixture failed');
      }),
    ]);
    await assert.rejects(acquireProfileMutex(root), /PROFILE_STORE_BUSY/);
    await assert.rejects(acquireBindingLease(binding), /BINDING_BUSY/);
    child.kill();
    await once(child, 'exit');
    mutex = await acquireProfileMutex(root);
    bindingLease = await acquireBindingLease(binding);
    await bindingLease.release();
    bindingLease = undefined;
    const file = join(root, 'profiles.lock', 'owner.json'),
      original = JSON.parse(await readFile(file, 'utf8'));
    await writePrivate(
      file,
      JSON.stringify({ ...original, nonce: '0'.repeat(64) }),
    );
    await assert.rejects(mutex.release(), /LOCK_OWNER_CHANGED/);
    await writePrivate(
      file,
      JSON.stringify({
        ...original,
        owner: { ...original.owner, creation: 'obsolete-creation' },
      }),
    );
    await assert.rejects(acquireProfileMutex(root), /PID_REUSED/);
    await writePrivate(file, JSON.stringify(original));
    await mutex.release();
    mutex = undefined;
    await mkdir(join(root, 'profiles.lock'), { mode: 0o700 });
    await assert.rejects(acquireProfileMutex(root), /PROFILE_STORE_BUSY/);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await once(child, 'exit');
    }
    await bindingLease?.release();
    await mutex?.release();
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'Linux comm scan requires native absence before omitting vanished entries',
  { skip: process.platform !== 'linux' },
  async () => {
    const fs = (await import('node:fs/promises')).default;
    const { syncBuiltinESMExports } = await import('node:module');
    const { spawn } = await import('node:child_process');
    const { once } = await import('node:events');
    const { inspectProcesses, processIdentity } = await import(
      new URL('dist/processes.js', packageRoot)
    );
    const nativeReadFile = fs.readFile;
    const nativeReaddir = fs.readdir;
    const root = await mkdtemp(join(tmpdir(), 'tandem-proc-race-'));
    const home = join(root, 'home');
    await mkdir(home);
    const child = spawn(
      process.execPath,
      ['-e', "process.stdout.write('ready');setInterval(()=>{},1000)"],
      {
        env: { ...process.env, CODEX_HOME: home },
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    );
    try {
      await once(child.stdout, 'data');
      const exited = spawn(process.execPath, ['-e', 'process.exit(0)'], {
        stdio: 'ignore',
      });
      const absentPid = exited.pid;
      await once(exited, 'exit');
      assert.equal(await processIdentity(absentPid), null);
      let mode = 'absent',
        commCode = 'ESRCH';
      let absentStatReads = 0,
        liveStatReads = 0;
      const nativeError = (code) =>
        Object.assign(new Error('synthetic proc read'), { code });
      fs.readdir = async (path, ...args) => {
        if (path === '/proc')
          return mode === 'absent'
            ? [String(absentPid), String(child.pid)]
            : [String(child.pid)];
        return nativeReaddir(path, ...args);
      };
      fs.readFile = async (path, ...args) => {
        if (path === '/proc/' + absentPid + '/comm')
          throw nativeError(commCode);
        if (path === '/proc/' + absentPid + '/stat') absentStatReads++;
        if (path === '/proc/' + child.pid + '/comm' && mode !== 'absent')
          throw nativeError(mode === 'comm-denied' ? 'EACCES' : commCode);
        if (path === '/proc/' + child.pid + '/stat') {
          liveStatReads++;
          if (mode === 'identity-denied') throw nativeError('EACCES');
          if (mode === 'reappeared' && liveStatReads === 1)
            throw nativeError('ENOENT');
        }
        return nativeReadFile(path, ...args);
      };
      syncBuiltinESMExports();
      const options = { codexHome: home, codexExecutable: process.execPath };
      for (const code of ['ESRCH', 'ENOENT']) {
        commCode = code;
        absentStatReads = 0;
        const rows = await inspectProcesses(options);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].pid, child.pid);
        assert.equal(rows[0].ownership, 'unknown');
        assert(absentStatReads >= 2);
      }
      mode = 'live';
      for (const code of ['ESRCH', 'ENOENT']) {
        commCode = code;
        await assert.rejects(
          inspectProcesses(options),
          /PROCESS_INVENTORY_UNAVAILABLE/,
        );
      }
      commCode = 'ESRCH';
      for (const outcome of ['identity-denied', 'reappeared', 'comm-denied']) {
        mode = outcome;
        liveStatReads = 0;
        await assert.rejects(
          inspectProcesses(options),
          /PROCESS_INVENTORY_UNAVAILABLE/,
        );
        if (outcome === 'reappeared') assert.equal(liveStatReads, 2);
        if (outcome === 'comm-denied') assert.equal(liveStatReads, 0);
      }
    } finally {
      fs.readFile = nativeReadFile;
      fs.readdir = nativeReaddir;
      syncBuiltinESMExports();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill();
        await exited;
      }
      await rm(root, { recursive: true, force: true });
    }
  },
);
