import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root=mkdtempSync(join(tmpdir(),'tandem-ct04-'));
after(()=>rmSync(root,{recursive:true,force:true}));
const cli=resolve(process.env.TANDEM_TEST_PACKAGE||'.','dist/cli.js');
const fixture=join(root,'profiles.json');
writeFileSync(fixture,JSON.stringify({schemaVersion:1,synthetic:true,profiles:[{id:'id-a',label:'同じ'},{id:'id-b',label:'同じ'}]}));
const run=(args,input='')=>spawnSync(process.execPath,[cli,...args],{encoding:'utf8',input,timeout:5000});
test('non-TTY requires explicit stable identity and target without waiting',()=>{
 const result=run(['--g0-fixture',fixture,'--target','local','--json']);
 assert.equal(result.status,2);
 assert.equal(JSON.parse(result.stderr).code,'IDENTITY_REQUIRED');
 assert.equal(result.stdout,'');
});
test('passes child arguments, streams and exit exactly like direct invocation',()=>{
 const args=['--profile','a b','"quotes"','こんにちは',';&$x','--fixture-exit=7'];
 const direct=spawnSync(process.execPath,[resolve(process.env.TANDEM_TEST_PACKAGE||'.','dist/g0-child.js'),...args],{encoding:'utf8',input:'stdin\n'});
 const wrapped=run(['run','--g0-fixture',fixture,'--identity','id-b','--target','local','--',...args],'stdin\n');
 assert.equal(wrapped.status,7);
 assert.equal(wrapped.stdout,direct.stdout);
 assert.equal(wrapped.stderr,direct.stderr);
});
test('validates synthetic metadata and selects stable IDs rather than duplicate labels',()=>{
 assert.match(run(['--g0-fixture',fixture,'--identity','同じ','--target','local']).stderr,/IDENTITY_UNKNOWN/);
 const empty=join(root,'empty.json'); writeFileSync(empty,JSON.stringify({schemaVersion:1,synthetic:true,profiles:[]}));
 assert.match(run(['--g0-fixture',empty,'--identity','id-a','--target','local']).stderr,/NO_PROFILES/);
 const invalid=join(root,'invalid.json');writeFileSync(invalid,JSON.stringify({schemaVersion:1,synthetic:false,profiles:[]}));
 assert.match(run(['--g0-fixture',invalid,'--identity','id-a','--target','local']).stderr,/INVALID_FIXTURE/);
 assert.match(run(['--identity','id-a','--target','local']).stderr,/G1_ACTIVATION_UNAVAILABLE/);
});
test('forwards POSIX termination to the harmless child and propagates its exit', {skip:process.platform==='win32'},async()=>{
 const child=spawn(process.execPath,[cli,'--g0-fixture',fixture,'--identity','id-a','--target','local','--','--fixture-wait']);
 const result=new Promise(resolve=>child.once('exit',code=>resolve(code)));
 await new Promise(resolve=>child.stderr.once('data',resolve));
 child.kill('SIGTERM');
 assert.equal(await result,143);
});

