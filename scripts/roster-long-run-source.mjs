import {readdirSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

// Freeze all application source, not only direct imports of the harness.
export function validationSourceHashes(root=process.cwd()){
 const paths=[];
 const walk=path=>{for(const e of readdirSync(resolve(root,path),{withFileTypes:true})){
  const p=join(path,e.name);if(e.isDirectory())walk(p);else if(e.isFile())paths.push(p);
 }};walk('src');
 paths.push('package.json','package-lock.json',...['roster-capacity-long-run.js','roster-capacity-metrics.js','roster-career-evidence.js','fake-indexeddb-prune.js','roster-long-run-source.mjs','run-roster-long-run.mjs'].map(p=>`scripts/${p}`));
 for(const name of ['ai03-roster-long-run.js','run-ai03-long-run.mjs'])paths.push(`scripts/${name}`);
 const result={};for(const path of paths.sort()){
  try{result[path]=createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex');}
  catch(e){if(e.code!=='ENOENT')throw e;result[path]=null;}
 }
 result['@runtime/node']=process.version;
 for(const name of ['fake-indexeddb','react','react-test-renderer','vitest']){
  try{result[`@runtime/${name}`]=JSON.parse(readFileSync(resolve(root,`node_modules/${name}/package.json`))).version;}
  catch(e){if(e.code!=='ENOENT')throw e;result[`@runtime/${name}`]=null;}
 }return result;
}
export function assertValidationSourcesUnchanged(frozen,root=process.cwd()){
 assert.deepEqual(validationSourceHashes(root),frozen,'validation source changed during execution');
}
