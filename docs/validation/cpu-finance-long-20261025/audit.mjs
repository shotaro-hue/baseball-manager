import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {summarizeAi03} from '../../../scripts/ai03-summary.mjs';
import {summarizeRookieCohorts} from '../../../scripts/summarize-farm-opportunities.mjs';
import {validationSourceHashes} from '../../../scripts/roster-long-run-source.mjs';
import {TEAM_DEFS} from '../../../src/constants.js';

if(!process.argv[2])throw Error('Usage: node docs/validation/cpu-finance-long-20261025/audit.mjs rawRoot [outputDir]');
const rawRoot=resolve(process.argv[2]),repo=resolve(import.meta.dirname,'../../..');
const output=resolve(process.argv[3]??import.meta.dirname);
const main='632a19c7ef51fe36ace02ee3a855f6cc33ff5454';
const mainTree='ae32cdb87000a33e5f99c302cd3add759e6ad20c';
// Pin the observed main source, so rerunning on future code cannot silently
// label different production logic as this 2026-10-25 measurement.
const expectedSources=JSON.parse(readFileSync(resolve(import.meta.dirname,'source-snapshot-20261015.json'))).sources;
assert.deepEqual(validationSourceHashes(repo),expectedSources);
const seeds=[20261015,20261016,20261017],runs=[],artifacts=[],annual=[],decisionStreams=[];
const sum=o=>Object.values(o).reduce((a,b)=>a+b,0);
const sha=b=>createHash('sha256').update(b).digest('hex');
const range=v=>({count:v.length,min:Math.min(...v),max:Math.max(...v),mean:v.reduce((a,b)=>a+b,0)/v.length});
const controlled=club=>club.playerUsage.filter(p=>!p.development);
const catchers=club=>controlled(club).filter(p=>!p.isPitcher&&p.pos==='捕手').length;
const phases={},checks={completedRuns:0,completedSeasons:0,financeClubSeasons:0,cpuBudgetFormulaChecks:0,
  rosterPhaseChecks:0,checkpoints:0,firstTeamGames:0,farmPlayed:0,farmUnplayed:0,aboveTargetDraftChecks:0};
