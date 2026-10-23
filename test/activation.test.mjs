import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
  writeFile,
  rm,
  readdir,
  realpath,
  mkdtemp,
  mkdir,
  stat,
  link,
  symlink,
} from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';
import {
  modulePath,
  syntheticAuth as auth,
  activationFixture as fixture,
} from './fixtures/activation.mjs';
const run = promisify(execFile);
const { writePrivate } = await import(modulePath('private-files.js'));
test(
  'Linux activation rejects oversized and substituted saved credentials and closes failed descriptors',
  { skip: process.platform !== 'linux' },
  async () => {
    const fs = (await import('node:fs')).default;
    const { syncBuiltinESMExports } = await import('node:module');
    const { activateIdentity } = await import(modulePath('activation.js'));
    const f = await fixture();
    const path = join(
        f.state,
        'credentials',
        f.profiles[0].bindingId + '.json',
      ),
      other = join(f.root, 'other');
    const originalOpen = fs.openSync,
      originalStat = fs.fstatSync;
    let lease;
    try {
      const original = await readFile(path);
      const options = { ...f.options, profileId: f.profiles[0].id };
      await writeFile(
        path,
        Buffer.concat([original, Buffer.alloc(65537 - original.length, 32)]),
      );
      await assert.rejects(activateIdentity(options), /CREDENTIAL_INVALID/);
      await writeFile(path, original);
      await link(path, path + '.hardlink');
      await assert.rejects(
        activateIdentity(options),
        /BINDING_ALIAS_UNSUPPORTED/,
      );
      await rm(path + '.hardlink');
      await writeFile(other, original, { mode: 0o600 });
      await rm(path);
      await symlink(other, path);
      await assert.rejects(activateIdentity(options), /PRIVATE_PATH_INVALID/);
      await rm(path);
      await writeFile(path, original, { mode: 0o600 });
      let descriptor;
      fs.openSync = (name, ...args) => {
        if (name === path) {
          descriptor = originalOpen(other, ...args);
          return descriptor;
        }
        return originalOpen(name, ...args);
      };
      syncBuiltinESMExports();
      await assert.rejects(activateIdentity(options), /CREDENTIAL_CHANGED/);
      assert.throws(() => originalStat(descriptor), { code: 'EBADF' });
      fs.openSync = originalOpen;
      syncBuiltinESMExports();
      await writeFile(
        path,
        Buffer.concat([original, Buffer.alloc(65536 - original.length, 32)]),
      );
      lease = await activateIdentity(options);
      assert.equal((await readFile(join(f.home, 'auth.json'))).length, 65536);
    } finally {
      fs.openSync = originalOpen;
      syncBuiltinESMExports();
      await lease?.release();
      await rm(f.root, { recursive: true, force: true });
    }
  },
);
test(
  'Linux reuses only a committed active binding while preserving refreshes and preparing a new launch',
  { skip: process.platform !== 'linux' },
  async () => {
    const f = await fixture();
    const { activateIdentity } = await import(modulePath('activation.js'));
    let lease;
    try {
      const options = { ...f.options, profileId: f.profiles[0].id };
      lease = await activateIdentity(options);
      const first = await lease.prepareLaunch('tracked');
      await lease.release();
      lease = undefined;
      const journal = join(f.home, '.tandem-activation');
      const active = await readFile(join(journal, 'active.json')),
        transaction = await readFile(join(journal, 'transaction.json'));
      const newest = auth('A', 'SYNTHETIC-REUSE-NEWEST');
      await writePrivate(join(f.home, 'auth.json'), newest);
      const before = await stat(join(f.home, 'auth.json'), { bigint: true });
      const writes = [];
      lease = await activateIdentity({
        ...options,
        boundary: (record) => {
          writes.push(record);
          if (!['outgoing', 'launch'].includes(record))
            throw new Error('UNEXPECTED_CREDENTIAL_REPLACEMENT');
        },
      });
      assert.deepEqual(
        writes.filter((name) => name !== 'outgoing'),
        [],
      );
      assert(writes.includes('outgoing'));
      assert.deepEqual(await readFile(join(journal, 'active.json')), active);
      assert.deepEqual(
        await readFile(join(journal, 'transaction.json')),
        transaction,
      );
      const after = await stat(join(f.home, 'auth.json'), { bigint: true });
      assert.equal(after.ino, before.ino);
      assert.equal(after.mtimeNs, before.mtimeNs);
      assert.equal(
        await readFile(
          join(f.state, 'credentials', f.profiles[0].bindingId + '.json'),
          'utf8',
        ),
        newest,
      );
      // Reuse still prepares a new durable launch before execution.
      const second = await lease.prepareLaunch('tracked');
      assert.notEqual(second.id, first.id);
      await lease.revalidateBeforeLaunch();
      await writePrivate(
        join(f.home, 'auth.json'),
        auth('B', 'SYNTHETIC-EXTERNAL'),
      );
      await assert.rejects(
        lease.revalidateBeforeLaunch(),
        /TARGET_BINDING_MISMATCH/,
      );
    } finally {
      await lease?.release();
      await rm(f.root, { recursive: true, force: true });
    }
  },
);

