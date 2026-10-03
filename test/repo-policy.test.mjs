import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  symlinkSync,
  chmodSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const checker = resolve('scripts/check-repo.mjs');
const zero = '0'.repeat(40);
function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'tandem-policy-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) =>
    execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  const put = (path, text) => {
    mkdirSync(dirname(join(cwd, path)), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  git('init', '-q');
  git('config', 'user.name', 'Policy fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  put('package.json', JSON.stringify({ files: ['dist', 'README.md'] }));
  put('README.md', '# Fixture\n');
  const commit = () => {
    git('add', '-A');
    git('commit', '-qm', 'Synthetic policy fixture');
    return git('rev-parse', 'HEAD');
  };
  const run = (args = [], input = '') =>
    spawnSync(process.execPath, [checker, ...args], {
      cwd,
      encoding: 'utf8',
      input,
    });
  return { cwd, git, put, commit, run };
}

test('working candidate rejects force-tracked ignored artifacts and permits live fixtures', (t) => {
  const f = fixture(t);
  f.put('.gitignore', 'dist/\n');
  f.put('dist/runtime.js', 'export {};');
  f.git('add', '-f', 'dist/runtime.js');
  const bad = f.run();
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /dist\/runtime.js.*generated or transient/);
  f.git('rm', '-f', 'dist/runtime.js');
  f.put('test/fixtures/accounting/sample.tgz', Buffer.from([0, 255, 10]));
  f.put('docs/reporting-2026.md', 'A maintained reporting guide.');
  assert.equal(f.run().status, 0);
});

test('candidate links resolve against repository files including untracked docs, not deleted files', (t) => {
  const f = fixture(t);
  f.put('docs/live guide.md', '# Guide');
  f.put(
    'README.md',
    '[Guide](<docs/live%20guide.md>)\n[Remote](https://example.invalid/absent)\n[Anchor](#absent)\n',
  );
  f.commit();
  assert.equal(f.run().status, 0);
  f.put('docs/fresh.md', '[Guide][ref]\n\n[ref]: <live%20guide.md>');
  assert.equal(f.run().status, 0);
  rmSync(join(f.cwd, 'docs/live guide.md'));
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(result.stderr, /broken local Markdown link:.*live%20guide/);
});

test('API summaries cover exports, aliases, callable class members and interface methods', (t) => {
  const f = fixture(t);
  f.put(
    'src/api.ts',
    '/** Select a profile. */\nexport function select() {}\n/** Describe the public selector. */\nexport class Selector {\n/** Create a selector. */\nconstructor() {}\n/** Return a selected profile. */\nget selected() { return 1; }\nprivate internal() {}\n#hidden() {}\n}\n/** Supply a selection contract. */\nexport interface Contract {\n/** Select a profile. */\nselect(): void;\n}\n/** List available profile labels. */\nexport const labels = [];\n',
  );
  f.put('src/index.ts', "export { select as choose } from './api.js';\n");
  assert.equal(f.run().status, 0);
  f.put(
    'src/api.ts',
    '/** @returns selected label */\nexport function select() {}',
  );
  const result = f.run();
  assert.equal(result.status, 1);
  assert.match(
    result.stderr,
    /src\/api.ts: public API select.*JSDoc prose summary/,
  );
  f.put(
    'src/api.ts',
    '/** Select a profile. */\nexport function select() {}\n/** Describe selection behavior. */\nexport class Selector { select() {} }',
  );
  assert.match(f.run().stderr, /public API select at line 4/);
  f.put('src/index.ts', "export { missing } from './absent.js';");
  assert.match(f.run().stderr, /cannot resolve public export missing/);
  f.put('src/index.ts', 'export * from "./api.js";');
  f.put(
    'src/api.ts',
    '/** Coordinate profile selection. */\nexport class Selector { run = () => {}; private internal = () => {}; }\n/** Coordinate profile selection. */\nexport interface Contract { choose: () => void; }',
  );
  const callables = f.run();
  assert.equal(callables.status, 1);
  assert.match(callables.stderr, /public API run/);
  assert.match(callables.stderr, /public API choose/);
  f.put(
    'src/api.ts',
    '/** Coordinate profile selection. */\nexport class Selector {\n/** Run the selection. */\nrun = () => {}; private internal = () => {};\n}\n/** Coordinate profile selection. */\nexport interface Contract {\n/** Choose a profile. */\nchoose: () => void;\n}',
  );
  assert.equal(f.run().status, 0);
});

test('package boundary rejects developer directories and permits explicit production assets', (t) => {
  const f = fixture(t);
  f.put(
    'package.json',
    JSON.stringify({ files: ['dist', 'README.md', 'docs'] }),
  );
  assert.match(
    f.run().stderr,
    /files exposes development or transient content: docs/,
  );
  f.put(
    'package.json',
    JSON.stringify({ files: ['dist', 'README.md', 'assets'] }),
  );
  assert.equal(f.run().status, 0);
  f.put(
    'package.json',
    JSON.stringify({ files: ['dist', 'README.md', '../private'] }),
  );
  assert.equal(f.run().status, 1);
  f.put(
    'package.json',
    JSON.stringify({ files: ['dist', 'README.md', '.githooks'] }),
  );
  assert.equal(f.run().status, 1);
});

test('rollout skips only historical prefix and later policy removal fails', (t) => {
  const f = fixture(t);
  f.put('docs/migration/old.json', '{}');
  const root = f.commit();
  f.git('rm', '-r', 'docs/migration');
  f.put('scripts/check-repo.mjs', '// Repository policy is introduced here.');
  const introduced = f.commit();
  const rollout = f.run(['--range', `${zero}..${introduced}`]);
  assert.equal(rollout.status, 0);
  assert.match(rollout.stdout, /skipped 1 historical commits/);
  assert.equal(f.run(['--range', `${root}..${introduced}`]).status, 0);
  f.git('rm', 'scripts/check-repo.mjs');
  const removed = f.commit();
  assert.match(
    f.run(['--range', `${introduced}..${removed}`]).stderr,
    /policy cannot be removed/,
  );
  assert.match(
    f.run(['--range', `${zero}..${removed}`]).stderr,
    /policy cannot be removed/,
  );
});

test('outgoing intermediate commits fail even after artifact deletion and a clean working tree', (t) => {
  const f = fixture(t);
  f.put('scripts/check-repo.mjs', '// Policy marker.');
  const base = f.commit();
  f.put('backups/private.log', 'synthetic secret');
  const bad = f.commit();
  f.git('rm', '-r', 'backups');
  const head = f.commit();
  assert.equal(f.run().status, 0);
  assert.equal(f.run(['--tree', head]).status, 0);
  const input = `refs/heads/topic ${head} refs/heads/topic ${base}\n`;
  const push = f.run(['--pre-push'], input);
  assert.equal(push.status, 1);
  assert.match(push.stderr, new RegExp(`${bad}: backups/private.log`));
  assert.equal(f.run(['--range', `${base}..${head}`]).status, 1);
});

test('tree checking reads committed documents and APIs even when worktree repairs them', (t) => {
  const f = fixture(t);
  f.put('README.md', '[Missing](absent.md)');
  f.put('src/api.ts', 'export function select() {}');
  const bad = f.commit();
  f.put('README.md', '# Repaired');
  f.put('src/api.ts', '/** Select a profile. */\nexport function select() {}');
  assert.equal(f.run().status, 0);
  const result = f.run(['--tree', bad]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /broken local Markdown link/);
  assert.match(result.stderr, /public API select/);
});

test('new branches exclude fetched remote ancestry and check root and multiple updates', (t) => {
  const f = fixture(t);
  f.put('scripts/check-repo.mjs', '// Policy marker.');
  const root = f.commit();
  assert.equal(
    f.run(['--pre-push'], `refs/heads/main ${root} refs/heads/main ${zero}\n`)
      .status,
    0,
  );
  f.git('remote', 'add', 'upstream', 'https://example.invalid/repository.git');
  f.put('backups/past.log', 'Historical content already on remote.');
  f.commit();
  f.git('rm', '-r', 'backups');
  const remote = f.commit();
  f.git('update-ref', 'refs/remotes/upstream/main', remote);
  f.put('docs/maintained.md', '# Maintained guide');
  const topic = f.commit();
  assert.equal(
    f.run(
      ['--pre-push', 'upstream'],
      `refs/heads/topic ${topic} refs/heads/topic ${zero}\n`,
    ).status,
    0,
  );
  f.put('docs/qualification/revived.json', '{}');
  const bad = f.commit();
  const push = f.run(
    ['--pre-push', 'upstream'],
    `refs/heads/good ${topic} refs/heads/good ${zero}\nrefs/heads/bad ${bad} refs/heads/bad ${zero}\n`,
  );
  assert.equal(push.status, 1);
  assert.match(push.stderr, /docs\/qualification\/revived.json/);
  assert.equal(
    f.run(['--pre-push'], `(delete) ${zero} refs/heads/old ${topic}\n`).status,
    0,
  );
  assert.equal(
    f.run(['--pre-push'], `(delete) ${zero} refs/heads/old ${'1'.repeat(40)}\n`)
      .status,
    0,
  );
});

test('invalid refs, unknown objects and malformed push records fail closed', (t) => {
  const f = fixture(t);
  const root = f.commit();
  assert.equal(f.run(['--tree', 'missing']).status, 1);
  assert.equal(f.run(['--tree', '--all']).status, 1);
  assert.equal(f.run(['--range', `missing..${root}`]).status, 1);
  assert.equal(
    f.run(
      ['--pre-push'],
      `refs/heads/a ${root} refs/heads/a ${'1'.repeat(40)}\n`,
    ).status,
    1,
  );
  assert.equal(f.run(['--pre-push'], 'not a push record').status, 1);
  assert.equal(f.run(['--pre-push'], '').status, 0);
});

test('installed hook rejects an intermediate bad commit before a disposable remote is updated', (t) => {
  const f = fixture(t);
  const remote = mkdtempSync(join(tmpdir(), 'tandem-policy-remote-'));
  t.after(() => rmSync(remote, { recursive: true, force: true }));
  execFileSync('git', ['init', '--bare', '-q', remote]);
  const hook = readFileSync(resolve('.githooks/pre-push'), 'utf8');
  assert.equal(
    hook.includes('\r'),
    false,
    'hook uses LF for Git shell execution',
  );
  f.put('scripts/check-repo.mjs', readFileSync(checker, 'utf8'));
  f.put('.githooks/pre-push', hook);
  chmodSync(join(f.cwd, '.githooks/pre-push'), 0o755);
  f.put('.gitignore', 'node_modules\n');
  symlinkSync(resolve('node_modules'), join(f.cwd, 'node_modules'), 'junction');
  f.git('config', 'core.hooksPath', '.githooks');
  f.git('remote', 'add', 'fixture', remote);
  const base = f.commit();
  const push = () =>
    spawnSync('git', ['push', 'fixture', 'HEAD:refs/heads/topic'], {
      cwd: f.cwd,
      encoding: 'utf8',
    });
  assert.equal(push().status, 0);
  f.put('backups/private.log', 'Synthetic transient content.');
  f.commit();
  f.git('rm', '-r', 'backups');
  f.commit();
  const rejected = push();
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /backups\/private.log/);
  const remoteHead = () =>
    execFileSync(
      'git',
      ['--git-dir', remote, 'rev-parse', 'refs/heads/topic'],
      { encoding: 'utf8' },
    ).trim();
  assert.equal(remoteHead(), base);
  f.git('switch', '-qc', 'safe', base);
  f.put('docs/live.md', '# Maintained documentation');
  const safe = f.commit();
  assert.equal(push().status, 0);
  assert.equal(remoteHead(), safe);
});
