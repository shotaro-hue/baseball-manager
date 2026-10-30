import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { compilePlayerMaster, comparePlayerMasters } from '../../src/data/playerMasterSchema.js';
import staging from './staging.cjs';

export function validateRosterReference(master, reference) {
  if(reference?.asOf!=='2026-03-27'||reference.scope!=='all')throw new Error('Reference date/scope mismatch');
  if(reference.status!=='verified')throw new Error('Reference must be independently verified');
  if(!Array.isArray(reference.players))throw new Error('Reference players required');
  const expected=new Map(reference.players.map(p=>[p.playerId,p]));
  if(expected.size!==reference.players.length||expected.size!==master.players.length)throw new Error('Reference population mismatch');
  for(const p of master.players) {
    const row=expected.get(p.playerId);
    if(!row||row.teamId!==p.teamId||row.registration!==p.registration)throw new Error(`Reference identity/team/registration mismatch: ${p.playerId}`);
    expected.delete(p.playerId);
  }
  if(expected.size)throw new Error('Missing reference players');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),value=key=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
    const output=staging.resolveStagingOutput(args,process.cwd());
    if(!output||!value('input')||!value('reference')||!value('report'))throw new Error('Required: --input=master.json --reference=verified-reference.json --output=/tmp/new-master.json --report=/tmp/diff.json [--previous=old-master.json]');
    const report=staging.resolveStagingOutput([`--output=${value('report')}`],process.cwd());
    if(output===report)throw new Error('Output and report paths must differ');
    const master=JSON.parse(await readFile(resolve(value('input')),'utf8'));
    const reference=JSON.parse(await readFile(resolve(value('reference')),'utf8'));
    compilePlayerMaster(master);
    validateRosterReference(master,reference);
    const previous=value('previous')?JSON.parse(await readFile(resolve(value('previous')),'utf8')):{players:[]};
    const previousById=new Map(previous.players.map(p=>[p.playerId,p]));
    for(const p of master.players) {
      const old=previousById.get(p.playerId);
      if(old&&['official','reported'].includes(old.contractStatus)&&p.contractStatus==='game-assumption')throw new Error(`Known contract would be lost: ${p.playerId}`);
    }
    const difference=comparePlayerMasters(previous,master);
    await writeFile(report,JSON.stringify({asOf:master.asOf,counts:master.teams,...difference},null,2)+'\n',{flag:'wx'});
    staging.writeStagedFile(output,JSON.stringify(master,null,2)+'\n');
    console.log(JSON.stringify({output,report,added:difference.added.length,removed:difference.removed.length,changed:difference.changed.length}));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
