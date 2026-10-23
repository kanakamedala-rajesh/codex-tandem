// Maintained exhaustive filesystem/phase recovery check. Synthetic fixtures only.
import assert from 'node:assert/strict';
import { readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { modulePath, activationFixture } from '../test/fixtures/activation.mjs';
const { activateIdentity } = await import(modulePath('activation.js'));
const { credentialIdentity } = await import(modulePath('profiles.js'));
const { processIdentity } = await import(modulePath('processes.js'));
const { writePrivate } = await import(modulePath('private-files.js'));
const args = new Map(process.argv.slice(2).map((arg) => arg.split('=')));
assert.ok(
  [...args].every(
    ([key, value]) =>
      ['--start', '--end', '--kind', '--list'].includes(key) &&
      (key === '--list' || value),
  ),
  'Invalid recovery verifier arguments',
);
const records = [
  'outgoing',
  'journal-begun',
  'journal-outgoing-saved',
  'stage',
  'journal-staged',
  'target',
  'journal-replaced',
  'active',
  'journal-active',
  'journal-complete',
  'launch',
  'exit-refresh',
  'recovery-refresh',
  'recovery-active',
  'recovery-complete',
  'recovery-adopt',
];
const operations = [
  'open',
  'restrict',
  'write',
  'flush',
  'close',
  'replace',
  'verify',
  'publication-flush',
];
// Staging covers the common durability primitive; launch covers exclusive publication.
// Every other role exercises each write/flush/replace edge in its own phase context.
const cases = records.flatMap((record) => {
  const primitive = record === 'stage' || record === 'launch';
  const failures = (
    primitive ? operations : ['write', 'flush', 'replace']
  ).flatMap((operation) =>
    ['before', 'after'].map((edge) => ({
      record,
      event: operation + ':' + edge,
      kind: 'failure',
    })),
  );
  const crashEdges = primitive
    ? ['write:after', 'replace:after', 'publication-flush:after']
    : record === 'target'
      ? ['replace:after', 'publication-flush:after']
      : ['publication-flush:after'];
  return [
    ...failures,
    ...crashEdges.map((event) => ({ record, event, kind: 'crash' })),
  ];
});
const coverage = records.map((record) => ({
  record,
  direct: cases.filter((c) => c.record === record),
  sharedPrimitive:
    record === 'stage' || record === 'launch'
      ? null
      : 'stage: open/restrict/close/verify/publication-flush edges use identical writePrivateDurable operations; phase-specific publication is terminated directly',
}));
if (args.has('--kind'))
  assert.ok(['failure', 'crash'].includes(args.get('--kind')));
const start = Number(args.get('--start') ?? 0),
  end = Number(args.get('--end') ?? cases.length);
assert.ok(
  Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end <= cases.length &&
    start < end,
);
if (args.has('--list')) {
  console.log(JSON.stringify({ total: cases.length, cases, coverage }));
  process.exit(0);
}
const f = await activationFixture();
const runner = join(f.root, 'launcher.mjs');
await writeFile(
  runner,
  `
import {activateIdentity} from ${JSON.stringify(modulePath('activation.js'))};
import {processIdentity} from ${JSON.stringify(modulePath('processes.js'))};
const config=JSON.parse(process.env.TANDEM_RECOVERY_TEST);
process.send({owner:await processIdentity(process.pid)});
let reached=false,lease;
try {
  lease=await activateIdentity({...config.options,boundary:async(record,event)=>{
    if(record!==config.record||event!==config.event)return;
    reached=true;
    if(config.kind==='failure')throw new Error('INJECTED_FAILURE');
    // Keep IPC referenced while the parent verifies and terminates this paused child.
    process.on('message',()=>{});
    process.send({checkpoint:true});
    await new Promise(()=>{});
  }});
  if(config.record==='launch')await lease.prepareLaunch('tracked');
  if(config.record==='exit-refresh')await lease.syncAfterExit();
  process.send({unexpected:true});
}catch(error){process.send({failed:reached&&error.message==='INJECTED_FAILURE',code:/^[A-Z_]+$/.test(error.message)?error.message:'VERIFICATION_FAILED'});}
finally {await lease?.release();process.disconnect();}
`,
);
let measured = 0;
let currentChild;
let currentOwner;
let retained = false;
let temporaryFixture;
const sharedFixture = f;
try {
  const initial = await activateIdentity({
    ...f.options,
    profileId: f.profiles[0].id,
  });
  await initial.release();
  for (let index = start; index < end; index++) {
    const c = cases[index];
    if (args.has('--kind') && c.kind !== args.get('--kind')) continue;
    const f =
      c.record === 'recovery-adopt' ? await activationFixture() : sharedFixture;
    if (f !== sharedFixture) {
      temporaryFixture = f;
      await writePrivate(
        join(f.home, 'auth.json'),
        await readFile(
          join(f.state, 'credentials', f.profiles[0].bindingId + '.json'),
        ),
      );
    }
    const current = credentialIdentity(
      await readFile(join(f.home, 'auth.json')),
    ).account;
    const chosen =
      c.record === 'recovery-adopt'
        ? f.profiles[0]
        : f.profiles[current === 'A' ? 1 : 0];
    if (c.record.startsWith('recovery-') && c.record !== 'recovery-adopt') {
      await assert.rejects(
        activateIdentity({
          ...f.options,
          profileId: chosen.id,
          boundary: (record, event) => {
            if (record === 'target' && event === 'replace:after')
              throw new Error('PREPARE_RECOVERY');
          },
        }),
        /PREPARE_RECOVERY/,
      );
    }
    const child = spawn(process.execPath, [runner], {
      env: {
        ...process.env,
        TANDEM_RECOVERY_TEST: JSON.stringify({
          options: {
            ...f.options,
            profileId: chosen.id,
            ...(c.record.startsWith('recovery-')
              ? { operation: 'recover' }
              : {}),
          },
          ...c,
        }),
      },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      windowsHide: true,
    });
    currentChild = child;
    currentOwner = undefined;
    const exited = once(child, 'exit');
    let owner;
    const outcome = await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Owned recovery launcher timed out')),
        180000,
      );
      child.on('message', (message) => {
        if (message.owner) {
          owner = message.owner;
          currentOwner = owner;
        }
        if (
          message.checkpoint ||
          message.failed ||
          message.unexpected ||
          message.code
        ) {
          clearTimeout(timer);
          resolve(message);
        }
      });
      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.once('exit', () => {
        clearTimeout(timer);
        reject(new Error('Launcher exited before verification boundary'));
      });
    });
    if (c.kind === 'crash') {
      assert.equal(outcome.checkpoint, true);
      const actual = await processIdentity(child.pid);
      assert.deepEqual(
        actual,
        owner,
        'Only the freshly verified owned launcher may be terminated',
      );
      assert.equal(child.kill('SIGKILL'), true);
    } else assert.equal(outcome.failed, true);
    await exited;
    currentChild = undefined;
    currentOwner = undefined;
    const bytes = await readFile(join(f.home, 'auth.json'));
    const target = credentialIdentity(bytes).account;
    assert.ok(['A', 'B'].includes(target));
    for (const profile of f.profiles)
      credentialIdentity(
        await readFile(
          join(f.state, 'credentials', profile.bindingId + '.json'),
        ),
      );
    const profile = f.profiles[target === 'A' ? 0 : 1];
    const recovered = await activateIdentity({
      ...f.options,
      profileId: profile.id,
      operation: 'recover',
    });
    await recovered.release();
    try {
      const transaction = JSON.parse(
        await readFile(
          join(f.home, '.tandem-activation', 'transaction.json'),
          'utf8',
        ),
      );
      assert.equal(transaction.phase, 'complete');
      assert.equal(transaction.resolved.bindingId, profile.bindingId);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    assert.deepEqual(
      await readFile(join(f.home, 'auth.json')),
      bytes,
      'Recovery must retain current matching credentials',
    );
    assert.deepEqual(
      await readFile(join(f.state, 'credentials', profile.bindingId + '.json')),
      bytes,
    );
    for (const directory of [
      join(f.state, 'launches'),
      join(f.home, '.tandem-activation'),
    ]) {
      let names = [];
      try {
        names = await readdir(directory);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
      for (const name of names.filter((name) => name.startsWith('launch-'))) {
        const metadata = JSON.parse(
          await readFile(join(directory, name), 'utf8'),
        );
        assert.equal(metadata.status, 'prepared');
        assert.doesNotMatch(
          JSON.stringify(metadata),
          /SYNTHETIC|tokens|account|subject/,
        );
      }
    }
    measured++;
    if (temporaryFixture) {
      await rm(temporaryFixture.root, { recursive: true, force: true });
      temporaryFixture = undefined;
    }
    console.log(
      JSON.stringify({
        index,
        ...c,
        result: 'PASS',
        platform: process.platform,
        node: process.version,
      }),
    );
  }
  console.log(
    JSON.stringify({
      total: cases.length,
      measured,
      start,
      end,
      kind: args.get('--kind') ?? 'both',
      result: 'PASS',
    }),
  );
} finally {
  if (
    currentChild &&
    currentChild.exitCode === null &&
    currentChild.signalCode === null
  ) {
    const actual = await processIdentity(currentChild.pid);
    if (
      actual &&
      currentOwner &&
      JSON.stringify(actual) === JSON.stringify(currentOwner)
    ) {
      const exit = once(currentChild, 'exit');
      currentChild.kill('SIGKILL');
      await exit;
    } else if (actual) {
      retained = true;
      console.error(
        JSON.stringify({
          result: 'RECOVERY_REQUIRED',
          fixture: (temporaryFixture ?? f).root,
          reason: 'OWNED_LAUNCHER_IDENTITY_UNRESOLVED',
        }),
      );
    }
  }
  if (!retained) {
    if (temporaryFixture)
      await rm(temporaryFixture.root, { recursive: true, force: true });
    await rm(f.root, { recursive: true, force: true });
  }
}