let sources,localCommit;
mkdirSync(output,{recursive:true});
function retain(name,bytes){writeFileSync(resolve(output,name),bytes);artifacts.push({name,bytes:bytes.length,sha256:sha(bytes)});}
for(const seed of seeds){
  const dir=resolve(rawRoot,`seed-${seed}`),read=name=>readFileSync(resolve(dir,name));
  const data=JSON.parse(read(`seed-${seed}.json`)),run=data.seeds[0];
  const completion=JSON.parse(read(`completion-${seed}.json`)),vitest=JSON.parse(read(`vitest-${seed}.json`));
  const snapshot=JSON.parse(read(`source-snapshot-${seed}.json`));
  assert.equal(completion.exitCode,0,`${seed}: process exit`);assert.equal(completion.signal,null);
  assert.equal(vitest.success,true);assert.equal(vitest.numPassedTests,1);assert.equal(vitest.numFailedTests,0);
  assert.equal(vitest.numFailedTestSuites,0);assert.equal(data.seeds.length,1);
  assert.equal(run.seed,seed);assert.equal(run.years,10);assert.equal(run.status,'passed');
  assert.deepEqual(run.seasons.map(s=>s.year),Array.from({length:10},(_,i)=>2026+i));
  assert.equal(completion.variant,'finance-current');assert.equal(data.variant,completion.variant);
  assert.equal(data.base,completion.sourceCommit);assert.equal(data.base,snapshot.sourceCommit);
  sources??=data.sources;localCommit??=data.base;
  assert.deepEqual(data.sources,expectedSources);assert.deepEqual(data.sources,sources);assert.deepEqual(snapshot.sources,sources);
  assert.deepEqual(validationSourceHashes(repo),sources);
  const canonical=run.seasons.flatMap(s=>s.cpuDecisions).map(e=>JSON.stringify(e));
  const streamed=read(`decisions-${seed}.jsonl`).toString().trimEnd().split('\n').map(line=>JSON.stringify(JSON.parse(line)));
  let cursor=0;
  for(const event of streamed){
    while(cursor<canonical.length&&canonical[cursor]!==event)cursor++;
    assert.ok(cursor<canonical.length,`${seed}: streamed decision is not canonical or is out of order`);
    cursor++;
  }
  decisionStreams.push({seed,canonicalSource:`seed-${seed}.json:seasons[].cpuDecisions`,
    canonicalCount:canonical.length,streamedCount:streamed.length,omittedCount:canonical.length-streamed.length,
    complete:canonical.length===streamed.length,orderedCorrespondence:true});
  assert.ok(run.careerValidation.length>0);
  for(const career of run.careerValidation)assert.deepEqual(career.recordedYears,career.expectedYears);
  checks.completedRuns++;checks.checkpoints+=run.checkpoints.length;
  for(const season of run.seasons){
    checks.completedSeasons++;
    assert.equal(season.officialGamesPerTeam,143);assert.equal(season.financial.length,12);
    checks.firstTeamGames+=858;checks.farmPlayed+=season.farmCards.played;checks.farmUnplayed+=season.farmCards.unplayed;
    assert.equal(season.farmCards.played,858);assert.equal(season.farmCards.unplayed,0);
    for(const phase of ['midseason','camp','new-season'])assert.ok(run.checkpoints.some(c=>
      c.phase===phase&&c.year===season.year+Number(phase==='new-season')));
    const allPhases={...Object.fromEntries(Object.entries(season.phases).filter(([,v])=>Array.isArray(v))),
      afterOffseason:season.afterOffseason};
    for(const [phase,clubs] of Object.entries(allPhases)){
      assert.deepEqual(clubs.map(t=>t.id).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i));
      const ids=clubs.flatMap(t=>t.playerUsage.map(p=>p.id));assert.equal(new Set(ids).size,ids.length);
      for(const club of clubs){
        checks.rosterPhaseChecks++;
        assert.equal(controlled(club).length,club.controlled);assert.ok(club.controlled<=70);
        assert.ok(Number.isFinite(club.budget)&&club.budget>=0);
        assert.ok(club.playerUsage.every(p=>Number.isFinite(p.salary)&&p.salary>0));
        assert.equal(club.payroll,club.playerUsage.reduce((n,p)=>n+p.salary,0));
        if(club.id!==0)(phases[phase]??=[]).push({seed,year:season.year,teamId:club.id,catchers:catchers(club)});
      }
    }
    for(const d of season.decisions.filter(d=>d.teamId!==0&&d.projectedCount>67)){
      checks.aboveTargetDraftChecks++;
      assert.ok(['operating-shortage','catcher-depth-shortage','current-upgrade','future-upgrade'].includes(d.rosterReason));
      if(d.rosterReason==='current-upgrade')assert.ok(d.current>=50&&d.current>=d.currentBaseline+20);
      if(d.rosterReason==='future-upgrade')assert.ok(d.future>=60&&d.future>=d.futureBaseline+20);
    }
    for(const f of season.financial){
      checks.financeClubSeasons++;
      assert.equal(f.year,season.year);assert.equal(f.homeGames+f.awayGames,143);
      assert.deepEqual([...f.postedRounds].sort((a,b)=>a-b),Array.from({length:143},(_,i)=>i+1));
      assert.equal(f.revenue,sum(f.income),`${seed}/${season.year}/team${f.teamId}: income totals`);assert.equal(f.operatingSurplus,f.revenue-sum(f.costs));
      for(const k of ['sponsor','broadcast','membership'])assert.equal(f.income[k],f.annual[k]);
      assert.equal(f.costs.fixed,f.annual.fixedCost);
      const end=season.seasonEnd.find(t=>t.id===f.teamId),next=season.afterOffseason.find(t=>t.id===f.teamId);
      assert.equal(f.budget,end.budget);
      const base=TEAM_DEFS.find(t=>t.id===f.teamId).budget;
      if(f.teamId!==0){
        checks.cpuBudgetFormulaChecks++;
        assert.equal(next.budget,Math.max(Math.round(base*.5),Math.round(base+Math.round(f.operatingSurplus*.6)-next.payroll)),
          `${seed}/${season.year}/team${f.teamId}: next-year budget`);
        assert.ok(catchers(next)>=6);
        for(const pos of ['捕手','一塁手','二塁手','三塁手','遊撃手','左翼手','中堅手','右翼手'])
          assert.ok(controlled(next).some(p=>!p.isPitcher&&p.pos===pos));
      }
      const picks=season.decisions.filter(d=>d.teamId===f.teamId);
      annual.push({seed,year:season.year,teamId:f.teamId,homeGames:f.homeGames,revenue:f.revenue,
        operatingCosts:sum(f.costs),operatingSurplusBeforePlayerPayroll:f.operatingSurplus,
        seasonEndContractPayroll:end.payroll,salarySubtractedReference:f.operatingSurplus-end.payroll,
        seasonEndBudget:f.budget,nextYearBudget:next.budget,nextYearContractPayroll:next.payroll,
        nextYearBudgetAtFloor:next.budget===Math.round(base*.5),controlled:next.controlled,
        catchers:catchers(next),pitchers:next.pitchers,nominations:picks.length,accepted:picks.filter(d=>!d.refused).length});
    }
  }
  runs.push(run);
  for(const name of [`seed-${seed}.json`,`decisions-${seed}.jsonl`])retain(`${name}.gz`,gzipSync(read(name),{level:9}));
  retain(`seed-${seed}.log.gz`,gzipSync(readFileSync(resolve(rawRoot,`seed-${seed}.log`)),{level:9}));
  for(const name of [`source-snapshot-${seed}.json`,`completion-${seed}.json`,`vitest-${seed}.json`])retain(name,read(name));
}
const cpu=summarizeAi03(runs),rookies=summarizeRookieCohorts(runs),cpuAnnual=annual.filter(r=>r.teamId!==0);
// Keep isolated later-year zeroes visible too; the no-consecutive-zero
// acceptance criterion must not be read as an every-player/every-year promise.
const laterYearZeroOpportunities=[];
for(const run of runs)for(const season of run.seasons)for(const drafted of season.decisions.filter(d=>d.teamId!==0&&!d.refused)){
  for(const later of run.seasons.filter(s=>s.year>season.year+1))for(const team of later.seasonEnd.filter(t=>t.id!==0)){
    const p=team.playerUsage.find(p=>p.id===drafted.id);
    if(p&&[p.PA,p.BF,p.farmPA,p.farmBF].every(v=>v===0))laterYearZeroOpportunities.push({seed:run.seed,
      draftedYear:season.year,originalTeamId:drafted.teamId,year:later.year,teamId:team.id,...p});
  }
}
assert.equal(checks.completedSeasons,30);assert.equal(checks.financeClubSeasons,360);
assert.equal(cpu.cpuClubSeasons,330);assert.equal(checks.cpuBudgetFormulaChecks,330);
assert.equal(rookies.cpuFirstYearZero,0);assert.equal(rookies.cpuAnyMultipleYearZero,0);
const byYear=Array.from({length:10},(_,i)=>2026+i).map(year=>{
  const rows=cpuAnnual.filter(r=>r.year===year),fields=['revenue','operatingSurplusBeforePlayerPayroll',
    'seasonEndContractPayroll','nextYearContractPayroll','nextYearBudget','catchers','pitchers','nominations'];
  return {year,cpuClubSeasons:rows.length,atBudgetFloor:rows.filter(r=>r.nextYearBudgetAtFloor).length,
    seventy:rows.filter(r=>r.controlled===70).length,...Object.fromEntries(fields.map(k=>[k,range(rows.map(r=>r[k]))]))};
});
const result={status:'passed',date:'2026-10-25',mainCommit:main,mainTree,localSourceCommit:localCommit,
  auditSourceHashes:Object.fromEntries([import.meta.filename,resolve(repo,'scripts/ai03-summary.mjs'),
    resolve(repo,'scripts/summarize-farm-opportunities.mjs')].map(path=>[path.replace(`${repo}/`,''),sha(readFileSync(path))])),
  scope:'Current-main CPU and finance diagnostic; three seeds x ten generated seasons, real hooks and season engine.',
  units:'万円',seeds,years:{start:2026,end:2035},checks,
  cpu:{...cpu,annual:undefined,cohorts:undefined},rookies,laterYearZeroOpportunities,
  decisionEvidence:{canonical:'full seed JSON seasons[].cpuDecisions',supplementalStreams:decisionStreams},
  catcherPhases:Object.fromEntries(Object.entries(phases).map(([p,rows])=>[p,{...range(rows.map(r=>r.catchers)),
    belowSix:rows.filter(r=>r.catchers<6),aboveNine:rows.filter(r=>r.catchers>9)}])),
  finance:{revenue:range(annual.map(r=>r.revenue)),operatingSurplusBeforePlayerPayroll:range(annual.map(r=>r.operatingSurplusBeforePlayerPayroll)),
    cpuNextYearBudget:range(cpuAnnual.map(r=>r.nextYearBudget)),cpuNextYearContractPayroll:range(cpuAnnual.map(r=>r.nextYearContractPayroll)),
    cpuBudgetAtFloor:cpuAnnual.filter(r=>r.nextYearBudgetAtFloor).length},byYear,artifacts,
  limitations:['React hooks and real engine with fake-indexeddb / Map localStorage; no App UI, native-browser capacity or real iPhone acceptance.',
    'Existing harness bypasses postseason tournament and prize income; fixed user renewal/release/FA/delegated-draft policy.',
    'Existing harness does not adopt App/Worker immutable batted-ball receipts; no claim of complete archive-chain coverage.',
    'Final-year rookies have no following season; career DB final checks cover continuously owned user players, not every CPU career.',
    'Historical AI-03 used older finance and code; these are current-state observations, not a controlled improvement comparison.',
    'Budget is a spending envelope, not cash. Operating surplus excludes player payroll; salary-subtracted reference is not a cash settlement.']};
writeFileSync(resolve(output,'results.json'),JSON.stringify(result,null,2)+'\n');
const keys=Object.keys(annual[0]);
writeFileSync(resolve(output,'annual-clubs.csv'),[keys.join(','),...annual.map(r=>keys.map(k=>r[k]).join(','))].join('\n')+'\n');
console.log(JSON.stringify({...result,artifacts:undefined,byYear:undefined,cpu:{...result.cpu,decisionCounts:undefined},
  catcherPhases:Object.fromEntries(Object.entries(result.catcherPhases).map(([p,r])=>[p,{...r,belowSix:r.belowSix.length,aboveNine:r.aboveNine.length}]))},null,2));
