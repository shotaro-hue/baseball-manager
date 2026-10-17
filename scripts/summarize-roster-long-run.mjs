import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const args=process.argv.slice(2),partial=args[0]==='--partial';if(partial)args.shift();
const [beforeDir,afterDir,outputDir,beforeLog,afterLog]=args;
if(!beforeDir||!afterDir||!outputDir)throw Error('Usage: [--partial] beforeDir afterDir outputDir beforeLog afterLog');
const seeds=[20261015,20261016,20261017],artifacts=[],summaries={};
const histogram=values=>values.reduce((a,k)=>(a[k??'unrecorded']=(a[k??'unrecorded']||0)+1,a),{});
const range=values=>values.length?{min:Math.min(...values),max:Math.max(...values),mean:values.reduce((a,n)=>a+n,0)/values.length}:null;
for(const [variant,dir,logPath]of [['before',beforeDir,beforeLog],['after',afterDir,afterLog]]) {
 if(!partial){const log=readFileSync(logPath,'utf8');assert.match(log,/Test Files\s+3 passed \(3\)/);assert.match(log,/Tests\s+3 passed \(3\)/);assert.doesNotMatch(log,/Unhandled Errors|Worker exited unexpectedly|FATAL ERROR|Failed Tests/);}
 const snapshot=JSON.parse(readFileSync(`${dir}/source-snapshot.json`)),runs=[];
 for(const seed of seeds) {
  const path=`${dir}/seed-${seed}.json`;if(partial&&!existsSync(path))continue;
  const bytes=readFileSync(path),data=JSON.parse(bytes),run=data.seeds[0];assert.equal(data.base,snapshot.sourceCommit);
  assert.deepEqual(data.sources,snapshot.sources);
  if(!partial){assert.equal(run.status,'passed');assert.equal(run.years,10);assert.equal(run.seasons.length,10);assert.deepEqual(run.seasons.map(s=>s.year),Array.from({length:10},(_,i)=>2026+i));}
  for(const season of run.seasons) {
   assert.equal(season.officialGamesPerTeam,143);assert.ok(Array.isArray(season.events));
   for(const phase of ['midseason','camp','new-season'])assert.ok(run.checkpoints.some(c=>c.phase===phase&&c.year===season.year+Number(phase==='new-season')));
   for(const clubs of [season.seasonEnd,season.afterOffseason,...Object.values(season.phases).filter(Array.isArray)]) {
    const ids=clubs.flatMap(t=>t.playerUsage.map(p=>p.id));assert.equal(new Set(ids).size,ids.length);
    for(const t of clubs){assert.ok(t.controlled<=70);assert.equal(t.controlled,t.playerUsage.filter(p=>!p.development).length);assert.ok(Number.isFinite(t.budget));}
   }
   if(variant==='after')for(const d of season.decisions.filter(d=>d.teamId!==0&&d.projectedCount>67))assert.ok(['operating-shortage','current-upgrade','future-upgrade'].includes(d.rosterReason));
  }
  runs.push(run);artifacts.push({path:`${variant}-${seed}.json.gz`,bytes:gzipSync(bytes,{level:9,mtime:0})});
 }
 const seasons=runs.flatMap(r=>r.seasons),ends=seasons.flatMap(s=>s.afterOffseason.filter(t=>t.id!==0)),picks=seasons.flatMap(s=>s.decisions.filter(d=>d.teamId!==0));
 const usage=seasons.flatMap(s=>s.seasonEnd.flatMap(t=>t.playerUsage)),rookies=usage.filter(p=>p.rookie),events=seasons.flatMap(s=>s.events);
 const claims=seasons.flatMap(s=>s.phases.market.flatMap(t=>t.marketClaims));
 const opportunity=p=>(p.PA??0)+(p.BF??0)+p.farmPA+p.farmBF;
 summaries[variant]={sourceCommit:snapshot.sourceCommit,completedSeasons:seasons.length,checkpoints:runs.reduce((n,r)=>n+r.checkpoints.length,0),
  initialControlled:range(runs.flatMap(r=>r.initial.map(t=>t.controlled))),initialPitchers:range(runs.flatMap(r=>r.initial.map(t=>t.pitchers))),
  cpuOpeningControlled:range(seasons.flatMap(s=>s.phases.start.filter(t=>t.id!==0).map(t=>t.controlled))),cpuAfterOffseasonControlled:range(ends.map(t=>t.controlled)),cpuAfterOffseasonDistribution:histogram(ends.map(t=>t.controlled)),
  cpuCatchers:range(ends.map(t=>t.catchers)),cpuPitchers:range(ends.map(t=>t.pitchers)),cpuMeanAges:range(ends.map(t=>t.ageMean)),
  cpuPicksPerClubSeason:range(seasons.flatMap(s=>s.afterOffseason.filter(t=>t.id!==0).map(t=>s.decisions.filter(d=>d.teamId===t.id).length))),cpuCatcherPicks:picks.filter(d=>d.pos==='捕手').length,
  contingencyDraftReasons:histogram(picks.filter(d=>d.projectedCount>67).map(d=>d.rosterReason)),cpuEndReasons:histogram(seasons.flatMap(s=>Object.entries(s.endedTeams).filter(([id])=>id!=='0').map(([,v])=>v))),
  faAcquisitions:claims.length,faReasons:histogram(claims.map(p=>p.reason)),events:histogram(events.map(e=>e.type)),departureReasons:histogram(events.filter(e=>e.type==='departure').map(e=>e.reason)),
  rookiePlayerSeasons:rookies.length,rookieSeasonsWithOpportunity:rookies.filter(p=>opportunity(p)>0).length,rookieSeasonsWithZeroOpportunity:rookies.filter(p=>opportunity(p)===0).length,
  rookieBatterPA:range(rookies.filter(p=>!p.isPitcher).map(p=>(p.PA??0)+p.farmPA)),rookiePitcherBF:range(rookies.filter(p=>p.isPitcher).map(p=>(p.BF??0)+p.farmBF)),
  unplayedFarmCards:seasons.reduce((n,s)=>n+s.farmCards.unplayed,0),budget:range(ends.map(t=>t.budget)),negativeBudgetClubSeasons:ends.filter(t=>t.budget<0).length,payroll:range(ends.map(t=>t.payroll)),marketRemaining:range(seasons.map(s=>s.marketRemaining)),
  memoryRss:range(seasons.map(s=>s.memory.rss)),elapsedMs:seasons.reduce((n,s)=>n+s.elapsedMs,0),
  perSeed:runs.map(r=>({seed:r.seed,years:r.seasons.length,checkpoints:r.checkpoints.length,annual:r.seasons.map(s=>({year:s.year,controlled:s.registered,catchers:s.afterOffseason.map(t=>t.catchers),picks:s.picks,farmUnplayed:s.farmCards.unplayed,marketRemaining:s.marketRemaining}))}))};
 artifacts.push({path:`${variant}-source-snapshot.json`,bytes:Buffer.from(JSON.stringify(snapshot,null,2)+'\n')});
}
if(!partial){assert.equal(summaries.before.completedSeasons,30);assert.equal(summaries.after.completedSeasons,30);}
mkdirSync(outputDir,{recursive:true});for(const artifact of artifacts)writeFileSync(`${outputDir}/${artifact.path}`,artifact.bytes);
const result={status:partial?'partial-not-a-ten-year-pass':'passed',generatedAt:new Date().toISOString(),summaries,
 limitations:['Postseason tournament bypassed; not a full ten-year App/playoff/prize-income journey','RNG and initial IDs change; not a paired win-rate improvement','Rookies mean accepted previous-draft cohort; missing departure causes remain null'],
 artifacts:artifacts.map(a=>({path:a.path,bytes:a.bytes.length,sha256:createHash('sha256').update(a.bytes).digest('hex')}))};
writeFileSync(`${outputDir}/long-run-summary.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,summaries}));
