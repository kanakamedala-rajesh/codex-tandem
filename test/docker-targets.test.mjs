import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { modulePath } from './fixtures/activation.mjs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const execute = promisify(execFile);

test('named Docker targets retain independent generation and project mappings', async () => {
  const { saveDockerTarget, readDockerTargets, mappedDockerProject } =
    await import(modulePath('docker-targets.js'));
  const root = await mkdtemp(join(tmpdir(), 'ct14-target-'));
  try {
    const target = {
      id: 'work-build',
      type: 'docker',
      dockerContext: 'desktop-linux',
      daemonId: 'synthetic-daemon-01',
      containerSelector: 'work',
      expectedContainerId: 'a'.repeat(64),
      user: 'cnh',
      home: '/home/cnh',
      codexHome: '/home/cnh/.codex',
      codexExecutable: '/home/cnh/bin/codex',
      bridgeInterpreter: '/usr/bin/python3',
      workspaceMappings: [{ hostRoot: root, targetRoot: '/workspace/project' }],
    };
    await saveDockerTarget(join(root, 'state'), target);
    assert.deepEqual(await readDockerTargets(join(root, 'state')), [target]);
    assert.equal(await mappedDockerProject(target, root), '/workspace/project');
    await assert.rejects(
      mappedDockerProject(target, tmpdir()),
      /PROJECT_OUTSIDE_REGISTERED_ROOT/,
    );
    await assert.rejects(
      saveDockerTarget(join(root, 'state'), { ...target, identity: 'A' }),
      /TARGET_CONFIGURATION_INVALID/,
    );
    assert.deepEqual(await readDockerTargets(join(root, 'state')), [target]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('named-target CLI refuses a host project outside its registered root before entering Docker', async () => {
  const { saveDockerTarget } = await import(modulePath('docker-targets.js'));
  const root = await mkdtemp(join(tmpdir(), 'ct14-cli-'));
  try {
    await saveDockerTarget(join(root, 'state'), {
      id: 'work',
      type: 'docker',
      dockerContext: 'desktop-linux',
      daemonId: 'synthetic-daemon',
      containerSelector: 'work',
      expectedContainerId: 'a'.repeat(64),
      user: 'cnh',
      home: '/home/cnh',
      codexHome: '/home/cnh/.codex',
      codexExecutable: '/home/cnh/bin/codex',
      bridgeInterpreter: '/usr/bin/python3',
      workspaceMappings: [{ hostRoot: root, targetRoot: '/work' }],
    });
    let failure;
    try {
      await execute(process.execPath, [
        fileURLToPath(modulePath('cli.js')),
        'run',
        '--target',
        'work',
        '--identity',
        'profile_00000000-0000-0000-0000-000000000001',
        '--state-home',
        join(root, 'state'),
        '--project',
        tmpdir(),
        '--json',
      ]);
    } catch (error) {
      failure = error;
    }
    assert.equal(failure?.code, 2);
    assert.equal(
      JSON.parse(failure.stderr).code,
      'PROJECT_OUTSIDE_REGISTERED_ROOT',
    );
    await assert.rejects(
      execute(process.execPath, [
        fileURLToPath(modulePath('cli.js')),
        'processes',
        '--target',
        'work',
        '--state-home',
        join(root, 'state'),
        '--project',
        tmpdir(),
        '--json',
      ]),
      (error) =>
        error.code === 2 &&
        JSON.parse(error.stderr).code === 'PROJECT_OUTSIDE_REGISTERED_ROOT',
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a dead Docker client does not make its saved binding available to profile mutation', async () => {
  const { acquireBindingLease } = await import(modulePath('binding-lock.js'));
  const { privateDirectory } = await import(modulePath('private-files.js'));
  const root = await mkdtemp(join(tmpdir(), 'ct14-binding-'));
  try {
    const privateRoot = await privateDirectory(join(root, 'private'));
    const path = join(privateRoot, 'selected.json');
    await execute(process.execPath, [
      '--input-type=module',
      '-e',
      `const { acquireDockerBindingLease } = await import(${JSON.stringify(modulePath('binding-lock.js'))}); await acquireDockerBindingLease(process.argv[1], 'docker:synthetic-daemon:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:/home/cnh/.codex');`,
      path,
    ]);
    await assert.rejects(acquireBindingLease(path), /BINDING_BUSY/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
