import {mkdir,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {validationSourceHashes} from './roster-long-run-source.mjs';
const variant=process.argv[2]||'after',evidence=resolve(process.argv[3]||`/tmp/roster-${variant}`);
const seeds=process.argv[4]?[Number(process.argv[4])]:[20261015,20261016,20261017];
if(!seeds.every(Number.isInteger))throw Error('seed must be an integer');
const workspace=resolve('.superpowers/validation/ai03-roster-long-run');await mkdir(workspace,{recursive:true});await mkdir(evidence,{recursive:true});
await writeFile(resolve('.superpowers/.gitignore'),'*\n');
const files=[];for(const seed of seeds){const file=resolve(workspace,`seed-${seed}.test.js`);await writeFile(file,`import {registerRosterLongRun} from ${JSON.stringify(resolve('scripts/ai03-roster-long-run.js'))};\nregisterRosterLongRun(${seed});\n`);files.push(file);}
const config=resolve(workspace,'vitest.config.mjs');await writeFile(config,`export default {esbuild:{jsx:'automatic'},test:{globals:true,environment:'node',pool:'forks',poolOptions:{forks:{execArgv:['--expose-gc','--max-old-space-size=2300']}},include:['.superpowers/validation/ai03-roster-long-run/*.test.js'],testTimeout:3600000}};\n`);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sources=validationSourceHashes();
await writeFile(resolve(evidence,`source-snapshot-${seeds[0]}.json`),JSON.stringify({sourceCommit,variant,seeds,sources,workers:1,heapMb:2300},null,2)+'\n');
// Finished normal adapter transactions are released after checkpoints.
// One worker per variant; before/after together have a bounded 4.6GB JS heap.
const report=resolve(evidence,`vitest-${seeds[0]}.json`);
const child=spawn(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','--config',config,'--maxWorkers=1','--minWorkers=1','--bail=1',
 '--reporter=default','--reporter=json',`--outputFile=${report}`,...files],{stdio:'inherit',env:{...process.env,ROSTER_LONG_BASE:sourceCommit,ROSTER_LONG_VARIANT:variant,ROSTER_LONG_EVIDENCE:evidence}});
process.on('SIGINT',()=>child.kill('SIGINT'));
const result=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',(code,signal)=>done({exitCode:code,signal}));});
await writeFile(resolve(evidence,`completion-${seeds[0]}.json`),JSON.stringify({sourceCommit,seeds,variant,...result,report,finishedAt:new Date().toISOString()},null,2)+'\n');
process.exitCode=result.exitCode??1;
