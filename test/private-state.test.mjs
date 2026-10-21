import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { modulePath } from './fixtures/activation.mjs';

// Windows root changes and qualification are deferred; retain its existing default.
const posixTest = process.platform === 'win32' ? test.skip : test;

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'tandem-state-root-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const user = join(root, 'user');
  mkdirSync(user);
  const env = {
    ...process.env,
    HOME: user,
    USERPROFILE: user,
    XDG_STATE_HOME: '',
  };
  const cli = (args) =>
    spawnSync(
      process.execPath,
      [fileURLToPath(modulePath('cli.js')), ...args, '--json'],
      {
        encoding: 'utf8',
        timeout: 30000,
        env,
        cwd: root,
      },
    );
  const selected = (options = {}) =>
    spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const {resolveStateHome}=await import(${JSON.stringify(modulePath('private-state.js'))});try{console.log(JSON.stringify(await resolveStateHome(${JSON.stringify(options)})))}catch(error){console.error(error.message);process.exitCode=2;}`,
      ],
      { encoding: 'utf8', timeout: 30000, env, cwd: root },
    );
  const defaultRoot = join(user, '.local', 'state', 'codex-tandem');
  return { root, user, env, cli, selected, defaultRoot };
}

posixTest(
  'OS defaults and XDG selection resolve without creating state',
  (t) => {
    const f = fixture(t);
    assert.equal(JSON.parse(f.selected().stdout), f.defaultRoot);
    f.env.XDG_STATE_HOME = 'relative-state';
    assert.equal(JSON.parse(f.selected().stdout), f.defaultRoot);
    f.env.XDG_STATE_HOME = join(f.root, 'xdg');
    assert.equal(
      JSON.parse(f.selected().stdout),
      join(f.env.XDG_STATE_HOME, 'codex-tandem'),
    );
    assert.equal(existsSync(f.env.XDG_STATE_HOME), false);
    assert.equal(existsSync(f.defaultRoot), false);
  },
);

posixTest(
  'profile CLI uses the OS default and both explicit root spellings retain the same state',
  (t) => {
    const f = fixture(t);
    const initial = f.cli(['profiles', 'list']);
    assert.equal(initial.status, 0, initial.stderr);
    assert.equal(
      existsSync(
        join(f.defaultRoot, '.tandem-installation-owner', 'owner.json'),
      ),
      true,
    );
    const relative = 'explicit-state';
    const first = f.cli(['profiles', 'list', '--home', relative]);
    assert.equal(first.status, 0, first.stderr);
    const owner = join(
      f.root,
      relative,
      '.tandem-installation-owner',
      'owner.json',
    );
    const original = readFileSync(owner);
    const alias = f.cli(['profiles', 'list', '--state-home', relative]);
    assert.equal(alias.status, 0, alias.stderr);
    assert.equal(alias.stdout, first.stdout);
    assert.deepEqual(readFileSync(owner), original);
    assert.equal(
      JSON.parse(f.selected({ home: relative }).stdout),
      resolve(f.root, relative),
    );
  },
);

const commands = [
  ['profiles', 'list'],
  [
    'activate',
    '--identity',
    'profile_synthetic',
    '--codex-executable',
    process.execPath,
  ],
  [
    'activate',
    'recover',
    '--identity',
    'profile_synthetic',
    '--codex-executable',
    process.execPath,
  ],
  [
    'activate',
    'sync',
    '--identity',
    'profile_synthetic',
    '--codex-executable',
    process.execPath,
  ],
  ['guard', '--hold'],
  ['processes'],
  ['processes', 'stop'],
  ['processes', '--target', 'synthetic-target'],
  ['targets', 'list'],
  ['run', '--target', 'local', '--identity', 'profile_synthetic'],
  ['run', '--target', 'synthetic-target', '--identity', 'profile_synthetic'],
  ['resume', '--target', 'local', '--last', '--identity', 'profile_synthetic'],
];

posixTest(
  'every state CLI rejects simultaneous root spellings before creating either store',
  (t) => {
    const f = fixture(t);
    const first = join(f.root, 'first'),
      second = join(f.root, 'second');
    for (const command of commands) {
      const result = f.cli([
        ...command,
        '--home',
        first,
        '--state-home',
        second,
      ]);
      assert.equal(result.status, 2, command.join(' '));
      assert.equal(
        JSON.parse(result.stderr).code,
        'INVALID_ARGUMENTS',
        command.join(' '),
      );
    }
    assert.equal(existsSync(first), false);
    assert.equal(existsSync(second), false);
    assert.equal(existsSync(f.defaultRoot), false);
  },
);

posixTest(
  'legacy defaults block every state CLI without changing legacy bytes or creating the new root',
  (t) => {
    const f = fixture(t);
    const legacy = join(f.user, '.codex-tandem');
    mkdirSync(legacy, { mode: 0o700 });
    const sentinel = join(legacy, 'preserve.json');
    writeFileSync(sentinel, '{"synthetic":"retained"}\n');
    for (const command of commands) {
      const result = f.cli(command);
      assert.equal(result.status, 2, command.join(' '));
      assert.equal(
        JSON.parse(result.stderr).code,
        'LEGACY_STATE_REQUIRES_EXPLICIT_HOME',
        command.join(' '),
      );
    }
    assert.equal(existsSync(f.defaultRoot), false);
    assert.deepEqual(readdirSync(legacy), ['preserve.json']);
    assert.equal(readFileSync(sentinel, 'utf8'), '{"synthetic":"retained"}\n');
    assert.equal(JSON.parse(f.selected({ home: legacy }).stdout), legacy);
    assert.equal(JSON.parse(f.selected({ stateHome: legacy }).stdout), legacy);
    const explicit = f.cli(['profiles', 'list', '--home', legacy]);
    assert.equal(explicit.status, 0, explicit.stderr);
    assert.equal(readFileSync(sentinel, 'utf8'), '{"synthetic":"retained"}\n');
    assert.equal(existsSync(f.defaultRoot), false);
  },
);
