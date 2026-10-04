import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  modulePath,
  activationFixture,
  syntheticAuth,
} from './fixtures/activation.mjs';

test('remote control keeps credentials inside the bounded private stdin protocol', async () => {
  const { openDockerRuntime } = await import(modulePath('docker-runtime.js'));
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
  let argv;
  const transport = (args) => {
    argv = args;
    return spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import readline from 'node:readline'; console.log(JSON.stringify({ok:true,manager:{pid:41,creation:'synthetic:12:10000',parent:1,state:'S',uid:10000}})); readline.createInterface({input:process.stdin}).on('line',line=>{const request=JSON.parse(line); if(request.action==='snapshot') console.log(JSON.stringify({ok:true,result:{auth:Buffer.from('SYNTHETIC-SECRET').toString('base64'),active:null,transaction:null}})); else console.log(JSON.stringify({ok:true,result:null})); if(request.action==='release')process.exit(0);});`,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
  };
  const session = await openDockerRuntime(target, '/work', transport);
  try {
    assert.equal(
      (await session.snapshot()).auth.toString(),
      'SYNTHETIC-SECRET',
    );
    await session.stage(Buffer.from('SYNTHETIC-SELECTED'));
    await session.pinInvocation([{ path: '/work', root: '/work' }]);
    await assert.rejects(
      session.pinInvocation([{ path: '../outside', root: '/work' }]),
      /REMOTE_PATH_INVALID/,
    );
    await assert.rejects(
      session.prepare({ id: '../not-a-launch-record' }),
      /REMOTE_LAUNCH_INVALID/,
    );
    assert.equal(argv.includes('-t'), false);
    assert.equal(argv.join(' ').includes('SYNTHETIC-SECRET'), false);
    assert.equal(argv.join(' ').includes('SYNTHETIC-SELECTED'), false);
    assert.equal(argv.includes(target.expectedContainerId), true);
    await session.release();
  } finally {
    session.disconnect();
  }
});

test('Docker activation preserves refreshed outgoing credentials across A to B to A', async () => {
  const { activateDockerIdentity } = await import(
    modulePath('docker-activation.js')
  );
  const f = await activationFixture();
  const state = join(f.root, 'remote.json');
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
    workspaceMappings: [{ hostRoot: f.root, targetRoot: '/work' }],
  };
  const refresh = Buffer.from(
    syntheticAuth('A', 'SYNTHETIC-REFRESHED-A'),
  ).toString('base64');
  const script = `import readline from 'node:readline';import {readFileSync,writeFileSync} from 'node:fs'; const path=process.argv[1];let state=JSON.parse(readFileSync(path,'utf8'));console.log(JSON.stringify({ok:true,manager:{pid:41,creation:'synthetic:12:10000',uid:10000}}));readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);let result=null;if(r.action==='snapshot')result={auth:state.auth,active:state.active?Object.fromEntries(Object.entries(state.active).reverse()):null,transaction:state.transaction};if(r.action==='policy')result={config:{cli_auth_credentials_store:'file'},managed:false,requirements:null};if(r.action==='metadata')state[r.name]=r.value;if(r.action==='stage')state.staged=r.auth;if(r.action==='replace'){if(state.auth!==r.expected){console.log(JSON.stringify({ok:false,code:'EXTERNAL_REFRESH_CONFLICT'}));return;}state.auth=state.staged;}if(r.action==='prepare' && state.refresh){state.auth=state.refresh;state.refresh=null;}writeFileSync(path,JSON.stringify(state));console.log(JSON.stringify({ok:true,result}));if(r.action==='release')process.exit(0);});`;
  const transport = () =>
    spawn(process.execPath, ['--input-type=module', '-e', script, state], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  await writeFile(
    state,
    JSON.stringify({ auth: null, active: null, transaction: null, refresh }),
  );
  let lease;
  try {
    const options = { stateHome: f.state, target, project: '/work', transport };
    lease = await activateDockerIdentity({
      ...options,
      profileId: f.profiles[0].id,
    });
    await lease.prepareLaunch('tracked');
    await lease.syncAfterExit();
    await lease.release();
    lease = undefined;
    lease = await activateDockerIdentity({
      ...options,
      profileId: f.profiles[1].id,
    });
    assert.equal(
      JSON.parse((await lease.runtime.snapshot()).auth.toString()).tokens
        .account_id,
      'B',
    );
    const { rename, symlink } = await import('node:fs/promises');
    await rename(
      join(f.state, 'launches'),
      join(f.state, 'launches-preserved'),
    );
    await symlink(
      join(f.state, 'launches-preserved'),
      join(f.state, 'launches'),
      process.platform === 'win32' ? 'junction' : 'dir',
    );
    await lease.prepareLaunch('untracked');
    await lease.release();
    lease = undefined;
    lease = await activateDockerIdentity({
      ...options,
      profileId: f.profiles[0].id,
    });
    assert.equal(
      JSON.parse((await lease.runtime.snapshot()).auth.toString()).tokens
        .refresh_token,
      'SYNTHETIC-REFRESHED-A',
    );
    await lease.release();
    lease = undefined;
  } finally {
    if (lease) await lease.release();
    await rm(f.root, { recursive: true, force: true });
  }
});

test('remote resume refuses unscoped selections before a target lookup', async () => {
  const { openDockerRuntime } = await import(modulePath('docker-runtime.js'));
  const target = {
    dockerContext: 'desktop-linux',
    expectedContainerId: 'a'.repeat(64),
    user: 'cnh',
    home: '/home/cnh',
    codexHome: '/home/cnh/.codex',
    codexExecutable: '/bin/codex',
    bridgeInterpreter: '/usr/bin/python3',
  };
  const uuid = '00000000-0000-0000-0000-000000000005';
  const transport = () =>
    spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `import readline from 'node:readline';console.log(JSON.stringify({ok:true,manager:{pid:41,creation:'synthetic:12:10000',uid:10000}}));readline.createInterface({input:process.stdin}).on('line',line=>{const r=JSON.parse(line);console.log(JSON.stringify({ok:true,result:r.action==='resume'?'${uuid}':null}));if(r.action==='release')process.exit(0);});`,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
  const session = await openDockerRuntime(target, '/work', transport);
  try {
    await assert.rejects(
      session.resume('../another-project'),
      /RESUME_ID_INVALID/,
    );
    assert.equal(await session.resume(uuid), uuid);
    await session.release();
  } finally {
    session.disconnect();
  }
});

test('remote control refuses a manager without non-root native owner evidence', async () => {
  const { openDockerRuntime } = await import(modulePath('docker-runtime.js'));
  const target = {
    dockerContext: 'desktop-linux',
    expectedContainerId: 'a'.repeat(64),
    user: 'cnh',
    home: '/home/cnh',
    codexHome: '/home/cnh/.codex',
    codexExecutable: '/bin/codex',
    bridgeInterpreter: '/usr/bin/python3',
  };
  const transport = () =>
    spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `console.log(JSON.stringify({ok:true,manager:{pid:41,creation:'synthetic:12:10000'}}));process.stdin.resume();process.stdin.on('end',()=>process.exit(0));`,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
  let session;
  try {
    await assert.rejects(async () => {
      session = await openDockerRuntime(target, '/work', transport);
    }, /REMOTE_MANAGER_UNPROVEN/);
  } finally {
    session?.disconnect();
  }
});

test('remote control cannot register PID1 as its credential manager', async () => {
  const { openDockerRuntime } = await import(modulePath('docker-runtime.js'));
  const target = {
    dockerContext: 'desktop-linux',
    expectedContainerId: 'a'.repeat(64),
    user: 'cnh',
    home: '/home/cnh',
    codexHome: '/home/cnh/.codex',
    codexExecutable: '/bin/codex',
    bridgeInterpreter: '/usr/bin/python3',
  };
  const transport = () =>
    spawn(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `console.log(JSON.stringify({ok:true,manager:{pid:1,creation:'synthetic:12:10000',uid:10000}}));process.stdin.resume();process.stdin.on('end',()=>process.exit(0));`,
      ],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    );
  let session;
  try {
    await assert.rejects(async () => {
      session = await openDockerRuntime(target, '/work', transport);
    }, /REMOTE_MANAGER_UNPROVEN/);
  } finally {
    session?.disconnect();
  }
});

test('remote activation policy rejects unproved managed restrictions and mismatched workspaces', async () => {
  const { verifyProjectedActivationPolicy } = await import(
    modulePath('profile-login.js')
  );
  const file = {
    config: { cli_auth_credentials_store: 'file' },
    managed: false,
    requirements: null,
  };
  assert.doesNotThrow(() => verifyProjectedActivationPolicy(file, 'A'));
  assert.throws(
    () => verifyProjectedActivationPolicy({ ...file, managed: true }, 'A'),
    /POLICY_UNVERIFIABLE/,
  );
  assert.throws(
    () => verifyProjectedActivationPolicy({ ...file, requirements: {} }, 'A'),
    /POLICY_UNVERIFIABLE/,
  );
  assert.throws(
    () =>
      verifyProjectedActivationPolicy(
        {
          ...file,
          config: { ...file.config, forced_chatgpt_workspace_id: 'B' },
        },
        'A',
      ),
    /WORKSPACE_POLICY_MISMATCH/,
  );
});
