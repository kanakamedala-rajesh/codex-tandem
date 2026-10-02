import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const scratch=mkdtempSync(join(tmpdir(),'tandem-capture-package-'));
const npm=process.env.npm_execpath;
if(!npm) throw new Error('Run via npm run verify:capture');
const npmRun=args=>execFileSync(process.execPath,[npm,...args,'--cache',join(scratch,'cache')],{encoding:'utf8'});
try {
 const packed=JSON.parse(npmRun(['pack','--ignore-scripts','--json','--pack-destination',scratch]))[0];
 const tarball=join(scratch,packed.filename);
 npmRun(['install','--prefix',scratch,'--ignore-scripts','--offline','--no-audit','--loglevel','error',tarball]);
 const {decodeCaptureEvent,readCaptureInbox}=await import(pathToFileURL(join(scratch,'node_modules','codex-tandem','dist','capture.js')));
 const fixture={schemaVersion:1,eventId:'11111111-1111-4111-8111-111111111111',kind:'turn.started',launchId:'launch_A',targetGeneration:'generation_A',sessionId:'22222222-2222-4222-8222-222222222222',turnId:'33333333-3333-4333-8333-333333333333',capturedAt:'2026-10-02T10:00:00Z'};
 assert.deepEqual(decodeCaptureEvent(Buffer.from(JSON.stringify({...fixture,prompt:'PRIVATE_SENTINEL'}))),fixture);
 writeFileSync(join(scratch,fixture.eventId+'.json'),JSON.stringify(fixture));
 writeFileSync(join(scratch,'incomplete.tmp'),'unfinished');
 assert.deepEqual(await readCaptureInbox(scratch),[fixture]);
 assert.deepEqual(await readCaptureInbox(scratch),[fixture]);
 assert.throws(()=>decodeCaptureEvent(Buffer.alloc(4097)),{message:'INVALID_CAPTURE_EVENT'});
 console.log(JSON.stringify({schemaVersion:1,platform:process.platform,node:process.version,packageSha256:createHash('sha256').update(readFileSync(tarball)).digest('hex'),result:'PASS',cases:['installed capture projection','bounded rejection','committed-only repeated snapshot'],scope:'G0 synthetic contract; no durable database receipt or full-tracking claim'},null,2));
} finally {rmSync(scratch,{recursive:true,force:true});}
