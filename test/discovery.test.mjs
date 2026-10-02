import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverTarget } from '../dist/discovery.js';

test('local discovery resolves explicit contained project and executable without creating Codex home', async () => {
 const root = await mkdtemp(join(tmpdir(), 'tandem-discovery-'));
 try {
  await mkdir(join(root,'project with spaces'));
  const result = await discoverTarget({ target:'local', projectRoot:root, project:join(root,'project with spaces'), codexHome:join(root,'absent'), codexExecutable:process.execPath });
  assert.equal(result.ok,true);
  assert.equal(result.paths.project, join(root,'project with spaces'));
  assert.equal(result.paths.codexHomeExists,false);
  assert.equal(result.fullTracking,false);
  assert.equal(result.trust,'unverified');
  assert.equal(result.bridge.durableCapture,'unverified');
 } finally { await rm(root,{recursive:true,force:true}); }
});

test('stopped Docker target is diagnosed without exec or restart', async () => {
 const commands=[];
 const result=await discoverTarget({target:'docker',container:'alias',dockerContext:'test'}, async (args) => {
  commands.push(args);
  if(args[0]==='context') return JSON.stringify('unix:///var/run/docker.sock');
  if(args.includes('info')) return JSON.stringify('daemon-fixture');
  return JSON.stringify({id:'a'.repeat(64),running:false,paused:false,status:'exited'});
 });
 assert.equal(result.ok,false);
 assert.deepEqual(result.diagnostics,['CONTAINER_STOPPED']);
 assert.equal(commands.length,3);
 assert.equal(commands[2].includes('inspect'),true);
});

test('Docker aliases pin the generation and project paths without exposing environment', async () => {
 const commands=[];
 const result=await discoverTarget({target:'docker',container:'alias',dockerContext:'test',projectRoot:'/work',project:'/work/project'}, async args => {
  commands.push(args);
  if(args[0]==='context') return JSON.stringify('unix:///var/run/docker.sock');
  if(args.includes('info')) return JSON.stringify('daemon-fixture');
  if(args.includes('inspect')) return JSON.stringify({id:'a'.repeat(64),running:true,paused:false,status:'running'});
  if(args.at(-1)==='command -v python3 || command -v python') return '/usr/bin/python3\n';
  return JSON.stringify({user:'worker',paths:{home:'/home/worker',codexHome:'/home/worker/.codex',codexHomeExists:false,projectRoot:'/work',project:'/work/project',executable:'/usr/bin/codex'},jsonProjection:true,durableFacility:true,permissions:{projectReadable:true,codexHomeWritable:true}});
 });
 assert.equal(result.ok,true);
 assert.equal(result.generation,'a'.repeat(64));
 assert.equal(result.paths.project,'/work/project');
 assert.equal(result.credentialScope,'docker:daemon-fixture:'+ 'a'.repeat(64) +':/home/worker/.codex');
 assert.equal(result.bridge.jsonProjection,'verified');
 assert.equal(result.bridge.durableCapture,'facility-present-unverified');
 assert.equal(commands.filter(a=>a.includes('--type')).length,2);
 assert.ok(commands.filter(a=>a.includes('exec')).every(a=>a.includes('a'.repeat(64))));
});

test('local Codex home must not be an existing regular file', async () => {
 const result=await discoverTarget({target:'local',codexHome:process.execPath,codexExecutable:process.execPath});
 assert.equal(result.ok,false);
 assert.deepEqual(result.diagnostics,['CODEX_HOME_NOT_DIRECTORY']);
});

test('remote Docker context is rejected before contacting a daemon', async () => {
 const calls=[];
 const report=await discoverTarget({target:'docker',container:'alias',dockerContext:'remote'}, async args => {
  calls.push(args);
  return JSON.stringify('ssh://example.invalid');
 });
 assert.deepEqual(report.diagnostics,['REMOTE_DOCKER_UNSUPPORTED']);
 assert.equal(calls.length,1);
 assert.ok(calls[0].includes('context'));
});


test('doctor exposes local discovery through the CLI without modifying the target', async () => {
 const {spawnSync}=await import('node:child_process');
 const {fileURLToPath}=await import('node:url');
 const run=spawnSync(process.execPath,[fileURLToPath(new URL('../dist/cli.js',import.meta.url)),'doctor','--target','local','--codex-executable',process.execPath,'--json'],{encoding:'utf8'});
 assert.equal(run.status,0,run.stdout+run.stderr);
 assert.equal(JSON.parse(run.stdout).targetDiscovery.fullTracking,false);
});

