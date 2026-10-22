import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readFile,
  writeFile,
  appendFile,
  rm,
  mkdir,
  readdir,
  symlink,
  rename,
  chmod,
  link,
} from 'node:fs/promises';
import { join } from 'node:path';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { activationFixture, modulePath } from './fixtures/activation.mjs';
import { resumeIndexFixture } from './fixtures/resume.mjs';

const execute = promisify(execFile);
const id = '00000000-0000-4000-8000-000000000041';
const otherId = '00000000-0000-4000-8000-000000000042';
const cli = fileURLToPath(modulePath('cli.js'));
const resolver = () => import(modulePath('resume.js'));
const lookup = async (f, selection = id, project = f.root) =>
  (await resolver()).resolveLocalResume(f.home, project, selection, {
    stateHome: f.state,
    command: f.options.command,
  });
const sourcePath = (f) =>
  join(f.home, 'sessions', `rollout-2026-10-04T00-00-00-${id}.jsonl`);
const launchArgs = (f) => [
  'resume',
  id,
  '--identity',
  f.profiles[0].id,
  '--target',
  'local',
  '--state-home',
  f.state,
  '--codex-home',
  f.home,
  '--codex-executable',
  f.options.command.executable,
  '--codex-script',
  f.options.command.prefix[0],
  '--project',
  f.root,
  '--json',
];

