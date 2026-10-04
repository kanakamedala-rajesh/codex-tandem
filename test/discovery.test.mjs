import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import { discoverTarget } from '../dist/discovery.js';

test('local discovery resolves explicit contained project and executable without creating Codex home', async () => {
  const root = await mkdtemp(join(tmpdir(), 'tandem-discovery-'));
  try {
    await mkdir(join(root, 'project with spaces'));
    const result = await discoverTarget({
      target: 'local',
      projectRoot: root,
      project: join(root, 'project with spaces'),
      codexHome: join(root, 'absent'),
      codexExecutable: process.execPath,
    });
    assert.equal(result.ok, true);
    assert.equal(result.paths.project, join(root, 'project with spaces'));
    assert.equal(result.paths.codexHomeExists, false);
    assert.equal(result.fullTracking, false);
    assert.equal(result.trust, 'unverified');
    assert.equal(result.bridge.durableCapture, 'unverified');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('stopped Docker target is diagnosed without exec or restart', async () => {
  const commands = [];
  const result = await discoverTarget(
    { target: 'docker', container: 'alias', dockerContext: 'test' },
    async (args) => {
      commands.push(args);
      if (args[0] === 'context')
        return JSON.stringify('unix:///var/run/docker.sock');
      if (args.includes('info')) return JSON.stringify('daemon-fixture');
      return JSON.stringify({
        id: 'a'.repeat(64),
        running: false,
        paused: false,
        status: 'exited',
      });
    },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, ['CONTAINER_STOPPED']);
  assert.equal(commands.length, 3);
  assert.equal(commands[2].includes('inspect'), true);
});

test('Docker aliases pin the generation and project paths without exposing environment', async () => {
  const commands = [];
  const result = await discoverTarget(
    {
      target: 'docker',
      container: 'alias',
      dockerContext: 'test',
      projectRoot: '/work',
      project: '/work/project',
    },
    async (args) => {
      commands.push(args);
      if (args[0] === 'context')
        return JSON.stringify('unix:///var/run/docker.sock');
      if (args.includes('info')) return JSON.stringify('daemon-fixture');
      if (args.includes('inspect'))
        return JSON.stringify({
          id: 'a'.repeat(64),
          running: true,
          paused: false,
          status: 'running',
        });
      if (args.at(-1) === 'command -v python3 || command -v python')
        return '/usr/bin/python3\n';
      return JSON.stringify({
        user: 'worker',
        paths: {
          home: '/home/worker',
          codexHome: '/home/worker/.codex',
          codexHomeExists: false,
          projectRoot: '/work',
          project: '/work/project',
          executable: '/usr/bin/codex',
        },
        jsonProjection: true,
        durableFacility: true,
        permissions: { projectReadable: true, codexHomeWritable: true },
      });
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.generation, 'a'.repeat(64));
  assert.equal(result.paths.project, '/work/project');
  assert.equal(
    result.credentialScope,
    'docker:daemon-fixture:' + 'a'.repeat(64) + ':/home/worker/.codex',
  );
  assert.equal(result.bridge.jsonProjection, 'verified');
  assert.equal(result.bridge.durableCapture, 'facility-present-unverified');
  assert.equal(commands.filter((a) => a.includes('--type')).length, 2);
  assert.ok(
    commands
      .filter((a) => a.includes('exec'))
      .every((a) => a.includes('a'.repeat(64))),
  );
});

test('local Codex home must not be an existing regular file', async () => {
  const result = await discoverTarget({
    target: 'local',
    codexHome: process.execPath,
    codexExecutable: process.execPath,
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, ['CODEX_HOME_NOT_DIRECTORY']);
});

test('remote Docker context is rejected before contacting a daemon', async () => {
  const calls = [];
  const report = await discoverTarget(
    { target: 'docker', container: 'alias', dockerContext: 'remote' },
    async (args) => {
      calls.push(args);
      return JSON.stringify('ssh://example.invalid');
    },
  );
  assert.deepEqual(report.diagnostics, ['REMOTE_DOCKER_UNSUPPORTED']);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes('context'));
});

test('doctor exposes local discovery through the CLI without modifying the target', async () => {
  const { spawnSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const run = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL('../dist/cli.js', import.meta.url)),
      'doctor',
      '--target',
      'local',
      '--codex-executable',
      process.execPath,
      '--json',
    ],
    { encoding: 'utf8' },
  );
  assert.equal(run.status, 0, run.stdout + run.stderr);
  assert.equal(JSON.parse(run.stdout).targetDiscovery.fullTracking, false);
});

for (const [label, overrides, expected] of [
  ['paused', { paused: true }, 'CONTAINER_PAUSED'],
  ['replaced', { id: 'b'.repeat(64) }, 'CONTAINER_REPLACED_REVALIDATE'],
  ['inaccessible', null, 'DOCKER_CONTEXT_OR_CONTAINER_INACCESSIBLE'],
])
  test(`Docker ${label} discovery does not exec`, async () => {
    const report = await discoverTarget(
      {
        target: 'docker',
        dockerContext: 'test',
        container: 'alias',
        expectedGeneration: 'a'.repeat(64),
      },
      async (args) => {
        assert.equal(args.includes('exec'), false);
        if (args[0] === 'context')
          return JSON.stringify('unix:///var/run/docker.sock');
        if (args.includes('info')) return JSON.stringify('daemon-fixture');
        if (!overrides) throw new Error('synthetic secret must never appear');
        return JSON.stringify({
          id: 'a'.repeat(64),
          running: true,
          paused: false,
          ...overrides,
        });
      },
    );
    assert.deepEqual(report.diagnostics, [expected]);
    assert.doesNotMatch(JSON.stringify(report), /synthetic secret/);
  });

test('project traversal and physical symlink escape are rejected', async () => {
  const { symlink } = await import('node:fs/promises');
  const root = await mkdtemp(join(tmpdir(), 'tandem-containment-'));
  try {
    await mkdir(join(root, 'allowed'));
    await mkdir(join(root, 'outside'));
    await symlink(
      join(root, 'outside'),
      join(root, 'allowed', 'alias'),
      'junction',
    );
    for (const project of [
      join(root, 'allowed', '..', 'outside'),
      join(root, 'allowed', 'alias'),
    ]) {
      const result = await discoverTarget({
        target: 'local',
        projectRoot: join(root, 'allowed'),
        project,
        codexExecutable: process.execPath,
      });
      assert.deepEqual(result.diagnostics, ['PROJECT_OUTSIDE_REGISTERED_ROOT']);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('missing bridge reports unavailable without installing a runtime', async () => {
  const result = await discoverTarget(
    { target: 'docker', dockerContext: 'test', container: 'alias' },
    async (args) => {
      if (args[0] === 'context')
        return JSON.stringify('unix:///var/run/docker.sock');
      if (args.includes('info')) return JSON.stringify('daemon-fixture');
      if (args.includes('inspect'))
        return JSON.stringify({
          id: 'a'.repeat(64),
          running: true,
          paused: false,
        });
      assert.equal(args.at(-1), 'command -v python3 || command -v python');
      throw new Error('no interpreter');
    },
  );
  assert.equal(result.ok, false);
  assert.deepEqual(result.diagnostics, ['BRIDGE_UNAVAILABLE']);
});

test('Docker context aliases share physical credential scope and replacement races fail closed', async () => {
  let replacement = false;
  const run = async (args) => {
    if (args[0] === 'context')
      return JSON.stringify('unix:///var/run/docker.sock');
    if (args.includes('info')) return JSON.stringify('daemon-fixture');
    if (args.includes('inspect'))
      return JSON.stringify({
        id: (replacement ? 'b' : 'a').repeat(64),
        running: true,
        paused: false,
      });
    if (args.at(-1) === 'command -v python3 || command -v python')
      return '/usr/bin/python3';
    return JSON.stringify({
      user: 'worker',
      paths: {
        home: '/home/worker',
        codexHome: '/home/worker/.codex',
        codexHomeExists: true,
        projectRoot: '/work',
        project: '/work',
        executable: '/usr/bin/codex',
      },
      jsonProjection: true,
      durableFacility: true,
      permissions: { projectReadable: true, codexHomeWritable: true },
    });
  };
  const first = await discoverTarget(
    { target: 'docker', dockerContext: 'one', container: 'alias' },
    run,
  );
  const alias = await discoverTarget(
    { target: 'docker', dockerContext: 'two', container: 'other-alias' },
    run,
  );
  assert.equal(first.credentialScope, alias.credentialScope);
  const raced = await discoverTarget(
    { target: 'docker', dockerContext: 'one', container: 'alias' },
    async (args) => {
      const value = await run(args);
      if (args.includes('-c') && args.includes('/usr/bin/python3'))
        replacement = true;
      return value;
    },
  );
  assert.equal(raced.ok, false);
  assert.deepEqual(raced.diagnostics, ['CONTAINER_CHANGED_DURING_DISCOVERY']);
  assert.equal(raced.paths, undefined);
});

test(
  'Linux mount boundaries under an explicit root are rejected even on the same device',
  { skip: process.platform !== 'linux' },
  async (t) => {
    const { stat, readFile } = await import('node:fs/promises');
    if (
      !(await readFile('/proc/self/mountinfo', 'utf8'))
        .split('\n')
        .some((line) => line.split(' ')[4] === '/proc/sys')
    ) {
      t.skip(
        'Existing /proc/sys bind mount unavailable; exercised in Docker qualification',
      );
      return;
    }
    assert.equal((await stat('/proc')).dev, (await stat('/proc/sys')).dev);
    const result = await discoverTarget({
      target: 'local',
      projectRoot: '/proc',
      project: '/proc/sys',
      codexExecutable: process.execPath,
    });
    assert.deepEqual(result.diagnostics, [
      'PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT',
    ]);
  },
);

test('Docker projection rejects unbounded scalar metadata and excludes unknown payload fields', async () => {
  const projection = {
    user: 'worker',
    paths: {
      home: '/home/worker',
      codexHome: '/home/worker/.codex',
      codexHomeExists: true,
      projectRoot: '/work',
      project: '/work',
      executable: '/usr/bin/codex',
      rawPrompt: 'secret-prompt',
    },
    jsonProjection: true,
    durableFacility: true,
    permissions: { projectReadable: true, codexHomeWritable: true },
    rawPrompt: 'secret-prompt',
  };
  const run = async (args) => {
    if (args[0] === 'context')
      return JSON.stringify('unix:///var/run/docker.sock');
    if (args.includes('info')) return JSON.stringify('daemon-fixture');
    if (args.includes('inspect'))
      return JSON.stringify({
        id: 'a'.repeat(64),
        running: true,
        paused: false,
      });
    if (args.at(-1) === 'command -v python3 || command -v python')
      return '/usr/bin/python3';
    return JSON.stringify(projection);
  };
  const options = {
    target: 'docker',
    container: 'alias',
    dockerContext: 'test',
  };
  const report = await discoverTarget(options, run);
  assert.equal(report.ok, true);
  assert.doesNotMatch(JSON.stringify(report), /rawPrompt|secret-prompt/);
  for (const user of ['worker\nsecret', 'x'.repeat(257)]) {
    projection.user = user;
    assert.deepEqual((await discoverTarget(options, run)).diagnostics, [
      'TARGET_PROJECTION_INVALID',
    ]);
  }
});

test(
  'Windows resolves the npm command shim before its adjacent POSIX script',
  { skip: process.platform !== 'win32' },
  async () => {
    const { writeFile } = await import('node:fs/promises');
    const root = await mkdtemp(join(tmpdir(), 'tandem-win-executable-'));
    const oldPath = process.env.PATH,
      oldExt = process.env.PATHEXT;
    try {
      await writeFile(
        join(root, 'codex'),
        'untrusted POSIX fixture, never execute',
      );
      await writeFile(
        join(root, 'codex.cmd'),
        'untrusted command fixture, never execute',
      );
      await writeFile(join(root, 'unsupported.txt'), 'not executable');
      process.env.PATH = root;
      process.env.PATHEXT = '.EXE;.CMD';
      const report = await discoverTarget({
        target: 'local',
        projectRoot: root,
      });
      assert.equal(report.ok, true);
      assert.equal(
        report.paths.executable.toLowerCase(),
        join(root, 'codex.cmd').toLowerCase(),
      );
      const invalid = await discoverTarget({
        target: 'local',
        projectRoot: root,
        codexExecutable: join(root, 'unsupported.txt'),
      });
      assert.deepEqual(invalid.diagnostics, ['EXECUTABLE_UNAVAILABLE']);
    } finally {
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      if (oldExt === undefined) delete process.env.PATHEXT;
      else process.env.PATHEXT = oldExt;
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  'Python discovery ignores project imports, PYTHONPATH, user site, and startup hooks',
  { skip: process.platform !== 'linux' },
  async () => {
    const { writeFile, readFile } = await import('node:fs/promises');
    const { execFileSync } = await import('node:child_process');
    const root = await mkdtemp(join(tmpdir(), 'tandem-python-isolation-'));
    const sentinel = join(root, 'sentinel');
    const poison = `open(${JSON.stringify(sentinel)},'w').write('executed')\n`;
    try {
      await writeFile(sentinel, 'untouched');
      await writeFile(
        join(root, 'json.py'),
        poison + "raise RuntimeError('project json imported')\n",
      );
      await writeFile(join(root, 'sitecustomize.py'), poison);
      const version = execFileSync(
        '/usr/bin/python3',
        [
          '-E',
          '-s',
          '-S',
          '-B',
          '-c',
          'import sys; print("%d.%d" % sys.version_info[:2])',
        ],
        { encoding: 'utf8' },
      ).trim();
      const userSite = join(root, 'lib', 'python' + version, 'site-packages');
      await mkdir(userSite, { recursive: true });
      await writeFile(
        join(userSite, 'fixture.pth'),
        `import builtins; builtins.open(${JSON.stringify(sentinel)},'w').write('executed')\n`,
      );
      const run = async (args, home = userInfo().homedir) => {
        if (args[0] === 'context')
          return JSON.stringify('unix:///var/run/docker.sock');
        if (args.includes('info')) return JSON.stringify('daemon-fixture');
        if (args.includes('inspect'))
          return JSON.stringify({
            id: 'a'.repeat(64),
            running: true,
            paused: false,
          });
        if (args.at(-1) === 'command -v python3 || command -v python')
          return '/usr/bin/python3';
        return execFileSync(
          '/usr/bin/python3',
          args.slice(args.indexOf('/usr/bin/python3') + 1),
          {
            cwd: root,
            env: {
              ...process.env,
              HOME: home,
              PYTHONPATH: root,
              PYTHONUSERBASE: root,
            },
            encoding: 'utf8',
          },
        );
      };
      const options = {
        target: 'docker',
        container: 'alias',
        dockerContext: 'test',
        projectRoot: root,
        codexExecutable: '/usr/bin/python3',
      };
      const report = await discoverTarget(options, run);
      assert.equal(await readFile(sentinel, 'utf8'), 'untouched');
      assert.equal(report.ok, true, JSON.stringify(report));
      const mismatchedHome = await discoverTarget(options, (args) =>
        run(args, root),
      );
      assert.equal(mismatchedHome.ok, false);
      assert.deepEqual(mismatchedHome.diagnostics, ['HOME_USER_MISMATCH']);
      assert.equal(await readFile(sentinel, 'utf8'), 'untouched');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test('a pinned Docker daemon refuses a wrong context before container inspection', async () => {
  const report = await discoverTarget(
    {
      target: 'docker',
      container: 'alias',
      dockerContext: 'test',
      expectedDaemonId: 'approved-daemon',
    },
    async (args) => {
      if (args[0] === 'context')
        return JSON.stringify('unix:///var/run/docker.sock');
      if (args.includes('info')) return JSON.stringify('other-daemon');
      throw new Error(
        'container inspection must not occur on the wrong daemon',
      );
    },
  );
  assert.equal(report.ok, false);
  assert.deepEqual(report.diagnostics, ['DOCKER_DAEMON_CHANGED_REVALIDATE']);
  assert.equal(report.paths, undefined);
});

const ct14DockerFixture = async (args) => {
  if (args[0] === 'context')
    return JSON.stringify('unix:///var/run/docker.sock');
  if (args.includes('info')) return JSON.stringify('approved-daemon');
  if (args.includes('inspect'))
    return JSON.stringify({ id: 'a'.repeat(64), running: true, paused: false });
  if (args.at(-1) === 'command -v python3 || command -v python')
    return '/usr/bin/python3';
  return JSON.stringify({
    user: 'worker',
    paths: {
      home: '/home/worker',
      codexHome: '/home/worker/.codex',
      codexHomeExists: true,
      projectRoot: '/work',
      project: '/work/project',
      executable: '/usr/bin/codex',
    },
    jsonProjection: true,
    durableFacility: true,
    permissions: { projectReadable: true, codexHomeWritable: true },
  });
};

test('a daemon replaced during Docker path discovery cannot publish usable target paths', async () => {
  let reads = 0;
  const report = await discoverTarget(
    {
      target: 'docker',
      container: 'alias',
      dockerContext: 'test',
      expectedDaemonId: 'approved-daemon',
    },
    async (args) => {
      if (args.includes('info') && ++reads > 1)
        return JSON.stringify('other-daemon');
      return ct14DockerFixture(args);
    },
  );
  assert.equal(report.ok, false);
  assert.deepEqual(report.diagnostics, [
    'DOCKER_DAEMON_CHANGED_DURING_DISCOVERY',
  ]);
  assert.equal(report.paths, undefined);
  assert.equal(report.credentialScope, undefined);
});

test('Docker projection cannot admit an outside-root or noncanonical project', async () => {
  for (const project of [
    '/outside',
    '/workbench',
    '/work/../outside',
    '/work//project',
  ]) {
    const report = await discoverTarget(
      {
        target: 'docker',
        container: 'alias',
        dockerContext: 'test',
        projectRoot: '/work',
      },
      async (args) => {
        const raw = await ct14DockerFixture(args);
        if (!args.includes('/usr/bin/python3')) return raw;
        const data = JSON.parse(raw);
        data.paths.project = project;
        return JSON.stringify(data);
      },
    );
    assert.equal(report.ok, false, project);
    assert.deepEqual(
      report.diagnostics,
      ['TARGET_PROJECTION_INVALID'],
      project,
    );
    assert.equal(report.paths, undefined);
  }
});

test('doctor discovery options consume the daemon pin and reject it for a local target', async () => {
  const { parseDiscoveryOptions } =
    await import('../dist/discovery-options.js');
  const options = parseDiscoveryOptions([
    '--target',
    'docker',
    '--container',
    'alias',
    '--expected-daemon',
    'approved-daemon',
    '--expected-generation',
    'a'.repeat(64),
    '--json',
  ]);
  assert.equal(options.expectedDaemonId, 'approved-daemon');
  assert.equal(options.expectedGeneration, 'a'.repeat(64));
  const report = await discoverTarget(options, ct14DockerFixture);
  assert.equal(report.ok, true);
  assert.equal(report.daemonId, 'approved-daemon');
  assert.throws(
    () =>
      parseDiscoveryOptions([
        '--target',
        'local',
        '--expected-daemon',
        'approved-daemon',
      ]),
    { message: 'INVALID_ARGUMENTS' },
  );
});
