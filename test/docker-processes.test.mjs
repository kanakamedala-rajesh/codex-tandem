import test from 'node:test';
import assert from 'node:assert/strict';
import { modulePath } from './fixtures/activation.mjs';

const target = {
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
  workspaceMappings: [{ hostRoot: process.cwd(), targetRoot: '/work' }],
};
const child = {
  pid: 41,
  creation: 'synthetic:12:10000',
  executable: '/home/cnh/bin/codex',
  managed: true,
  launchId: '00000000-0000-0000-0000-000000000005',
  state: 'S',
  role: 'child',
};
const response = (processes, owner = { nonce: 'b'.repeat(64) }) =>
  JSON.stringify({ ok: true, result: { processes, owner } });

test('Docker stop accepts equivalent legacy owner fields in different JSON key order', async () => {
  const { stopDockerProcesses } = await import(
    modulePath('docker-processes.js')
  );
  let calls = 0,
    remaining = true,
    signals = 0;
  const result = await stopDockerProcesses(target, '/work', async () => true, {
    transport: async (args) => {
      if (args.at(-5) === 'stop') {
        signals++;
        remaining = false;
      }
      const owner =
        ++calls % 2
          ? { nonce: 'b'.repeat(64), home: target.codexHome }
          : { home: target.codexHome, nonce: 'b'.repeat(64) };
      return response(remaining ? [child] : [], owner);
    },
  });
  assert.equal(result.status, 'stopped');
  assert.equal(signals, 1);
});

test('Docker stop never asks consent or signals unknown ownership or PID1', async () => {
  const { stopDockerProcesses } = await import(
    modulePath('docker-processes.js')
  );
  for (const blocked of [
    { ...child, managed: false, role: 'external' },
    { ...child, pid: 1 },
  ]) {
    let calls = 0;
    const result = await stopDockerProcesses(
      target,
      '/work',
      async () => {
        throw new Error('must not request consent');
      },
      {
        transport: async (args) => {
          assert.equal(args.at(-5), 'inspect');
          calls++;
          return response([blocked]);
        },
      },
    );
    assert.equal(result.status, 'blocked');
    assert.equal(calls, 1);
  }
});
test('Docker stop refuses replaced remote ownership after consent without a signal', async () => {
  const { stopDockerProcesses } = await import(
    modulePath('docker-processes.js')
  );
  let calls = 0;
  await assert.rejects(
    stopDockerProcesses(target, '/work', async () => true, {
      transport: async (args) => {
        assert.equal(args.at(-5), 'inspect');
        return response([child], {
          nonce: (++calls === 1 ? 'b' : 'c').repeat(64),
        });
      },
    }),
    /REMOTE_STOP_SCOPE_CHANGED/,
  );
  assert.equal(calls, 2);
});
test('Docker stop tolerates state changes and requires distinct force consent for survivors', async () => {
  const { stopDockerProcesses } = await import(
    modulePath('docker-processes.js')
  );
  const signals = [],
    prompts = [];
  let state = 'S',
    remaining = true;
  const result = await stopDockerProcesses(
    target,
    '/work',
    async (prompt) => {
      prompts.push(prompt.phase);
      state = 'R';
      return true;
    },
    {
      waitMs: 100,
      transport: async (args, input) => {
        if (args.at(-5) === 'stop') {
          const value = JSON.parse(input);
          signals.push(value.force);
          if (value.force) remaining = false;
        }
        return response(remaining ? [{ ...child, state }] : []);
      },
    },
  );
  assert.equal(result.status, 'stopped');
  assert.deepEqual(signals, [false, true]);
  assert.deepEqual(prompts, ['graceful', 'force']);
});

test('Docker stop cancellation leaves the observed remote processes untouched', async () => {
  const { stopDockerProcesses } = await import(
    modulePath('docker-processes.js')
  );
  const target = {
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
    workspaceMappings: [{ hostRoot: process.cwd(), targetRoot: '/work' }],
  };
  const childProcess = {
    pid: 41,
    creation: 'synthetic:12:10000',
    executable: '/home/cnh/bin/codex',
    managed: true,
    launchId: '00000000-0000-0000-0000-000000000005',
    state: 'S',
    role: 'child',
  };
  let signals = 0;
  const transport = async (args) => {
    if (args.at(-5) === 'stop') signals++;
    return JSON.stringify({
      ok: true,
      result: { processes: [childProcess], owner: { nonce: 'b'.repeat(64) } },
    });
  };
  const result = await stopDockerProcesses(
    target,
    '/work',
    async (prompt) => {
      assert.equal(prompt.phase, 'graceful');
      assert.deepEqual(prompt.processes, [childProcess]);
      return false;
    },
    { transport },
  );
  assert.equal(result.status, 'cancelled');
  assert.equal(signals, 0);
  assert.deepEqual(result.processes, [childProcess]);
});
