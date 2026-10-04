import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFile, spawn } from 'node:child_process';
import {
  readFile,
  writeFile,
  rm,
  readdir,
  realpath,
  mkdtemp,
  mkdir,
  symlink,
  stat,
  chmod,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  modulePath,
  activationFixture,
  syntheticAuth,
} from './fixtures/activation.mjs';

const cli = fileURLToPath(modulePath('cli.js'));
const invoke = (args) =>
  spawnSync(process.execPath, [cli, ...args], {
    encoding: 'utf8',
    input: '',
    timeout: 5000,
  });

test('resume resolves explicit UUID and opt-in last only within the canonical project and home', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct13-resume-'));
  try {
    const home = join(root, 'home'),
      project = join(root, 'project'),
      other = join(root, 'other');
    await Promise.all([
      mkdir(join(home, 'sessions', '2026', '10', '04'), { recursive: true }),
      mkdir(project),
      mkdir(other),
    ]);
    const ids = [
      '00000000-0000-4000-8000-000000000001',
      '00000000-0000-4000-8000-000000000002',
    ];
    for (let i = 0; i < 2; i++)
      await writeFile(
        join(
          home,
          'sessions',
          '2026',
          '10',
          '04',
          `rollout-2026-10-04T00-00-0${i}-${ids[i]}.jsonl`,
        ),
        JSON.stringify({
          type: 'session_meta',
          payload: {
            id: ids[i],
            cwd: i === 0 ? project : other,
            timestamp: `2026-10-04T00:00:0${i}.000Z`,
          },
        }) +
          '\n' +
          'SYNTHETIC-NON-METADATA-CONTENT\n',
      );
    const { resolveLocalResume } = await import(modulePath('resume.js'));
    assert.equal(await resolveLocalResume(home, project, ids[0]), ids[0]);
    assert.equal(await resolveLocalResume(home, project, 'last'), ids[0]);
    await assert.rejects(
      resolveLocalResume(home, project, ids[1]),
      /RESUME_PROJECT_MISMATCH/,
    );
    const wrongProject = invoke([
      'resume',
      ids[1],
      '--identity',
      'saved-id',
      '--target',
      'local',
      '--codex-home',
      home,
      '--codex-executable',
      process.execPath,
      '--project',
      project,
      '--json',
    ]);
    assert.equal(wrongProject.status, 2);
    assert.equal(
      JSON.parse(wrongProject.stderr).code,
      'RESUME_PROJECT_MISMATCH',
    );
    assert.equal(wrongProject.stdout, '');
    await assert.rejects(
      resolveLocalResume(home, project, '00000000-0000-4000-8000-000000000003'),
      /RESUME_UNAVAILABLE/,
    );
    await rm(other, { recursive: true });
    await assert.rejects(
      resolveLocalResume(home, project, ids[1]),
      /RESUME_PROJECT_UNAVAILABLE/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('local launch preserves arguments and streams, journals before execution and saves refreshes', async () => {
  const f = await activationFixture();
  try {
    const script = f.options.command.prefix[0];
    const policy = (await readFile(script, 'utf8')).replace(
      "import readline from 'node:readline';",
      "const {default:readline}=await import('node:readline');",
    );
    await writeFile(
      script,
      `if(process.argv.includes('app-server')){${policy}}else{
      const {readFileSync,writeFileSync,readdirSync}=await import('node:fs');
      const {join}=await import('node:path');
      const records=readdirSync(${JSON.stringify(join(f.state, 'launches'))});
      const record=JSON.parse(readFileSync(join(${JSON.stringify(join(f.state, 'launches'))},records[0]),'utf8'));
      if(record.status!=='prepared'||record.profileId!==${JSON.stringify(f.profiles[1].id)}) process.exit(91);
      console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd(),home:process.env.CODEX_HOME}));
      process.stderr.write('CHILD-STDERR\\n');
      for await(const bytes of process.stdin) process.stdout.write(bytes);
      writeFileSync(join(process.env.CODEX_HOME,'auth.json'),${JSON.stringify(syntheticAuth('B', 'SYNTHETIC-NEWEST'))});
      process.exitCode=7;
    }`,
    );
    const args = ['--config', 'model="a b"', '"quotes"', 'こんにちは', ';&$x'];
    const result = await new Promise((resolve) => {
      const child = execFile(
        process.execPath,
        [
          '--no-warnings',
          '--loader',
          new URL('./fixtures/missing-builtins-loader.mjs', import.meta.url)
            .href,
          cli,
          'run',
          '--target',
          'local',
          '--identity',
          f.profiles[1].id,
          '--state-home',
          f.state,
          '--codex-home',
          f.home,
          '--codex-executable',
          f.options.command.executable,
          '--codex-script',
          script,
          '--project',
          f.root,
          '--',
          ...args,
        ],
        { encoding: 'utf8', timeout: 180000 },
        (error, stdout, stderr) =>
          resolve({ code: error?.code ?? 0, stdout, stderr }),
      );
      child.stdin.end('stdin\n');
    });
    assert.equal(result.code, 7, result.stderr);
    const [metadata, input] = result.stdout.trimEnd().split('\n');
    assert.deepEqual(JSON.parse(metadata), {
      args,
      cwd: await realpath(f.root),
      home: await realpath(f.home),
    });
    assert.equal(input, 'stdin');
    assert.equal(result.stderr, 'CHILD-STDERR\n');
    const names = await readdir(join(f.state, 'launches'));
    assert.equal(names.length, 1);
    const record = JSON.parse(
      await readFile(join(f.state, 'launches', names[0]), 'utf8'),
    );
    assert.equal(record.profileId, f.profiles[1].id);
    assert.equal(record.bindingId, f.profiles[1].bindingId);
    assert.equal(record.projectPath, await realpath(f.root));
    assert.equal(record.status, 'prepared');
    assert.doesNotMatch(
      JSON.stringify(record),
      /SYNTHETIC-ACCESS|SYNTHETIC-NEWEST|account_id|id_token|refresh_token/,
    );
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      syntheticAuth('B', 'SYNTHETIC-NEWEST'),
    );
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[1].bindingId + '.json'),
        'utf8',
      ),
      syntheticAuth('B', 'SYNTHETIC-NEWEST'),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('a prepared launch refuses a changed entrypoint before child execution', async () => {
  const f = await activationFixture();
  let lease;
  try {
    const { activateIdentity } = await import(modulePath('activation.js'));
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
    });
    await lease.prepareLaunch('tracked');
    await writeFile(f.options.command.prefix[0], '// replaced entrypoint\n');
    await assert.rejects(lease.revalidateBeforeLaunch(), /LAUNCH_PATH_CHANGED/);
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('a zero child exit is preserved when post-exit refresh cannot be assigned safely', async () => {
  const f = await activationFixture();
  try {
    const script = f.options.command.prefix[0];
    const policy = (await readFile(script, 'utf8')).replace(
      "import readline from 'node:readline';",
      "const {default:readline}=await import('node:readline');",
    );
    await writeFile(
      script,
      `if(process.argv.includes('app-server')){${policy}}else{
      const {writeFileSync}=await import('node:fs');const {join}=await import('node:path');
      writeFileSync(join(process.env.CODEX_HOME,'auth.json'),${JSON.stringify(syntheticAuth('A', 'SYNTHETIC-WRONG-REFRESH'))});
    }`,
    );
    const result = await new Promise((resolve) => {
      const child = execFile(
        process.execPath,
        [
          cli,
          'run',
          '--identity',
          f.profiles[1].id,
          '--target',
          'local',
          '--state-home',
          f.state,
          '--codex-home',
          f.home,
          '--codex-executable',
          f.options.command.executable,
          '--codex-script',
          script,
          '--project',
          f.root,
          '--json',
        ],
        { encoding: 'utf8', timeout: 180000 },
        (error, stdout, stderr) =>
          resolve({ code: error?.code ?? 0, stdout, stderr }),
      );
      child.stdin.end();
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '');
    const diagnostic = JSON.parse(result.stderr);
    assert.equal(diagnostic.ok, false);
    assert.equal(diagnostic.code, 'TARGET_BINDING_MISMATCH');
    assert.equal(
      await readFile(join(f.home, 'auth.json'), 'utf8'),
      syntheticAuth('A', 'SYNTHETIC-WRONG-REFRESH'),
    );
    assert.equal(
      await readFile(
        join(f.state, 'credentials', f.profiles[1].bindingId + '.json'),
        'utf8',
      ),
      syntheticAuth('B', 'SYNTHETIC-B'),
    );
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('effective credential-storage overrides block activation before user execution', async () => {
  const f = await activationFixture();
  try {
    const script = f.options.command.prefix[0];
    const policy = (await readFile(script, 'utf8'))
      .replace(
        "import readline from 'node:readline';",
        "const {default:readline}=await import('node:readline');",
      )
      .replace(
        "cli_auth_credentials_store:'file'",
        "cli_auth_credentials_store:process.argv.includes('cli_auth_credentials_store=\"keyring\"')?'keyring':'file'",
      );
    await writeFile(
      script,
      `if(process.argv.includes('app-server')){${policy}}else{process.stdout.write('UNSAFE-EXECUTION');}`,
    );
    const result = await new Promise((resolve) => {
      const child = execFile(
        process.execPath,
        [
          cli,
          'run',
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
          script,
          '--project',
          f.root,
          '--json',
          '--',
          '-c',
          'cli_auth_credentials_store="keyring"',
        ],
        { encoding: 'utf8', timeout: 180000 },
        (error, stdout, stderr) =>
          resolve({ code: error?.code ?? 0, stdout, stderr }),
      );
      child.stdin.end();
    });
    assert.equal(result.code, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).code, 'FILE_STORAGE_REQUIRED');
    await assert.rejects(readFile(join(f.home, 'auth.json')), {
      code: 'ENOENT',
    });
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('the CLI launches explicit and last resume with a scoped UUID and unchanged trailing arguments', async () => {
  const f = await activationFixture();
  try {
    const id = '00000000-0000-4000-8000-000000000013';
    await mkdir(join(f.home, 'sessions', '2026', '10', '04'), {
      recursive: true,
    });
    await writeFile(
      join(
        f.home,
        'sessions',
        '2026',
        '10',
        '04',
        `rollout-2026-10-04T00-00-00-${id}.jsonl`,
      ),
      JSON.stringify({
        type: 'session_meta',
        payload: { id, cwd: f.root, timestamp: '2026-10-04T00:00:00.000Z' },
      }) + '\n',
    );
    const script = f.options.command.prefix[0];
    const policy = (await readFile(script, 'utf8')).replace(
      "import readline from 'node:readline';",
      "const {default:readline}=await import('node:readline');",
    );
    await writeFile(
      script,
      `if(process.argv.includes('app-server')){${policy}}else{console.log(JSON.stringify(process.argv.slice(2)));}`,
    );
    for (const selection of [[id], ['--last']]) {
      const untracked = selection[0] === '--last';
      const trailing = [
        '--config',
        'model="safe"',
        'synthetic prompt ;&$ Unicode 日本語',
      ];
      const result = await new Promise((resolve) => {
        const child = execFile(
          process.execPath,
          [
            cli,
            'resume',
            ...selection,
            ...(untracked ? ['--untracked', '--json'] : []),
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
            script,
            '--project',
            f.root,
            '--',
            ...trailing,
          ],
          { encoding: 'utf8', timeout: 180000 },
          (error, stdout, stderr) =>
            resolve({ code: error?.code ?? 0, stdout, stderr }),
        );
        child.stdin.end();
      });
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), ['resume', id, ...trailing]);
      if (untracked) {
        assert.equal(JSON.parse(result.stderr).code, 'UNTRACKED_LAUNCH');
        const target = await readdir(join(f.home, '.tandem-activation'));
        const launches = target.filter((name) => name.startsWith('launch-'));
        assert.equal(launches.length, 1);
        assert.equal(
          JSON.parse(
            await readFile(
              join(f.home, '.tandem-activation', launches[0]),
              'utf8',
            ),
          ).mode,
          'untracked',
        );
      } else assert.equal(result.stderr, '');
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test(
  'an unregistered surviving child keeps the scope blocked after a zero foreground exit',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await activationFixture();
    let survivor;
    const { processIdentity } = await import(modulePath('processes.js'));
    try {
      const script = f.options.command.prefix[0];
      const policy = (await readFile(script, 'utf8')).replace(
        "import readline from 'node:readline';",
        "const {default:readline}=await import('node:readline');",
      );
      await writeFile(
        script,
        `if(process.argv.includes('--synthetic-server')){
      process.send({pid:process.pid});setInterval(()=>{},1000);
    }else if(process.argv.includes('app-server')){${policy}}else{
      const {spawn}=await import('node:child_process');
      const server=spawn(process.execPath,[${JSON.stringify(script)},'--synthetic-server','app-server'],{env:process.env,stdio:['ignore','ignore','ignore','ipc']});
      await new Promise(resolve=>server.once('message',message=>{console.log(message.pid);resolve();}));
      server.disconnect();server.unref();
    }`,
      );
      const result = await new Promise((resolve) => {
        const child = execFile(
          process.execPath,
          [
            cli,
            'run',
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
            script,
            '--project',
            f.root,
            '--json',
          ],
          { encoding: 'utf8', timeout: 180000 },
          (error, stdout, stderr) =>
            resolve({ code: error?.code ?? 0, stdout, stderr }),
        );
        child.stdin.end();
      });
      const pid = Number(result.stdout.trim());
      assert.ok(Number.isSafeInteger(pid) && pid > 1);
      survivor = await processIdentity(pid);
      assert.ok(survivor);
      assert.equal(result.code, 0, result.stderr);
      const diagnostics = result.stderr
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      assert.ok(diagnostics.every((message) => message.ok === false));
      assert.ok(
        diagnostics.some((message) => message.code === 'LEASE_RETAINED'),
      );
      const { activateIdentity } = await import(modulePath('activation.js'));
      await assert.rejects(
        activateIdentity({ ...f.options, profileId: f.profiles[1].id }),
      );
      assert.deepEqual(await processIdentity(pid), survivor);
    } finally {
      if (survivor) {
        assert.deepEqual(
          await processIdentity(survivor.pid),
          survivor,
          'cleanup only owns the unchanged synthetic server',
        );
        process.kill(survivor.pid, 'SIGTERM');
        for (let i = 0; i < 100 && (await processIdentity(survivor.pid)); i++)
          await new Promise((resolve) => setTimeout(resolve, 20));
        assert.equal(await processIdentity(survivor.pid), null);
      }
      await rm(f.root, { recursive: true, force: true });
    }
  },
);

test('production non-TTY launch requires identity and target without touching state', () => {
  const missingIdentity = invoke(['run', '--target', 'local', '--json']);
  assert.equal(missingIdentity.status, 2);
  assert.equal(JSON.parse(missingIdentity.stderr).code, 'IDENTITY_REQUIRED');
  assert.equal(missingIdentity.stdout, '');
  const missingTarget = invoke(['run', '--identity', 'saved-id', '--json']);
  assert.equal(missingTarget.status, 2);
  assert.equal(JSON.parse(missingTarget.stderr).code, 'TARGET_REQUIRED');
});

test('named Codex profiles fail with an explicit capability diagnostic before private state or activation', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct13-profile-refusal-'));
  try {
    const state = join(root, 'absent-state');
    const args = [
      'run',
      '--identity',
      'saved-id',
      '--target',
      'local',
      '--state-home',
      state,
      '--project',
      root,
      '--codex-executable',
      join(root, 'missing-codex'),
      '--json',
      '--',
    ];
    for (const profile of [
      ['--profile', 'named'],
      ['-p', 'named'],
      ['-pnamed'],
      ['--profile=named'],
    ]) {
      const result = invoke([...args, ...profile]);
      assert.equal(result.status, 2);
      assert.equal(
        JSON.parse(result.stderr).code,
        'PROFILE_POLICY_UNVERIFIABLE',
      );
      assert.equal(result.stdout, '');
    }
    const valueOnly = invoke([...args, '--config', '--profile']);
    assert.notEqual(
      JSON.parse(valueOnly.stderr).code,
      'PROFILE_POLICY_UNVERIFIABLE',
    );
    const modelValue = invoke([...args, '--model', 'resume']);
    assert.notEqual(
      JSON.parse(modelValue.stderr).code,
      'RESUME_SCOPE_UNPROVEN',
    );
    await assert.rejects(readdir(state), { code: 'ENOENT' });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  'POSIX signal forwarding preserves the child signal exit and releases an idle scope',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await activationFixture();
    let launcher;
    try {
      const script = f.options.command.prefix[0];
      const policy = (await readFile(script, 'utf8')).replace(
        "import readline from 'node:readline';",
        "const {default:readline}=await import('node:readline');",
      );
      await writeFile(
        script,
        `if(process.argv.includes('app-server')){${policy}}else{console.log('READY');setInterval(()=>{},1000);}`,
      );
      launcher = spawn(
        process.execPath,
        [
          cli,
          'run',
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
          script,
          '--project',
          f.root,
          '--json',
        ],
        { stdio: ['pipe', 'pipe', 'pipe'] },
      );
      let stderr = '';
      launcher.stderr.on('data', (bytes) => {
        stderr += bytes;
      });
      const closed = new Promise((resolve, reject) => {
        launcher.once('close', (code, signal) => resolve({ code, signal }));
        launcher.once('error', reject);
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('synthetic child did not start')),
          10000,
        );
        launcher.stdout.once('data', (bytes) => {
          clearTimeout(timer);
          assert.equal(bytes.toString(), 'READY\n');
          resolve();
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      launcher.kill('SIGTERM');
      assert.deepEqual(await closed, { code: 143, signal: null });
      assert.equal(stderr, '');
      const { activateIdentity } = await import(modulePath('activation.js'));
      const lease = await activateIdentity({
        ...f.options,
        profileId: f.profiles[0].id,
      });
      await lease.release();
      assert.equal(
        await readFile(join(f.home, 'auth.json'), 'utf8'),
        syntheticAuth('A', 'SYNTHETIC-A'),
      );
    } finally {
      if (
        launcher &&
        launcher.exitCode === null &&
        launcher.signalCode === null
      )
        launcher.kill('SIGTERM');
      await rm(f.root, { recursive: true, force: true });
    }
  },
);

test('top-level resume requires an explicit session or opt-in last and rejects unproved raw last lookup', () => {
  const result = invoke([
    'resume',
    '--identity',
    'saved-id',
    '--target',
    'local',
    '--json',
  ]);
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).code, 'RESUME_SELECTION_REQUIRED');
  const raw = invoke([
    'run',
    '--identity',
    'saved-id',
    '--target',
    'local',
    '--json',
    '--',
    'resume',
    '--last',
  ]);
  assert.equal(raw.status, 2);
  assert.equal(JSON.parse(raw.stderr).code, 'RESUME_SCOPE_UNPROVEN');
});

test('valid resume prompt tokens preserve exact argv in both resume grammars', async () => {
  const f = await activationFixture();
  try {
    const id = '00000000-0000-4000-8000-000000000014';
    await mkdir(join(f.home, 'sessions'), { recursive: true });
    await writeFile(
      join(f.home, 'sessions', `rollout-2026-10-04T00-00-00-${id}.jsonl`),
      JSON.stringify({
        type: 'session_meta',
        payload: { id, cwd: f.root, timestamp: '2026-10-04T00:00:00.000Z' },
      }) + '\n',
    );
    const script = f.options.command.prefix[0];
    const policy = (await readFile(script, 'utf8')).replace(
      "import readline from 'node:readline';",
      "const {default:readline}=await import('node:readline');",
    );
    await writeFile(
      script,
      `if(process.argv.includes('app-server')){${policy}}else{console.log(JSON.stringify(process.argv.slice(2)));}`,
    );
    for (const [operation, selection, trailing, expected] of [
      ['resume', [id], ['resume'], ['resume', id, 'resume']],
      [
        'run',
        [],
        ['exec', 'resume', id, 'resume'],
        ['exec', 'resume', id, 'resume'],
      ],
    ]) {
      const result = await new Promise((done) => {
        const child = execFile(
          process.execPath,
          [
            cli,
            operation,
            ...selection,
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
            script,
            '--project',
            f.root,
            '--json',
            '--',
            ...trailing,
          ],
          { encoding: 'utf8', timeout: 180000 },
          (error, stdout, stderr) =>
            done({ code: error?.code ?? 0, stdout, stderr }),
        );
        child.stdin.end();
      });
      assert.equal(result.code, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), expected);
      assert.equal(result.stderr, '');
    }
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('retargeting a raw invocation directory during policy inspection refuses child execution', async () => {
  const f = await activationFixture();
  try {
    const a = join(f.root, 'project-a'),
      b = join(f.root, 'project-b'),
      alias = join(f.root, 'project-alias'),
      marker = join(f.root, 'changed');
    await mkdir(a);
    await mkdir(b);
    await symlink(a, alias, process.platform === 'win32' ? 'junction' : 'dir');
    const script = f.options.command.prefix[0];
    const policy = (await readFile(script, 'utf8')).replace(
      "import readline from 'node:readline';",
      "const {default:readline}=await import('node:readline');",
    );
    await writeFile(
      script,
      `if(process.argv.includes('app-server')){const fs=await import('node:fs');if(!fs.existsSync(${JSON.stringify(marker)})){fs.rmSync(${JSON.stringify(alias)},{recursive:true});fs.symlinkSync(${JSON.stringify(b)},${JSON.stringify(alias)},${JSON.stringify(process.platform === 'win32' ? 'junction' : 'dir')});fs.writeFileSync(${JSON.stringify(marker)},'changed');}${policy}}else{console.log('UNSAFE-EXECUTION');}`,
    );
    const result = await new Promise((done) => {
      const child = execFile(
        process.execPath,
        [
          cli,
          'run',
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
          script,
          '--json',
          '--',
          '-C',
          alias,
        ],
        { cwd: f.root, encoding: 'utf8', timeout: 180000 },
        (error, stdout, stderr) =>
          done({ code: error?.code ?? 0, stdout, stderr }),
      );
      child.stdin.end();
    });
    assert.equal(
      await realpath(alias),
      await realpath(b),
      'the actual alias was retargeted at the policy boundary',
    );
    assert.equal(result.code, 2, result.stderr);
    assert.equal(result.stdout, '');
    assert.equal(JSON.parse(result.stderr).code, 'LAUNCH_PATH_CHANGED');
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test(
  'replacing the actual spawn cwd with a relative directory refuses child execution',
  { skip: process.platform === 'win32' },
  async () => {
    const f = await activationFixture();
    try {
      const initial = join(f.root, 'initial-cwd'),
        moved = join(f.root, 'original-cwd'),
        project = join(f.root, 'project-a'),
        marker = join(f.root, 'changed');
      await mkdir(initial);
      await mkdir(project);
      await symlink(project, join(initial, 'project'), 'dir');
      const script = f.options.command.prefix[0];
      const policy = (await readFile(script, 'utf8')).replace(
        "import readline from 'node:readline';",
        "const {default:readline}=await import('node:readline');",
      );
      await writeFile(
        script,
        `if(process.argv.includes('app-server')){const fs=await import('node:fs');if(!fs.existsSync(${JSON.stringify(marker)})){fs.renameSync(${JSON.stringify(initial)},${JSON.stringify(moved)});fs.mkdirSync(${JSON.stringify(initial)});fs.mkdirSync(${JSON.stringify(join(initial, 'project'))});fs.writeFileSync(${JSON.stringify(marker)},'changed');}${policy}}else{console.log('UNSAFE-EXECUTION');}`,
      );
      const before = await stat(initial, { bigint: true });
      const result = await new Promise((done) => {
        const child = execFile(
          process.execPath,
          [
            cli,
            'run',
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
            script,
            '--json',
            '--',
            '-C',
            'project',
          ],
          { cwd: initial, encoding: 'utf8', timeout: 180000 },
          (error, stdout, stderr) =>
            done({ code: error?.code ?? 0, stdout, stderr }),
        );
        child.stdin.end();
      });
      assert.notEqual(
        (await stat(initial, { bigint: true })).ino,
        before.ino,
        'the actual spawn cwd generation was replaced',
      );
      assert.equal(result.code, 2, result.stderr);
      assert.equal(result.stdout, '');
      assert.equal(JSON.parse(result.stderr).code, 'LAUNCH_PATH_CHANGED');
    } finally {
      await rm(f.root, { recursive: true, force: true });
    }
  },
);

test('resume filesystem boundary errors are redacted for missing and inaccessible inputs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'ct13-resume-errors-'));
  const home = join(root, 'home'),
    project = join(root, 'project');
  const { resolveLocalResume } = await import(modulePath('resume.js'));
  const id = '00000000-0000-4000-8000-000000000015';
  const redacted = (code) => (error) => {
    assert.equal(error.message, code);
    assert.equal(error.cause, undefined);
    assert.equal(error.path, undefined);
    assert.ok(!error.stack.includes(root));
    return true;
  };
  try {
    await mkdir(home);
    await mkdir(project);
    await assert.rejects(
      resolveLocalResume(home, join(root, 'missing-private-project'), id),
      redacted('RESUME_PROJECT_UNAVAILABLE'),
    );
    await assert.rejects(
      resolveLocalResume(join(root, 'missing-private-home'), project, id),
      redacted('RESUME_SOURCE_UNAVAILABLE'),
    );
    if (process.platform !== 'win32') {
      await chmod(project, 0o000);
      try {
        await assert.rejects(
          resolveLocalResume(home, join(project, 'inaccessible'), id),
          redacted('RESUME_PROJECT_UNAVAILABLE'),
        );
      } finally {
        await chmod(project, 0o700);
      }
      await mkdir(join(home, 'sessions'));
      await chmod(join(home, 'sessions'), 0o000);
      try {
        await assert.rejects(
          resolveLocalResume(home, project, id),
          redacted('RESUME_SOURCE_UNAVAILABLE'),
        );
      } finally {
        await chmod(join(home, 'sessions'), 0o700);
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('an invocation entrypoint changed during policy inspection is refused', async () => {
  const f = await activationFixture();
  let lease;
  try {
    const script = f.options.command.prefix[0];
    const policy = await readFile(script, 'utf8');
    await writeFile(
      script,
      `const {writeFileSync}=await import('node:fs');writeFileSync(${JSON.stringify(script)},${JSON.stringify('// replaced during policy inspection\n')});${policy}`,
    );
    const { activateIdentity } = await import(modulePath('activation.js'));
    lease = await activateIdentity({
      ...f.options,
      profileId: f.profiles[0].id,
    });
    assert.equal(
      await readFile(script, 'utf8'),
      '// replaced during policy inspection\n',
    );
    await lease.prepareLaunch('tracked');
    await assert.rejects(lease.revalidateBeforeLaunch(), /LAUNCH_PATH_CHANGED/);
  } finally {
    await lease?.release();
    await rm(f.root, { recursive: true, force: true });
  }
});
