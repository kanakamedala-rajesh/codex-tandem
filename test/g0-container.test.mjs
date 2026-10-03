import assert from 'node:assert/strict';
import { test } from 'node:test';
import { planG0ContainerExperiment } from '../dist/g0-container.js';

const target = {
  experimental: true,
  generation: 'a'.repeat(64),
  uid: 1000,
  home: '/home/validation',
  codexHome: '/home/validation/private/codex-home',
  project: '/home/validation/private/build project',
  executable: '/tmp/existing-codex',
};

test('container experiment pins the target and explicit build environment without a TTY or shell', () => {
  const command = planG0ContainerExperiment(
    target,
    'Build the fixture; keep "quotes" and ₹.',
  );
  assert.deepEqual(command, {
    executable: 'docker',
    args: [
      'exec',
      '-i',
      '--user',
      '1000',
      '--workdir',
      '/home/validation/private/build project',
      '--env',
      'HOME=/home/validation',
      '--env',
      'CODEX_HOME=/home/validation/private/codex-home',
      'a'.repeat(64),
      '/usr/bin/env',
      '-u',
      'OPENAI_API_KEY',
      '-u',
      'CODEX_API_KEY',
      '-u',
      'OPENAI_BASE_URL',
      '/tmp/existing-codex',
      '--no-daemon',
      '--sandbox',
      'workspace-write',
      '-c',
      'cli_auth_credentials_store="file"',
      'exec',
      '--skip-git-repo-check',
      '--json',
      'Build the fixture; keep "quotes" and ₹.',
    ],
  });
});

test('experiment refuses mutable container names, unapproved scope and invalid prompts before launch', () => {
  for (const invalid of [
    { ...target, experimental: false },
    { ...target, generation: 'friendly-name' },
    { ...target, uid: 0 },
    { ...target, project: '/elsewhere' },
    { ...target, codexHome: '/home/validation/../other' },
    { ...target, executable: 'codex' },
  ])
    assert.throws(() => planG0ContainerExperiment(invalid, 'Build fixture.'), {
      message: 'INVALID_G0_CONTAINER_EXPERIMENT',
    });
  assert.throws(() => planG0ContainerExperiment(target, 'x'.repeat(4097)), {
    message: 'INVALID_G0_CONTAINER_EXPERIMENT',
  });
});
