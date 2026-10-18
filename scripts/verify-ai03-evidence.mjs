import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const dir=resolve(process.argv[2]||'docs/validation/ai-03/final');
const metadata=existsSync(join(dir,'comparison.json'))?readFileSync(join(dir,'comparison.json')):gunzipSync(readFileSync(join(dir,'comparison.json.gz')));
const summary=JSON.parse(metadata);
assert.equal(summary.status,'complete-six-ten-year-runs');
function verifyArtifacts(root,artifacts){for(const artifact of artifacts){
 const path=resolve(root,artifact.name);assert.ok(path.startsWith(root+'/'));
 const bytes=readFileSync(path);assert.equal(bytes.length,artifact.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),artifact.sha256);
}}
verifyArtifacts(dir,summary.artifacts);
const calibration=resolve(dir,'../calibration');
if(existsSync(join(calibration,'manifest.json')))verifyArtifacts(calibration,JSON.parse(readFileSync(join(calibration,'manifest.json'))));
const workspace=mkdtempSync(join(tmpdir(),'verify-ai03-'));
try{
 for(const variant of ['before','after']){
  const target=join(workspace,variant);mkdirSync(target);
  for(const artifact of summary.artifacts.filter(a=>a.name.startsWith(variant+'-'))){
   const name=artifact.name.slice(variant.length+1);
   if(name.endsWith('.json.gz'))writeFileSync(join(target,(/^\d+\.json\.gz$/.test(name)?'seed-':'')+name.slice(0,-3)),gunzipSync(readFileSync(join(dir,artifact.name))));
   else if(name.endsWith('.json')||name.endsWith('.tar.gz'))writeFileSync(join(target,name),readFileSync(join(dir,artifact.name)));
  }
 }
 execFileSync(process.execPath,[resolve('scripts/summarize-ai03.mjs'),join(workspace,'before'),join(workspace,'after'),join(workspace,'recomputed')],{stdio:'pipe',maxBuffer:8*1024*1024});
 const recomputed=JSON.parse(readFileSync(join(workspace,'recomputed/comparison.json')));
 assert.deepEqual(recomputed.variants,summary.variants,'retained summary differs from raw ten-year results');
 for(const name of ['comparison.md','annual-clubs.csv'])assert.equal(readFileSync(join(dir,name),'utf8'),readFileSync(join(workspace,'recomputed',name),'utf8'),`${name} differs from raw results`);
 console.log('AI-03: six completed ten-year runs, source hashes, actual exits, safety, career assertions and quantitative comparison verified.');
}finally{rmSync(workspace,{recursive:true,force:true});}
