import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const root='docs/validation/roster-planning-65/ten-year';
const recorded=JSON.parse(readFileSync(`${root}/long-run-summary.json`));
assert.equal(recorded.status,'passed');
for(const artifact of recorded.artifacts){
 const bytes=readFileSync(`${root}/${artifact.path}`);
 assert.equal(bytes.length,artifact.bytes,artifact.path);
 assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256,artifact.path);
}
const after=JSON.parse(readFileSync(`${root}/after-source-snapshot.json`));
for(const [path,expected]of Object.entries(after.sources)){
 if(path.startsWith('@runtime/'))continue;
 assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'),expected,`frozen source differs: ${path}`);
}
const temp=mkdtempSync(join(tmpdir(),'roster-evidence-'));
try{
 for(const variant of ['before','after']){
  mkdirSync(`${temp}/${variant}`);
  writeFileSync(`${temp}/${variant}/source-snapshot.json`,readFileSync(`${root}/${variant}-source-snapshot.json`));
  for(const seed of [20261015,20261016,20261017])for(const extension of ['json','log']){
   writeFileSync(`${temp}/${variant}/seed-${seed}.${extension}`,gunzipSync(readFileSync(`${root}/${variant}-${seed}.${extension}.gz`)));
  }
 }
 const run=spawnSync(process.execPath,['scripts/summarize-roster-long-run.mjs',`${temp}/before`,`${temp}/after`,`${temp}/comparison`],{stdio:['ignore','ignore','inherit']});
 assert.equal(run.status,0,'strict aggregation failed');
 const regenerated=JSON.parse(readFileSync(`${temp}/comparison/long-run-summary.json`));
 assert.equal(regenerated.status,'passed');
 assert.deepEqual(regenerated.summaries,recorded.summaries);
 console.log('All six ten-year runs, complete logs, source hashes and annual aggregates verified. Acceptance blockers remain documented separately.');
}finally{rmSync(temp,{recursive:true,force:true});}