test(
  'Linux committed activation reuse still proves effective policy on every invocation',
  { skip: process.platform !== 'linux' },
  async () => {
    const f = await fixture();
    try {
      const { activateIdentity } = await import(modulePath('activation.js'));
      const options = { ...f.options, profileId: f.profiles[0].id };
      const lease = await activateIdentity(options);
      await lease.release();
      const target = await readFile(join(f.home, 'auth.json'));
      const script = f.options.command.prefix[0],
        original = await readFile(script, 'utf8');
      const changed = original.replace(
        "cli_auth_credentials_store:'file'",
        "cli_auth_credentials_store:'keyring'",
      );
      assert.notEqual(changed, original);
      await writeFile(script, changed);
      await assert.rejects(activateIdentity(options), /FILE_STORAGE_REQUIRED/);
      assert.deepEqual(await readFile(join(f.home, 'auth.json')), target);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  },
);

test(
  'Linux missing or stale complete journals use a full credential transaction rather than committed reuse',
  { skip: process.platform !== 'linux' },
  async () => {
    const f = await fixture();
    let lease;
    try {
      const { activateIdentity } = await import(modulePath('activation.js'));
      const options = { ...f.options, profileId: f.profiles[0].id };
      lease = await activateIdentity(options);
      await lease.release();
      lease = undefined;
      const path = join(f.home, '.tandem-activation', 'transaction.json');
      for (const state of ['missing', 'stale']) {
        if (state === 'missing') await rm(path);
        else {
          const transaction = JSON.parse(await readFile(path, 'utf8'));
          transaction.id = '00000000-0000-4000-8000-000000000001';
          await writePrivate(path, JSON.stringify(transaction));
        }
        let replaced = false;
        lease = await activateIdentity({
          ...options,
          boundary: (record, event) => {
            if (record === 'target' && event === 'replace:after')
              replaced = true;
          },
        });
        assert.equal(replaced, true);
        await lease.release();
        lease = undefined;
      }
    } finally {
      await lease?.release();
      await rm(f.root, { recursive: true, force: true });
    }
  },
);
test(
  'failed activation fixture setup removes its copied runtime and temporary state before rejecting',
  { skip: process.platform !== 'linux' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'tandem-fixture-failure-'));
    try {
      const temporary = join(directory, 'temporary'),
        packageRoot = join(directory, 'package'),
        dist = join(packageRoot, 'dist');
      await mkdir(temporary);
      await mkdir(dist, { recursive: true });
      await writeFile(join(packageRoot, 'package.json'), '{"type":"module"}');
      await writeFile(
        join(dist, 'private-files.js'),
        `import {mkdir} from 'node:fs/promises';export async function privateDirectory(path){await mkdir(path);return path;}`,
      );
      await writeFile(
        join(dist, 'cli.js'),
        `import {statSync} from 'node:fs';import {join,dirname} from 'node:path';const state=process.argv[process.argv.indexOf('--state-home')+1];if(statSync(join(dirname(state),'probe')).size<1)process.exit(99);process.stderr.write('SYNTHETIC_SETUP_FAILURE\\n');process.exitCode=71;`,
      );
      const helper = new URL('./fixtures/activation.mjs', import.meta.url).href;
      const result = await run(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `import assert from 'node:assert/strict';import {readdir} from 'node:fs/promises';import {tmpdir} from 'node:os';import {activationFixture} from ${JSON.stringify(helper)};await assert.rejects(activationFixture(),error=>error.code===71);assert.deepEqual(await readdir(tmpdir()),[]);console.log('setup-cleaned');`,
        ],
        {
          env: {
            ...process.env,
            TMPDIR: temporary,
            TANDEM_TEST_PACKAGE: packageRoot,
          },
        },
      );
      assert.equal(result.stdout, 'setup-cleaned\n');
      assert.deepEqual(await readdir(temporary), []);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);
