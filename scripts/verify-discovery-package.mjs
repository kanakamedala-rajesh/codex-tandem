import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const scratch=mkdtempSync(join(tmpdir(),'tandem-discovery-package-'));
const npm=process.env.npm_execpath;
if(!npm) throw new Error('Run via npm run verify:discovery');
const npmRun=args=>execFileSync(process.execPath,[npm,...args,'--cache',join(scratch,'cache')],{encoding:'utf8'});
try {
 const packed=JSON.parse(npmRun(['pack','--ignore-scripts','--json','--pack-destination',scratch]))[0];
 const tarball=join(scratch,packed.filename);
 npmRun(['install','--prefix',scratch,'--ignore-scripts','--offline','--no-audit','--loglevel','error',tarball]);
 const entry=join(scratch,'node_modules','codex-tandem','dist','cli.js');
 const args=['doctor','--json','--target','local','--project-root',scratch,'--codex-home',join(scratch,'not-created'),'--codex-executable',process.execPath];
 const report=JSON.parse(execFileSync(process.execPath,[entry,...args],{encoding:'utf8'}));
 assert.equal(report.ok,true);
 assert.equal(report.targetDiscovery.fullTracking,false);
 assert.equal(report.targetDiscovery.paths.codexHomeExists,false);
 const {existsSync}=await import('node:fs');
 assert.equal(existsSync(join(scratch,'not-created')),false);
 const expectFailure=process.argv.includes('--expect-failure');
 const actualArgs=process.argv.slice(2).filter(arg=>arg!=='--expect-failure');
 const actualRun=actualArgs.length ? spawnSync(process.execPath,[entry,'doctor','--json',...actualArgs],{encoding:'utf8'}) : undefined;
 const actual=actualRun ? JSON.parse(actualRun.stdout) : undefined;
 if(actual) { assert.equal(actualRun.status,expectFailure ? 1 : 0); assert.equal(actual.ok,!expectFailure); }
 console.log(JSON.stringify({schemaVersion:1,platform:process.platform,node:process.version,packageSha256:createHash('sha256').update(readFileSync(tarball)).digest('hex'),command:'installed codex-tandem '+args.join(' '),result:report,...(actual ? {actualCommand:'installed codex-tandem doctor --json '+actualArgs.join(' '),actual} : {})},null,2));
} finally {rmSync(scratch,{recursive:true,force:true});}
