// Apply an explicit, dated field journal to a new output, never a saved game.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {REVIEWED_FACTS_2026} from '../../src/data/playerMaster2026Facts.js';
import {indexReviewedFacts,updateMasterFacts,REVIEWED_FACT_FIELDS} from '../../src/data/reviewedPlayerFacts.js';
import {compilePlayerMaster,comparePlayerMasters} from '../../src/data/playerMasterSchema.js';
import {validateRosterReference} from './stage.mjs';
import staging from './staging.cjs';

export function applyJournal(master,reference,index=REVIEWED_FACTS_2026,{localImport=false}={}) {
  compilePlayerMaster(master,{localImport});if(reference)validateRosterReference(master,reference);
  const updated=updateMasterFacts(master,index);
  compilePlayerMaster(updated,{localImport});if(reference)validateRosterReference(updated,reference);
  const difference=comparePlayerMasters(master,updated);
  if(difference.added.length||difference.removed.length||updated.players.some((p,i)=>p.teamId!==master.players[i].teamId||p.registration!==master.players[i].registration))throw Error('A fact journal cannot change the verified population or opening membership');
  const before=new Map(master.players.map(p=>[p.playerId,p]));
  const changedValues=updated.players.flatMap(p=>{
    const old=before.get(p.playerId),changes=Object.fromEntries(REVIEWED_FACT_FIELDS.filter(key=>!isDeepStrictEqual(old?.[key],p[key])).map(key=>[key,{before:old?.[key]??null,after:p[key]??null}]));
    return Object.keys(changes).length?[{playerId:p.playerId,name:p.name,teamId:p.teamId,changes}]:[];
  });
  return {master:updated,report:{asOf:updated.asOf,...difference,teams:updated.teams,changedValues,
    confidence:{reportedSalary:updated.players.filter(p=>p.salaryStatus==='reported').length,
      assumedSalary:updated.players.filter(p=>p.salaryStatus==='game-assumption').length,
      officialContract:updated.players.filter(p=>p.contractStatus==='official').length,
      reportedContract:updated.players.filter(p=>p.contractStatus==='reported').length,
      unknownQuota:updated.players.filter(p=>p.foreignQuotaStatus==='unknown').length}}};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args=process.argv.slice(2),value=key=>args.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
    if(!value('input')||!value('report'))throw Error('Required: --input=verified-master.json --output=/tmp/new.json --report=/tmp/diff.json [--reference=verified-reference.json] [--journal=journal.json] [--local-import]');
    const output=staging.resolveStagingOutput(args,process.cwd()),report=staging.resolveStagingOutput([`--output=${value('report')}`],process.cwd());
    if(!output||output===report)throw Error('Distinct new output and report required');
    const read=async path=>JSON.parse(await readFile(resolve(path),'utf8'));
    const index=value('journal')?indexReviewedFacts(await read(value('journal'))):REVIEWED_FACTS_2026;
    const result=applyJournal(await read(value('input')),value('reference')?await read(value('reference')):undefined,index,{localImport:args.includes('--local-import')});
    await writeFile(report,JSON.stringify(result.report,null,2)+'\n',{flag:'wx'});
    staging.writeStagedFile(output,JSON.stringify(result.master,null,2)+'\n');
    console.log(JSON.stringify({output,report,changed:result.report.changed.length,...result.report.confidence}));
  } catch(error) {console.error(error.message);process.exitCode=1;}
}
