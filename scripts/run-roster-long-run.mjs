import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
const variant=process.argv[2]||'after',evidence=resolve(process.argv[3]||`/tmp/roster-${variant}`);
const seeds=process.argv[4]?[Number(process.argv[4])]:[20261015,20261016,20261017];
if(!seeds.every(Number.isInteger))throw Error('seed must be an integer');
const workspace=resolve('.superpowers/validation/roster-long-run');await mkdir(workspace,{recursive:true});await mkdir(evidence,{recursive:true});
await writeFile(resolve('.superpowers/.gitignore'),'*\n');
const files=[];for(const seed of seeds){const file=resolve(workspace,`seed-${seed}.test.js`);await writeFile(file,`import {registerRosterLongRun} from ${JSON.stringify(resolve('scripts/roster-capacity-long-run.js'))};\nregisterRosterLongRun(${seed});\n`);files.push(file);}
const config=resolve(workspace,'vitest.config.mjs');await writeFile(config,`export default {esbuild:{jsx:'automatic'},test:{globals:true,environment:'node',pool:'forks',poolOptions:{forks:{execArgv:['--expose-gc','--max-old-space-size=2300']}},include:['.superpowers/validation/roster-long-run/*.test.js'],testTimeout:3600000}};\n`);
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const sources={};for(const path of ['src/engine/initialRoster.js','src/engine/rosterPlanning.js','src/engine/draftContinuation.js','src/engine/contract.js','src/engine/realplayer.js','src/engine/playerCore.js','src/hooks/useOffseason.js','src/workers/seasonBatchCore.js','scripts/roster-capacity-long-run.js']){try{sources[path]=createHash('sha256').update(await readFile(path)).digest('hex');}catch(e){if(e.code!=='ENOENT')throw e;sources[path]=null;}}
await writeFile(resolve(evidence,'source-snapshot.json'),JSON.stringify({sourceCommit,variant,seeds,sources},null,2)+'\n');
// One worker per run: before/after together stay within the 8GB validation host.
const child=spawn(process.execPath,[resolve('node_modules/vitest/vitest.mjs'),'run','--config',config,'--maxWorkers=1','--minWorkers=1','--bail=1',...files],{stdio:'inherit',env:{...process.env,ROSTER_LONG_BASE:sourceCommit,ROSTER_LONG_VARIANT:variant,ROSTER_LONG_EVIDENCE:evidence}});
process.on('SIGINT',()=>child.kill('SIGINT'));process.exitCode=await new Promise((done,reject)=>{child.on('error',reject);child.on('exit',code=>done(code??1));});
