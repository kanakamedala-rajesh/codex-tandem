import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
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
