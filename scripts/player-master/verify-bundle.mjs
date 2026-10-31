import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {compilePlayerMaster,comparePlayerMasters} from '../../src/data/playerMasterSchema.js';

// Read-only: validate a candidate and report changes before replacing the bundle.
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){
 if(!['--input','--compare'].includes(args[i])||!args[i+1])throw Error('Usage: node scripts/player-master/verify-bundle.mjs [--input file] [--compare previous-file]');
 options[args[i]]=args[i+1];
}
const bytes=await readFile(options['--input']||'src/data/playerMaster2026.release.json','utf8');
const master=JSON.parse(bytes);
const rosters=compilePlayerMaster(master,{publicationDecision:master.publicationDecision});
const report={asOf:master.asOf,sha256:createHash('sha256').update(bytes).digest('hex'),bytes:Buffer.byteLength(bytes),
 players:master.players.length,uniqueIds:new Set(master.players.map(p=>p.playerId)).size,
 historyRows:master.players.reduce((n,p)=>n+p.history.length,0),
 unconfirmedSources:master.sources.filter(s=>s.redistribution==='unconfirmed').length,
 publicationDecision:master.publicationDecision,
 teams:Object.entries(rosters).map(([teamId,r])=>{const p=[...r.batters,...r.pitchers];return {teamId:Number(teamId),controlled:p.filter(p=>!p.isIkusei).length,development:p.filter(p=>p.isIkusei).length};})};
if(options['--compare'])report.diff=comparePlayerMasters(JSON.parse(await readFile(options['--compare'],'utf8')),master);
console.log(JSON.stringify(report,null,2));