test('explicit CLI preparation never activates credentials and stores only bounded metadata', async () => {
  const f = await activationFixture();
  try {
    await resumeIndexFixture(f, [{ id }]);
    const args = launchArgs(f);
    args.splice(1, 0, 'prepare');
    const result = await execute(process.execPath, [cli, ...args], {
      timeout: 10000,
    });
    assert.equal(JSON.parse(result.stdout).id, id);
    await assert.rejects(readFile(join(f.home, 'auth.json')), {
      code: 'ENOENT',
    });
    await assert.rejects(readdir(join(f.state, 'launches')), {
      code: 'ENOENT',
    });
    const scope = (await readdir(join(f.state, 'resume')))[0];
    const paths = await readdir(join(f.state, 'resume', scope));
    assert.deepEqual(paths, [id + '.json']);
    const record = await readFile(
      join(f.state, 'resume', scope, paths[0]),
      'utf8',
    );
    assert.ok(Buffer.byteLength(record) <= 65536);
    assert.doesNotMatch(
      record,
      /SYNTHETIC-(?:CONVERSATION|PREVIEW|ACCESS|REFRESH)|refresh_token|first_user_message/,
    );
    assert.equal((await lookup(f)).id, id);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('native database changes invalidate explicit and last proofs instead of silently using older metadata', async () => {
  const f = await activationFixture();
  try {
    const prepare = await resumeIndexFixture(f, [{ id }]);
    await prepare('last');
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(f.home, 'state_5.sqlite'));
    db.prepare('INSERT INTO threads VALUES(?,?,?,?,?)').run(
      otherId,
      sourcePath(f),
      f.root,
      999,
      'new native row',
    );
    db.close();
    await assert.rejects(lookup(f), /RESUME_PREPARATION_STALE/);
    await assert.rejects(lookup(f, 'last'), /RESUME_PREPARATION_STALE/);
    const failed = await execute(process.execPath, [cli, ...launchArgs(f)], {
      timeout: 10000,
    }).catch((error) => error);
    assert.equal(failed.code, 2);
    assert.equal(JSON.parse(failed.stderr).code, 'RESUME_PREPARATION_STALE');
    await assert.rejects(readFile(join(f.home, 'auth.json')), {
      code: 'ENOENT',
    });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('the mandatory policy check invalidates a changed native index before credential replacement', async () => {
  const f = await activationFixture();
  try {
    const trigger = join(f.root, 'change-during-policy');
    const script = f.options.command.prefix[0];
    const policy = await readFile(script, 'utf8');
    await writeFile(
      script,
      `import {existsSync,appendFileSync} from 'node:fs';\n${policy.replace('if(r.id===1)', `if(r.id===1&&existsSync(${JSON.stringify(trigger)}))appendFileSync(${JSON.stringify(join(f.home, 'state_5.sqlite'))},'CHANGED');if(r.id===1)`)}`,
    );
    const prepare = await resumeIndexFixture(f, [{ id }]);
    await prepare(id);
    await writeFile(trigger, 'synthetic trigger');
    assert.equal((await lookup(f)).id, id);
    const failed = await execute(process.execPath, [cli, ...launchArgs(f)], {
      timeout: 10000,
    }).catch((error) => error);
    assert.equal(failed.code, 2);
    assert.equal(JSON.parse(failed.stderr).code, 'RESUME_PREPARATION_STALE');
    await assert.rejects(readFile(join(f.home, 'auth.json')), {
      code: 'ENOENT',
    });
    await assert.rejects(
      readFile(join(f.home, '.tandem-activation', 'transaction.json')),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('storage and native-feature overrides are checked before credentials without retaining raw override values', async () => {
  for (const kind of ['storage', 'feature']) {
    const f = await activationFixture();
    try {
      const other = join(f.root, 'other-index');
      await mkdir(other);
      const script = f.options.command.prefix[0];
      const source = await readFile(script, 'utf8');
      await writeFile(
        script,
        source.replace(
          "config:{cli_auth_credentials_store:'file'}",
          `config:{cli_auth_credentials_store:'file',sqlite_home:process.argv.includes('sqlite_home=changed')?${JSON.stringify(other)}:process.env.CODEX_HOME,features:{persist_extended_history:process.argv.includes('--enable')}}`,
        ),
      );
      const prepare = await resumeIndexFixture(f, [{ id }]);
      await prepare(id);
      const override =
        kind === 'storage'
          ? ['--config', 'sqlite_home=changed']
          : ['--enable', 'persist_extended_history'];
      const failed = await execute(
        process.execPath,
        [cli, ...launchArgs(f), '--', ...override],
        { timeout: 10000 },
      ).catch((error) => error);
      assert.equal(failed.code, 2);
      assert.equal(JSON.parse(failed.stderr).code, 'RESUME_PREPARATION_STALE');
      await assert.rejects(readFile(join(f.home, 'auth.json')), {
        code: 'ENOENT',
      });
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test('source appends, executable changes and newly applicable project config invalidate prepared resume', async () => {
  for (const mutation of ['source', 'command', 'config']) {
    const f = await activationFixture();
    try {
      const prepare = await resumeIndexFixture(f, [{ id }]);
      await prepare(id);
      if (mutation === 'source')
        await appendFile(sourcePath(f), 'SYNTHETIC-APPEND\n');
      if (mutation === 'command')
        await appendFile(f.options.command.prefix[0], '\n// changed command\n');
      if (mutation === 'config') {
        await mkdir(join(f.root, '.codex'));
        await writeFile(
          join(f.root, '.codex', 'config.toml'),
          'model="changed"\n',
        );
      }
      await assert.rejects(lookup(f), /RESUME_PREPARATION_STALE/);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test('a newly applicable managed config invalidates the final local resume proof after mandatory policy', async () => {
  const f = await activationFixture();
  const managed = '/etc/codex/managed_config.toml';
  const simulated = join(f.root, 'synthetic-managed-config.toml');
  const originalRealpath = fsPromises.realpath;
  const originalStat = fsPromises.stat;
  try {
    fsPromises.realpath = (path, ...args) =>
      originalRealpath(path === managed ? simulated : path, ...args);
    fsPromises.stat = (path, ...args) =>
      originalStat(path === managed ? simulated : path, ...args);
    syncBuiltinESMExports();
    const prepare = await resumeIndexFixture(f, [{ id }]);
    await prepare(id);
    const proof = await lookup(f);
    const { inspectResumePolicy } = await import(
      modulePath('profile-login.js')
    );
    const policy = await inspectResumePolicy({
      command: f.options.command,
      codexHome: f.home,
      cwd: f.root,
    });
    await proof.revalidate(policy);
    await writeFile(simulated, 'synthetic newly applicable managed config\n');
    await assert.rejects(proof.revalidate(), /RESUME_PREPARATION_STALE/);
    await assert.rejects(readFile(join(f.home, 'auth.json')), {
      code: 'ENOENT',
    });
  } finally {
    fsPromises.realpath = originalRealpath;
    fsPromises.stat = originalStat;
    syncBuiltinESMExports();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('prepared resume permits fresh safe SHM caches and absent or exactly empty WAL files', async () => {
  const f = await activationFixture();
  try {
    const wal = join(f.home, 'state_5.sqlite-wal');
    const shm = join(f.home, 'state_5.sqlite-shm');
    const clearCache = join(f.root, 'clear-cache-during-policy');
    const script = f.options.command.prefix[0];
    await writeFile(
      script,
      `import {rmSync,existsSync} from 'node:fs';
process.on('SIGTERM',()=>{if(existsSync(${JSON.stringify(clearCache)})){rmSync(${JSON.stringify(wal)},{force:true});rmSync(${JSON.stringify(shm)},{force:true});}process.exit(0);});
if(!process.argv.includes('app-server'))process.exit(0);
${await readFile(script, 'utf8')}`,
    );
    const prepare = await resumeIndexFixture(f, [{ id }]);
    await prepare(id);
    const proof = await lookup(f);
    for (const path of [shm, wal]) {
      await writeFile(path, path === shm ? 'synthetic coordination cache' : '');
      await proof.revalidate();
      await rm(path);
      await writeFile(path, '');
      await proof.revalidate();
      await rm(path);
      await proof.revalidate();
    }
    await writeFile(wal, '');
    await writeFile(shm, 'synthetic initial cache');
    await prepare(id);
    const withCache = await lookup(f);
    await rm(wal);
    await rm(shm);
    await withCache.revalidate();
    await writeFile(shm, 'synthetic recreated cache');
    await withCache.revalidate();
    await writeFile(wal, '');
    await writeFile(shm, 'synthetic ordinary-policy cache');
    await writeFile(clearCache, 'synthetic trigger');
    await execute(process.execPath, [cli, ...launchArgs(f)], {
      timeout: 10000,
    });
    assert.ok((await readFile(join(f.home, 'auth.json'))).length > 0);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('mandatory policy creating a nonempty WAL refuses resume before credential replacement', async () => {
  const f = await activationFixture();
  try {
    const trigger = join(f.root, 'change-wal-during-policy');
    const wal = join(f.home, 'state_5.sqlite-wal');
    const script = f.options.command.prefix[0];
    const source = await readFile(script, 'utf8');
    await writeFile(
      script,
      `import {existsSync,writeFileSync} from 'node:fs';\n${source.replace('if(r.id===1)', `if(r.id===1&&existsSync(${JSON.stringify(trigger)}))writeFileSync(${JSON.stringify(wal)},'synthetic WAL data');if(r.id===1)`)}`,
    );
    const prepare = await resumeIndexFixture(f, [{ id }]);
    await prepare(id);
    await writeFile(trigger, 'synthetic trigger');
    const failed = await execute(process.execPath, [cli, ...launchArgs(f)], {
      timeout: 10000,
    }).catch((error) => error);
    assert.equal(failed.code, 2);
    assert.equal(JSON.parse(failed.stderr).code, 'RESUME_PREPARATION_STALE');
    await assert.rejects(readFile(join(f.home, 'auth.json')), {
      code: 'ENOENT',
    });
    await assert.rejects(
      readFile(join(f.home, '.tandem-activation', 'transaction.json')),
      { code: 'ENOENT' },
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('disposable SQLite sidecars still require accessible exact native stat evidence', async () => {
  const f = await activationFixture();
  const originalLstat = fsPromises.lstat;
  const originalStat = fsPromises.stat;
  try {
    const prepare = await resumeIndexFixture(f, [{ id }]);
    await prepare(id);
    const proof = await lookup(f);
    for (const suffix of ['-wal', '-shm']) {
      const target = join(f.home, 'state_5.sqlite' + suffix);
      await writeFile(target, '');
      try {
        fsPromises.lstat = (path, ...args) => {
          if (path === target)
            throw Object.assign(new Error('synthetic inaccessible sidecar'), {
              code: 'EACCES',
            });
          return originalLstat(path, ...args);
        };
        syncBuiltinESMExports();
        await assert.rejects(proof.revalidate(), /RESUME_SOURCE_UNAVAILABLE/);
        fsPromises.lstat = originalLstat;
        fsPromises.stat = async (path, ...args) => {
          const info = await originalStat(path, ...args);
          if (path !== target) return info;
          const missingPrecision = Object.create(info);
          Object.defineProperty(missingPrecision, 'mtimeNs', {
            value: undefined,
          });
          return missingPrecision;
        };
        syncBuiltinESMExports();
        await assert.rejects(
          proof.revalidate(),
          /RESUME_WITNESS_PRECISION_UNSUPPORTED/,
        );
      } finally {
        fsPromises.lstat = originalLstat;
        fsPromises.stat = originalStat;
        syncBuiltinESMExports();
        await rm(target, { force: true });
      }
    }
  } finally {
    fsPromises.lstat = originalLstat;
    fsPromises.stat = originalStat;
    syncBuiltinESMExports();
    await rm(f.root, { recursive: true, force: true });
  }
});

test(
  'prepared resume freshly refuses unsafe SQLite sidecars including dangling links',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await activationFixture();
    try {
      const prepare = await resumeIndexFixture(f, [{ id }]);
      await prepare(id);
      const proof = await lookup(f);
      const target = join(f.root, 'synthetic-sidecar-target');
      await writeFile(target, 'synthetic cache');
      for (const suffix of ['-wal', '-shm']) {
        const path = join(f.home, 'state_5.sqlite' + suffix);
        for (const kind of ['dangling', 'symbolic', 'hardlink', 'directory']) {
          try {
            if (kind === 'dangling')
              await symlink(join(f.root, 'missing-target'), path);
            if (kind === 'symbolic') await symlink(target, path);
            if (kind === 'hardlink') await link(target, path);
            if (kind === 'directory') await mkdir(path);
            await assert.rejects(proof.revalidate(), /RESUME_SOURCE_UNSAFE/);
          } finally {
            await rm(path, { recursive: true, force: true });
          }
        }
      }
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  },
);

test('native main and journal changes remain strict even when their data is empty', async () => {
  for (const mutation of ['main', 'empty-journal', 'nonempty-wal']) {
    const f = await activationFixture();
    try {
      const prepare = await resumeIndexFixture(f, [{ id }]);
      await prepare(id);
      const proof = await lookup(f);
      const path = join(
        f.home,
        'state_5.sqlite' +
          (mutation === 'main'
            ? ''
            : mutation === 'empty-journal'
              ? '-journal'
              : '-wal'),
      );
      if (mutation === 'main') {
        const original = await readFile(path);
        original[original.length - 1] ^= 1;
        await writeFile(path, original);
      } else
        await writeFile(
          path,
          mutation === 'empty-journal' ? '' : 'synthetic nonempty WAL',
        );
      await assert.rejects(proof.revalidate(), /RESUME_PREPARATION_STALE/);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});

test(
  'prepared physical project membership cannot be reassigned by retargeting a cwd alias',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await activationFixture();
    try {
      const project = join(f.root, 'project'),
        other = join(f.root, 'other'),
        alias = join(f.root, 'alias');
      await mkdir(project);
      await mkdir(other);
      await symlink(project, alias, 'dir');
      const prepare = await resumeIndexFixture(f, [{ id, cwd: alias }]);
      await prepare(id, project);
      assert.equal((await lookup(f, id, project)).id, id);
      await rm(alias);
      await symlink(other, alias, 'dir');
      await assert.rejects(lookup(f, id, project), /RESUME_PREPARATION_STALE/);
      await assert.rejects(prepare(id, other), /RESUME_PROJECT_CHANGED/);
      await assert.rejects(prepare('last', other), /RESUME_PROJECT_CHANGED/);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  },
);

test('explicit preparation cannot rebind an existing UUID after native cwd text changes', async () => {
  const f = await activationFixture();
  try {
    const project = join(f.root, 'project'),
      other = join(f.root, 'other');
    await mkdir(project);
    await mkdir(other);
    const prepare = await resumeIndexFixture(f, [{ id, cwd: project }]);
    await prepare(id, project);
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(join(f.home, 'state_5.sqlite'));
    db.prepare('UPDATE threads SET cwd=? WHERE id=?').run(other, id);
    db.close();
    await writeFile(
      sourcePath(f),
      JSON.stringify({ type: 'session_meta', payload: { id, cwd: other } }) +
        '\n',
    );
    await assert.rejects(prepare(id, other), /RESUME_PROJECT_CHANGED/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('explicit preparation permits a mode refresh but refuses a different project inode at the same path', async () => {
  const f = await activationFixture();
  try {
    const project = join(f.root, 'project');
    await mkdir(project, { mode: 0o700 });
    const prepare = await resumeIndexFixture(f, [{ id, cwd: project }]);
    await prepare(id, project);
    await chmod(project, 0o750);
    await prepare(id, project);
    assert.equal((await lookup(f, id, project)).id, id);
    await rename(project, join(f.root, 'old-project'));
    await mkdir(project);
    await assert.rejects(prepare(id, project), /RESUME_PROJECT_CHANGED/);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test(
  'prepared lookup ignores unrelated history entries and does not require readable rollout contents',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await activationFixture();
    try {
      const prepare = await resumeIndexFixture(f, [{ id }]);
      await prepare('last');
      const unrelated = join(f.home, 'sessions', 'unrelated');
      await mkdir(unrelated);
      // A history walker would reject these links or parse invalid first lines.
      await symlink(
        join(f.root, 'unavailable-private-history'),
        join(unrelated, 'poison'),
      );
      await Promise.all(
        Array.from({ length: 64 }, (_, index) =>
          writeFile(
            join(
              unrelated,
              `rollout-2026-10-04T00-00-00-00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}.jsonl`,
            ),
            'INVALID-SYNTHETIC-ROLLOUT\n',
          ),
        ),
      );
      const originalOpen = fsPromises.open;
      fsPromises.open = (path, ...args) => {
        if (
          String(path).startsWith(join(f.home, 'sessions')) ||
          String(path).startsWith(join(f.home, 'state_5.sqlite'))
        )
          throw new Error('FORBIDDEN_NATIVE_HISTORY_CONTENT_READ');
        return originalOpen(path, ...args);
      };
      syncBuiltinESMExports();
      try {
        const proof = await lookup(f, 'last');
        assert.equal(proof.id, id);
        await proof.revalidate();
      } finally {
        fsPromises.open = originalOpen;
        syncBuiltinESMExports();
      }
      const child = await execute(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          `
        const {resolveLocalResume}=await import(${JSON.stringify(modulePath('resume.js'))});
        const proof=await resolveLocalResume(${JSON.stringify(f.home)},${JSON.stringify(f.root)},'last',
          {stateHome:${JSON.stringify(f.state)},command:${JSON.stringify(f.options.command)}});
        console.log(JSON.stringify({id:proof.id,sqliteLoaded:process.moduleLoadList.some(name=>name.includes('sqlite'))}));
      `,
        ],
        { timeout: 10000 },
      );
      assert.deepEqual(JSON.parse(child.stdout), { id, sqliteLoaded: false });
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  },
);

test('preparation reads current committed WAL rows through a private copy and leaves original sources unchanged', async () => {
  const f = await activationFixture();
  let writer;
  try {
    const prepare = await resumeIndexFixture(f, [{ id }]);
    const { DatabaseSync } = await import('node:sqlite');
    writer = new DatabaseSync(join(f.home, 'state_5.sqlite'));
    writer.exec('PRAGMA journal_mode=WAL');
    writer.prepare('UPDATE threads SET created_at_ms=? WHERE id=?').run(42, id);
    const before = await Promise.all(
      ['', '-wal', '-shm'].map((suffix) =>
        readFile(join(f.home, 'state_5.sqlite' + suffix)),
      ),
    );
    await prepare('last');
    assert.equal((await lookup(f, 'last')).id, id);
    const after = await Promise.all(
      ['', '-wal', '-shm'].map((suffix) =>
        readFile(join(f.home, 'state_5.sqlite' + suffix)),
      ),
    );
    assert.deepEqual(after, before);
    const proof = await lookup(f, 'last');
    const wal = join(f.home, 'state_5.sqlite-wal');
    const parked = join(f.root, 'parked-synthetic-wal');
    let parkedOriginal = false;
    try {
      await appendFile(wal, 'synthetic changed nonempty WAL');
      await assert.rejects(proof.revalidate(), /RESUME_PREPARATION_STALE/);
      await writeFile(wal, before[1]);
      await rename(wal, parked);
      parkedOriginal = true;
      await assert.rejects(proof.revalidate(), /RESUME_PREPARATION_STALE/);
      await writeFile(wal, '');
      await assert.rejects(proof.revalidate(), /RESUME_PREPARATION_STALE/);
    } finally {
      if (parkedOriginal) {
        await rm(wal, { force: true });
        await rename(parked, wal);
      }
      await writeFile(wal, before[1]);
    }
  } finally {
    writer?.close();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('copy publication failure closes the read-only original handle and removes temporary native content', async () => {
  const f = await activationFixture();
  const originalOpen = fsPromises.open;
  let originalClosed = false,
    temporaryPath;
  try {
    const prepare = await resumeIndexFixture(f, [{ id }]);
    fsPromises.open = async (path, ...args) => {
      if (String(path).endsWith('state_5.sqlite') && args[0] === 'wx') {
        temporaryPath = join(String(path), '..');
        throw Object.assign(new Error('synthetic storage failure'), {
          code: 'ENOSPC',
        });
      }
      const handle = await originalOpen(path, ...args);
      if (String(path) === join(f.home, 'state_5.sqlite')) {
        const close = handle.close.bind(handle);
        handle.close = async () => {
          originalClosed = true;
          await close();
        };
      }
      return handle;
    };
    syncBuiltinESMExports();
    await assert.rejects(
      prepare(id),
      (error) =>
        error.message === 'RESUME_SOURCE_UNAVAILABLE' &&
        error.cause === undefined,
    );
    assert.equal(originalClosed, true);
    await assert.rejects(readdir(temporaryPath), { code: 'ENOENT' });
  } finally {
    fsPromises.open = originalOpen;
    syncBuiltinESMExports();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('incomplete native indexes and ambiguous latest native timestamps fail without publishing a usable proof', async () => {
  for (const kind of ['incomplete', 'ambiguous']) {
    const f = await activationFixture();
    try {
      const prepare = await resumeIndexFixture(f, [
        { id, timestamp: 1 },
        { id: otherId, timestamp: 1 },
      ]);
      if (kind === 'incomplete') {
        const { DatabaseSync } = await import('node:sqlite');
        const db = new DatabaseSync(join(f.home, 'state_5.sqlite'));
        db.exec("UPDATE backfill_state SET status='pending'");
        db.close();
      }
      await assert.rejects(
        prepare('last'),
        kind === 'incomplete'
          ? /RESUME_INDEX_INCOMPLETE/
          : /RESUME_LAST_AMBIGUOUS/,
      );
      await assert.rejects(lookup(f, 'last'), /RESUME_PREPARATION_REQUIRED/);
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  }
});