test('a plain external refresh survives A to B to A without restoring an old snapshot', async () => {
  const f = await fixture();
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    let lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
    });
    await lease.release();
    await writePrivate(
      join(f.home, 'auth.json'),
      auth('A', 'SYNTHETIC-NEWEST'),
    );
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[1].id,
    });
    await lease.release();
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
    });
    await lease.release();
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      auth('A', 'SYNTHETIC-NEWEST'),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('launch preparation is immutable and exit sync leaves the chosen identity active', async () => {
  const f = await fixture();
  let lease;
  try {
    const childScript = f.options.command.prefix[0];
    await writeFile(
      childScript,
      (await readFile(childScript, 'utf8')) +
        `\nif(process.argv.includes('--activation-child')) {const {readFileSync,writeFileSync}=await import('node:fs');const {join}=await import('node:path');const launch=JSON.parse(readFileSync(process.argv[3],'utf8'));if(launch.status!=='prepared'||launch.bindingId!==process.argv[4]||launch.codexHome!==process.env.CODEX_HOME)process.exit(90);process.send({ready:true});process.once('message',()=>{writeFileSync(join(process.env.CODEX_HOME,'auth.json'),${JSON.stringify(auth('B', 'SYNTHETIC-AFTER-EXIT'))},{mode:0o600});process.disconnect();});}`,
    );
    const { activateIdentity } = await import(modulePath('activation.js'));
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[1].id,
    });
    const launch = await lease.prepareLaunch('tracked');
    const record = JSON.parse(await readFile(launch.path, 'utf8'));
    assert.equal(record.bindingId, f.profiles[1].bindingId);
    assert.equal(record.profileId, f.profiles[1].id);
    assert.equal(record.status, 'prepared');
    assert.equal(record.target, 'local');
    assert.equal(record.projectPath, await realpath(f.root));
    assert.equal(record.codexHome, f.home);
    assert.equal(
      record.codexExecutable,
      await realpath(f.options.command.executable),
    );
    assert.equal(record.codexEntrypoint, await realpath(childScript));
    assert.equal(record.mode, 'tracked');
    assert.match(record.targetGeneration, /^(windows|wsl|linux):\d+:\d+$/);
    const child = spawn(
      f.options.command.executable,
      [childScript, '--activation-child', launch.path, f.profiles[1].bindingId],
      {
        env: { ...process.env, CODEX_HOME: f.home },
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      },
    );
    const exit = once(child, 'exit');
    await once(child, 'message');
    try {
      await lease.registerProcess(child.pid);
      child.send({ execute: true });
      assert.equal((await exit)[0], 0);
    } finally {
      if (child.exitCode === null) {
        child.kill();
        await exit;
      }
    }
    await lease.syncAfterExit();
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[1].bindingId + '.json'),
        'utf8',
      ),
      auth('B', 'SYNTHETIC-AFTER-EXIT'),
    );
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      auth('B', 'SYNTHETIC-AFTER-EXIT'),
    );
    assert.equal(await readFile(launch.path, 'utf8'), JSON.stringify(record));
    assert.doesNotMatch(
      JSON.stringify(record),
      /SYNTHETIC|tokens|account|subject/,
    );
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
test('essential launch failure cancels by default and an explicit untracked choice remains distinct', async () => {
  const f = await fixture();
  let lease;
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    let fail = true;
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
      boundary: (record, event) => {
        if (fail && record === 'launch' && event === 'write:before')
          throw new Error('SYNTHETIC_STORAGE_FAILURE');
      },
    });
    await assert.rejects(
      lease.prepareLaunch('tracked'),
      /SYNTHETIC_STORAGE_FAILURE/,
    );
    assert.equal(
      (await readdir(join(f.state, 'launches'))).filter((p) =>
        p.startsWith('launch-'),
      ).length,
      0,
    );
    fail = false;
    const launch = await lease.prepareLaunch('untracked');
    assert.equal(
      JSON.parse(await readFile(launch.path, 'utf8')).mode,
      'untracked',
    );
    assert.equal(
      launch.path.startsWith(join(f.home, '.tandem-activation')),
      true,
    );
    await assert.rejects(
      lease.prepareLaunch('tracked'),
      /LAUNCH_ALREADY_PREPARED/,
    );
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
test('a wrong post-exit binding and a failed refresh save preserve target credentials', async () => {
  const f = await fixture();
  let lease;
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    let fail = false;
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
      boundary: (record, event) => {
        if (fail && record === 'exit-refresh' && event === 'replace:before')
          throw new Error('SYNTHETIC_SYNC_FAILURE');
      },
    });
    await writePrivate(
      join(f.home, 'auth.json'),
      auth('B', 'SYNTHETIC-WRONG-BINDING'),
    );
    await assert.rejects(lease.syncAfterExit(), /TARGET_BINDING_MISMATCH/);
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[0].bindingId + '.json'),
        'utf8',
      ),
      auth('A', 'SYNTHETIC-A'),
    );
    await writePrivate(
      join(f.home, 'auth.json'),
      auth('A', 'SYNTHETIC-EXIT-NEWEST'),
    );
    fail = true;
    await assert.rejects(lease.syncAfterExit(), /SYNTHETIC_SYNC_FAILURE/);
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      auth('A', 'SYNTHETIC-EXIT-NEWEST'),
    );
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
test('recovery keeps a refreshed target after replacement and rejects an obsolete transaction', async () => {
  const f = await fixture();
  let lease;
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
    });
    await lease.release();
    lease = undefined;
    await assert.rejects(
      activateIdentity({
        ...f.options,
        profileId: f.profiles[1].id,
        boundary: (record, event) => {
          if (record === 'target' && event === 'replace:after')
            throw new Error('SYNTHETIC_CRASH');
        },
      }),
      /SYNTHETIC_CRASH/,
    );
    const transactionPath = join(
      f.home,
      '.tandem-activation',
      'transaction.json',
    );
    const obsolete = await readFile(transactionPath, 'utf8');
    await writePrivate(
      join(f.home, 'auth.json'),
      auth('B', 'SYNTHETIC-RECOVERED-NEWEST'),
    );
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[1].id,
      operation: 'recover',
    });
    await lease.release();
    lease = undefined;
    assert.equal(
      JSON.parse(await readFile(transactionPath, 'utf8')).resolved.bindingId,
      f.profiles[1].bindingId,
    );
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      auth('B', 'SYNTHETIC-RECOVERED-NEWEST'),
    );
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
    });
    await lease.release();
    lease = undefined;
    await writePrivate(transactionPath, obsolete);
    await assert.rejects(
      activateIdentity({ ...f.options, profileId: f.profiles[0].id }),
      /STALE_TRANSACTION_RECOVERY_REQUIRED/,
    );
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      auth('A', 'SYNTHETIC-A'),
    );
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
test('effective non-file policy blocks activation without changing credentials', async () => {
  const f = await fixture();
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    await writeFile(
      f.options.command.prefix[0],
      `import readline from 'node:readline';readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);if(r.id===0)console.log(JSON.stringify({id:0,result:{}}));if(r.id===1)console.log(JSON.stringify({id:1,result:{config:{cli_auth_credentials_store:'keyring'},layers:[]}}));if(r.id===2)console.log(JSON.stringify({id:2,result:{requirements:null}}));});`,
    );
    await assert.rejects(
      activateIdentity({ ...f.options, profileId: f.profiles[0].id }),
      /FILE_STORAGE_REQUIRED/,
    );
    await assert.rejects(
      readFile(join(f.home, 'auth.json')),
      (error) => error.code === 'ENOENT',
    );
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[0].bindingId + '.json'),
        'utf8',
      ),
      auth('A', 'SYNTHETIC-A'),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('first activation interrupted before replacement retains staging and blocks blind snapshot recovery', async () => {
  const f = await fixture();
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    await assert.rejects(
      activateIdentity({
        ...f.options,
        profileId: f.profiles[0].id,
        boundary: (record, event) => {
          if (record === 'journal-staged' && event === 'replace:after')
            throw new Error('SYNTHETIC_CRASH');
        },
      }),
      /SYNTHETIC_CRASH/,
    );
    await assert.rejects(
      activateIdentity({
        ...f.options,
        profileId: f.profiles[0].id,
        operation: 'recover',
      }),
      /RECOVERABLE_CREDENTIAL_ALTERNATIVES/,
    );
    assert.equal(
      await readFile(
        join(f.home, '.tandem-activation', 'staged-auth.json'),
        'utf8',
      ),
      auth('A', 'SYNTHETIC-A'),
    );
    await assert.rejects(
      readFile(join(f.home, 'auth.json')),
      (error) => error.code === 'ENOENT',
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('a refresh detected at the replacement boundary is preserved instead of overwritten', async () => {
  const f = await fixture();
  let lease;
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
    });
    await lease.release();
    lease = undefined;
    await assert.rejects(
      activateIdentity({
        ...f.options,
        profileId: f.profiles[1].id,
        boundary: async (record, event) => {
          if (record === 'target' && event === 'replace:before')
            await writePrivate(
              join(f.home, 'auth.json'),
              auth('A', 'SYNTHETIC-CONCURRENT-REFRESH'),
            );
        },
      }),
      /EXTERNAL_CREDENTIAL_CHANGE/,
    );
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      auth('A', 'SYNTHETIC-CONCURRENT-REFRESH'),
    );
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
      operation: 'recover',
    });
    assert.equal(
      JSON.parse(
        await readFile(
          join(f.home, '.tandem-activation', 'transaction.json'),
          'utf8',
        ),
      ).resolved.bindingId,
      f.profiles[0].bindingId,
    );
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[0].bindingId + '.json'),
        'utf8',
      ),
      auth('A', 'SYNTHETIC-CONCURRENT-REFRESH'),
    );
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
test('installed activation CLI supports activation, recovery and binding-verified sync', async () => {
  const f = await fixture();
  try {
    const args = [
      fileURLToPath(modulePath('cli.js')),
      'activate',
      '--state-home',
      f.state,
      '--codex-home',
      f.home,
      '--identity',
      f.profiles[0].id,
      '--codex-executable',
      f.options.command.executable,
      '--codex-script',
      f.options.command.prefix[0],
      '--project',
      f.root,
      '--json',
    ];
    assert.equal(
      JSON.parse((await run(process.execPath, args)).stdout).status,
      'activated',
    );
    await writePrivate(
      join(f.home, 'auth.json'),
      auth('A', 'SYNTHETIC-CLI-REFRESH'),
    );
    assert.equal(
      JSON.parse(
        (
          await run(process.execPath, [
            ...args.slice(0, 2),
            'sync',
            ...args.slice(2),
          ])
        ).stdout,
      ).status,
      'synced',
    );
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[0].bindingId + '.json'),
        'utf8',
      ),
      auth('A', 'SYNTHETIC-CLI-REFRESH'),
    );
    assert.equal(
      JSON.parse(
        (
          await run(process.execPath, [
            ...args.slice(0, 2),
            'recover',
            ...args.slice(2),
          ])
        ).stdout,
      ).status,
      'recovered',
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
test('an unmarked existing target requires explicit recovery against the matching binding', async () => {
  const f = await fixture();
  let lease;
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    await writePrivate(
      join(f.home, 'auth.json'),
      auth('A', 'SYNTHETIC-EXTERNAL-FIRST'),
    );
    await assert.rejects(
      activateIdentity({ ...f.options, profileId: f.profiles[0].id }),
      /OUTGOING_BINDING_RECOVERY_REQUIRED/,
    );
    await assert.rejects(
      activateIdentity({
        ...f.options,
        profileId: f.profiles[1].id,
        operation: 'recover',
      }),
      /OUTGOING_BINDING_RECOVERY_REQUIRED/,
    );
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
      operation: 'recover',
    });
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[0].bindingId + '.json'),
        'utf8',
      ),
      auth('A', 'SYNTHETIC-EXTERNAL-FIRST'),
    );
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      auth('A', 'SYNTHETIC-EXTERNAL-FIRST'),
    );
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
test('indistinguishable pending bindings block refresh copies and stale reactivation', async () => {
  const f = await fixture();
  let lease;
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    const input = join(f.root, 'duplicate.json');
    await writeFile(input, auth('A', 'SYNTHETIC-DUPLICATE-SAVED'));
    const duplicate = JSON.parse(
      (
        await run(process.execPath, [
          fileURLToPath(modulePath('cli.js')),
          'profiles',
          'add',
          '--state-home',
          f.state,
          '--label',
          'Duplicate A',
          '--import',
          input,
          '--json',
        ])
      ).stdout,
    ).profile;
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
    });
    await lease.release();
    lease = undefined;
    await writePrivate(
      join(f.home, 'auth.json'),
      auth('A', 'SYNTHETIC-OUTGOING-NEWEST'),
    );
    await assert.rejects(
      activateIdentity({
        ...f.options,
        profileId: duplicate.id,
        boundary: (record, event) => {
          if (record === 'target' && event === 'replace:before')
            throw new Error('SYNTHETIC_CRASH');
        },
      }),
      /SYNTHETIC_CRASH/,
    );
    await writePrivate(
      join(f.home, 'auth.json'),
      auth('A', 'SYNTHETIC-AFTER-CRASH'),
    );
    await assert.rejects(
      activateIdentity({
        ...f.options,
        profileId: duplicate.id,
        operation: 'recover',
      }),
      /RECOVERABLE_CREDENTIAL_ALTERNATIVES/,
    );
    await assert.rejects(
      activateIdentity({ ...f.options, profileId: f.profiles[0].id }),
      /RECOVERABLE_CREDENTIAL_ALTERNATIVES/,
    );
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      auth('A', 'SYNTHETIC-AFTER-CRASH'),
    );
    assert.equal(
      await readFile(
        join(f.state, 'credentials', duplicate.bindingId + '.json'),
        'utf8',
      ),
      auth('A', 'SYNTHETIC-DUPLICATE-SAVED'),
    );
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[0].bindingId + '.json'),
        'utf8',
      ),
      auth('A', 'SYNTHETIC-OUTGOING-NEWEST'),
    );
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