for(const [label,overrides,expected] of [
 ['paused',{paused:true},'CONTAINER_PAUSED'],
 ['replaced',{id:'b'.repeat(64)},'CONTAINER_REPLACED_REVALIDATE'],
 ['inaccessible',null,'DOCKER_CONTEXT_OR_CONTAINER_INACCESSIBLE'],
]) test(`Docker ${label} discovery does not exec`,async()=>{
 const report=await discoverTarget({target:'docker',dockerContext:'test',container:'alias',expectedGeneration:'a'.repeat(64)},async args=>{
  assert.equal(args.includes('exec'),false);
  if(args[0]==='context') return JSON.stringify('unix:///var/run/docker.sock');
  if(args.includes('info')) return JSON.stringify('daemon-fixture');
  if(!overrides) throw new Error('synthetic secret must never appear');
  return JSON.stringify({id:'a'.repeat(64),running:true,paused:false,...overrides});
 });
 assert.deepEqual(report.diagnostics,[expected]);
 assert.doesNotMatch(JSON.stringify(report),/synthetic secret/);
});

test('project traversal and physical symlink escape are rejected', async () => {
 const {symlink}=await import('node:fs/promises');
 const root=await mkdtemp(join(tmpdir(),'tandem-containment-'));
 try {
  await mkdir(join(root,'allowed'));
  await mkdir(join(root,'outside'));
  await symlink(join(root,'outside'),join(root,'allowed','alias'),'junction');
  for(const project of [join(root,'allowed','..','outside'),join(root,'allowed','alias')]) {
   const result=await discoverTarget({target:'local',projectRoot:join(root,'allowed'),project,codexExecutable:process.execPath});
   assert.deepEqual(result.diagnostics,['PROJECT_OUTSIDE_REGISTERED_ROOT']);
  }
 } finally {await rm(root,{recursive:true,force:true});}
});

test('missing bridge reports unavailable without installing a runtime', async () => {
 const result=await discoverTarget({target:'docker',dockerContext:'test',container:'alias'},async args=>{
  if(args[0]==='context') return JSON.stringify('unix:///var/run/docker.sock');
  if(args.includes('info')) return JSON.stringify('daemon-fixture');
  if(args.includes('inspect')) return JSON.stringify({id:'a'.repeat(64),running:true,paused:false});
  assert.equal(args.at(-1),'command -v python3 || command -v python');
  throw new Error('no interpreter');
 });
 assert.equal(result.ok,false);
 assert.deepEqual(result.diagnostics,['BRIDGE_UNAVAILABLE']);
});

test('Docker context aliases share physical credential scope and replacement races fail closed', async () => {
 let replacement=false;
 const run=async args=>{
  if(args[0]==='context') return JSON.stringify('unix:///var/run/docker.sock');
  if(args.includes('info')) return JSON.stringify('daemon-fixture');
  if(args.includes('inspect')) return JSON.stringify({id:(replacement?'b':'a').repeat(64),running:true,paused:false});
  if(args.at(-1)==='command -v python3 || command -v python') return '/usr/bin/python3';
  return JSON.stringify({user:'worker',paths:{home:'/home/worker',codexHome:'/home/worker/.codex',codexHomeExists:true,projectRoot:'/work',project:'/work',executable:'/usr/bin/codex'},jsonProjection:true,durableFacility:true,permissions:{projectReadable:true,codexHomeWritable:true}});
 };
 const first=await discoverTarget({target:'docker',dockerContext:'one',container:'alias'},run);
 const alias=await discoverTarget({target:'docker',dockerContext:'two',container:'other-alias'},run);
 assert.equal(first.credentialScope,alias.credentialScope);
 const raced=await discoverTarget({target:'docker',dockerContext:'one',container:'alias'},async args=>{
  const value=await run(args);
  if(args.includes('-c') && args.includes('/usr/bin/python3')) replacement=true;
  return value;
 });
 assert.equal(raced.ok,false);
 assert.deepEqual(raced.diagnostics,['CONTAINER_CHANGED_DURING_DISCOVERY']);
 assert.equal(raced.paths,undefined);
});

test('Linux mount boundaries under an explicit root are rejected even on the same device', {skip:process.platform!=='linux'},async(t)=>{
 const {stat,readFile}=await import('node:fs/promises');
 if(!(await readFile('/proc/self/mountinfo','utf8')).split('\n').some(line=>line.split(' ')[4]==='/proc/sys')) {t.skip('Existing /proc/sys bind mount unavailable; exercised in Docker qualification'); return;}
 assert.equal((await stat('/proc')).dev,(await stat('/proc/sys')).dev);
 const result=await discoverTarget({target:'local',projectRoot:'/proc',project:'/proc/sys',codexExecutable:process.execPath});
 assert.deepEqual(result.diagnostics,['PROJECT_MOUNT_REQUIRES_REGISTERED_ROOT']);
});

