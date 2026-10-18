import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { assertCompletedVitestLog } from './roster-long-run-log.mjs';
import { combineCompletedCapture } from './roster-completion-capture.mjs';

const opportunity = p => {
  const values = [p.PA, p.BF, p.farmPA, p.farmBF];
  assert.ok(values.every(v => Number.isFinite(v) && v >= 0),
    `opportunity measurement missing or invalid: ${p.id}`);
  return values.reduce((sum, value) => sum + value, 0);
};
const distribution = values => {
  const v = [...values].sort((a,b) => a-b);
  return v.length ? { count: v.length, min: v[0], p10: v[Math.floor((v.length-1)*.1)],
    median: v[Math.floor((v.length-1)*.5)], p90: v[Math.floor((v.length-1)*.9)], max: v.at(-1),
    mean: v.reduce((a,b) => a+b,0)/v.length } : null;
};
const histogram = values => values.reduce((r,v) => (r[v ?? 'unrecorded'] = (r[v ?? 'unrecorded'] || 0)+1,r), {});

export function summarizeRookieCohorts(runs) {
  const firstYears = [], prolongedCpuPlayers = [];
  let cpuCohortsWithFollowingYear=0, cpuFirstYearZero=0, cpuMultipleYearZero=0, cpuLongestZero=0,
    cpuAnyMultipleYearZero=0, cpuLongestAnyZero=0;
  for (const run of runs) for (const season of run.seasons) for (const draft of season.decisions.filter(d => d.teamId !== 0 && !d.refused)) {
    const observed = run.seasons.filter(s => s.year > season.year).map(s => {
      for (const team of s.seasonEnd) {
        const p = team.playerUsage.find(p => p.id === draft.id);
        if (p) return { year:s.year, owned:true, teamId:team.id, ...p, opportunity:opportunity(p) };
      }
      return { year:s.year, owned:false };
    });
    if (!observed.length) continue; // Final draft has no following season.
    const zero = p => p.owned && p.teamId !== 0 && p.opportunity === 0;
    if (observed[0].owned && observed[0].teamId !== 0) {
      cpuCohortsWithFollowingYear++; firstYears.push(observed[0]);
    }
    let initial=0, streak=0, longest=0;
    for (const p of observed) { if (!zero(p)) break; initial++; }
    for (const p of observed) { streak=zero(p)?streak+1:0; longest=Math.max(longest,streak); }
    cpuFirstYearZero+=Number(initial>0); cpuMultipleYearZero+=Number(initial>=2);
    cpuAnyMultipleYearZero+=Number(longest>=2);
    cpuLongestZero=Math.max(cpuLongestZero,initial); cpuLongestAnyZero=Math.max(cpuLongestAnyZero,longest);
    if (longest>=2) prolongedCpuPlayers.push({ seed:run.seed, draftYear:season.year, ...draft, initialZeroSeasons:initial, longestZeroSeasons:longest, observed });
  }
  return { cpuCohortsWithFollowingYear,cpuFirstYearZero,cpuMultipleYearZero,cpuLongestZero,
    cpuAnyMultipleYearZero,cpuLongestAnyZero,prolongedCpuPlayers,
    firstYearBatterPA:distribution(firstYears.filter(p=>!p.isPitcher).map(p=>(p.PA||0)+p.farmPA)),
    firstYearPitcherBF:distribution(firstYears.filter(p=>p.isPitcher).map(p=>(p.BF||0)+p.farmBF)) };
}

export function loadOpportunityRuns(root, variant) {
  const snapshot=JSON.parse(readFileSync(`${root}/${variant}-source-snapshot.json`));
  return [20261015,20261016,20261017].map(seed => {
    const log=gunzipSync(readFileSync(`${root}/${variant}-${seed}.log.gz`)).toString();
    assertCompletedVitestLog(log,1);
    const raw=gunzipSync(readFileSync(`${root}/${variant}-${seed}.json.gz`));
    const data=JSON.parse(raw),run=data.seeds[0];
    if(existsSync(`${root}/${variant}-${seed}.completion.json`)) {
      const prefix=gunzipSync(readFileSync(`${root}/${variant}-${seed}.file-prefix.log.gz`)).toString();
      assert.throws(()=>assertCompletedVitestLog(prefix,1),'supplemented prefix must remain explicitly incomplete');
      assert.equal(log,combineCompletedCapture(prefix,JSON.parse(readFileSync(`${root}/${variant}-${seed}.completion.json`)),raw));
    }
    assert.equal(data.base,snapshot.sourceCommit); assert.deepEqual(data.sources,snapshot.sources);
    assert.equal(data.variant,variant); assert.equal(data.seeds.length,1); assert.equal(run.seed,seed);
    assert.equal(run.status,'passed'); assert.equal(run.years,10);
    assert.deepEqual(run.seasons.map(s=>s.year),Array.from({length:10},(_,i)=>2026+i));
    assert.ok(run.careerValidation?.length>0);
    for(const c of run.careerValidation)assert.deepEqual(c.recordedYears,c.expectedYears);
    for(const s of run.seasons){
      assert.equal(s.officialGamesPerTeam,143);
      if(variant==='after')for(const d of s.decisions.filter(d=>d.teamId!==0&&d.projectedCount>67)){
        assert.ok(['operating-shortage','catcher-depth-shortage','current-upgrade','future-upgrade'].includes(d.rosterReason),
          'above-target CPU draft reason missing or invalid');
        if(d.rosterReason==='current-upgrade')assert.ok(d.current>=50&&d.current>=d.currentBaseline+20,
          'above-target current upgrade lacks the required 20-point improvement');
        if(d.rosterReason==='future-upgrade')assert.ok(d.future>=60&&d.future>=d.futureBaseline+20,
          'above-target future upgrade lacks the required 20-point improvement');
      }
      for(const phase of ['midseason','camp','new-season'])assert.ok(run.checkpoints.some(c=>c.phase===phase&&c.year===s.year+Number(phase==='new-season')));
      for(const teams of [s.seasonEnd,s.afterOffseason,...Object.values(s.phases).filter(Array.isArray)]){
        assert.deepEqual(teams.map(t=>t.id).sort((a,b)=>a-b),Array.from({length:12},(_,i)=>i));
        const ids=teams.flatMap(t=>t.playerUsage.map(p=>p.id));assert.equal(new Set(ids).size,ids.length);
        for(const t of teams){assert.ok(t.controlled<=70);assert.equal(t.controlled,t.playerUsage.filter(p=>!p.development).length);assert.ok(Number.isFinite(t.budget));
          for(const p of t.playerUsage)opportunity(p);
        }
      }
    }
    return run;
  });
}

export function buildOpportunityComparison(root='docs/validation/roster-planning-65/farm-opportunities') {
  const historical='docs/validation/roster-planning-65/ten-year';
  const variants={main:loadOpportunityRuns(historical,'before'),previous:loadOpportunityRuns(historical,'after'),after:loadOpportunityRuns(root,'after')};
  const summaries={},rows=[];
  for(const [variant,runs] of Object.entries(variants)){
    const cohorts=summarizeRookieCohorts(runs),seasons=runs.flatMap(r=>r.seasons),ends=seasons.flatMap(s=>s.afterOffseason.filter(t=>t.id!==0));
    const claims=seasons.flatMap(s=>s.phases.market.filter(t=>t.id!==0).flatMap(t=>t.marketClaims));
    const picks=seasons.flatMap(s=>s.decisions.filter(d=>d.teamId!==0));
    let longestZeroPick=0;
    for(const r of runs)for(let teamId=1;teamId<12;teamId++){
      let n=0;for(const s of r.seasons){n=s.decisions.some(d=>d.teamId===teamId)?0:n+1;longestZeroPick=Math.max(longestZeroPick,n);}
    }
    for(const r of runs)for(const s of r.seasons)for(const t of s.afterOffseason){
      const ps=s.decisions.filter(d=>d.teamId===t.id),market=s.phases.market.find(c=>c.id===t.id).marketClaims;
      const usage=s.seasonEnd.find(c=>c.id===t.id).playerUsage.filter(p=>p.rookie);
      const controlled=t.playerUsage.filter(p=>!p.development),opening=s.phases.start.find(c=>c.id===t.id);
      const positionCounts=Object.fromEntries([['firstBase','一塁手'],['secondBase','二塁手'],['thirdBase','三塁手'],
        ['shortStop','遊撃手'],['leftField','左翼手'],['centerField','中堅手'],['rightField','右翼手'],['designatedHitters','DH']]
        .map(([key,pos])=>[key,controlled.filter(p=>!p.isPitcher&&p.pos===pos).length]));
      rows.push({variant,seed:r.seed,year:s.year,teamId:t.id,controlled:t.controlled,pitchers:t.pitchers,batters:t.controlled-t.pitchers,
        catchers:t.playerUsage.filter(p=>!p.development&&!p.isPitcher&&p.pos==='捕手').length,
        ...positionCounts,development:t.development,openingControlled:opening.controlled,openingPitchers:opening.pitchers,
        openingBatters:opening.controlled-opening.pitchers,
        openingCatchers:opening.playerUsage.filter(p=>!p.development&&!p.isPitcher&&p.pos==='捕手').length,
        nominations:ps.length,accepted:ps.filter(d=>!d.refused).length,refused:ps.filter(d=>d.refused).length,endReason:s.endedTeams[t.id]??null,
        faCount:market.length,faSalary:market.reduce((n,c)=>n+c.salary,0),payroll:t.payroll,budget:t.budget,
        rookieCount:usage.length,rookieZeroCount:usage.filter(p=>opportunity(p)===0).length,
        rookieBatterPA:usage.filter(p=>!p.isPitcher).reduce((n,p)=>n+(p.PA||0)+p.farmPA,0),
        rookieActivePA:usage.filter(p=>!p.isPitcher).reduce((n,p)=>n+p.PA,0),
        rookieFarmPA:usage.filter(p=>!p.isPitcher).reduce((n,p)=>n+p.farmPA,0),
        rookiePitcherBF:usage.filter(p=>p.isPitcher).reduce((n,p)=>n+(p.BF||0)+p.farmBF,0),
        rookieActiveBF:usage.filter(p=>p.isPitcher).reduce((n,p)=>n+p.BF,0),
        rookieFarmBF:usage.filter(p=>p.isPitcher).reduce((n,p)=>n+p.farmBF,0),
        departures:s.events.filter(e=>e.teamId===t.id&&e.type==='departure').length,
        arrivals:s.events.filter(e=>e.teamId===t.id&&e.type==='arrival').length,
        conversions:s.events.filter(e=>e.teamId===t.id&&e.type==='conversion').length,farmUnplayed:s.farmCards.unplayed});
    }
    summaries[variant]={...cohorts,completedSeasons:seasons.length,checkpoints:runs.reduce((n,r)=>n+r.checkpoints.length,0),
      controlled:histogram(ends.map(t=>t.controlled)),catchers:distribution(ends.map(t=>t.playerUsage.filter(p=>!p.development&&!p.isPitcher&&p.pos==='捕手').length)),
      pitchers:distribution(ends.map(t=>t.pitchers)),faCount:claims.length,faSalary:claims.reduce((n,c)=>n+c.salary,0),faReasons:histogram(claims.map(c=>c.reason)),
      picks:picks.length,accepted:picks.filter(d=>!d.refused).length,refused:picks.filter(d=>d.refused).length,longestZeroPick,
      aboveTargetReasons:histogram(picks.filter(d=>d.projectedCount>67).map(d=>d.rosterReason)),
      aboveTargetCurrentGain:distribution(picks.filter(d=>d.projectedCount>67&&d.rosterReason==='current-upgrade').map(d=>d.current-d.currentBaseline)),
      aboveTargetFutureGain:distribution(picks.filter(d=>d.projectedCount>67&&d.rosterReason==='future-upgrade').map(d=>d.future-d.futureBaseline)),
      aboveTargetFutureWithoutYoungPeer:picks.filter(d=>d.projectedCount>67&&d.rosterReason==='future-upgrade'&&d.futureBaseline===0).length,
      payroll:distribution(ends.map(t=>t.payroll)),budget:distribution(ends.map(t=>t.budget)),negativeBudgets:ends.filter(t=>t.budget<0).length,
      farmUnplayed:seasons.reduce((n,s)=>n+s.farmCards.unplayed,0),
      elapsedMs:seasons.reduce((n,s)=>n+s.elapsedMs,0),rss:distribution(seasons.map(s=>s.memory.rss)),
      movements:histogram(seasons.flatMap(s=>s.events).map(e=>e.type)),departureReasons:histogram(seasons.flatMap(s=>s.events).filter(e=>e.type==='departure').map(e=>e.reason))};
  }
  const blockingReasons=[];
  if(summaries.after.cpuAnyMultipleYearZero)blockingReasons.push('CPU cohorts have consecutive zero-opportunity seasons');
  if(summaries.after.farmUnplayed)blockingReasons.push('Farm cards were unplayed');
  if(summaries.after.negativeBudgets)blockingReasons.push('CPU budgets were negative');
  if(summaries.after.catchers.min<6)blockingReasons.push('Controlled catcher depth fell below six');
  const result={status:'completed',acceptance:{status:blockingReasons.length?'failed':'passed',blockingReasons},summaries,limitations:['Postseason tournaments bypassed; full App/playoff/prize-income journey unverified',
    'Absent players and user-owned seasons do not count as CPU zero opportunities','Final draft cohort has no following season in the period',
    'Draft IDs and RNG trajectories differ; compare cohorts and distributions rather than paired win rates']};
  writeFileSync(`${root}/opportunity-comparison.json`,JSON.stringify(result,null,2)+'\n');
  const keys=Object.keys(rows[0]),csv=value=>value==null?'':JSON.stringify(String(value));
  writeFileSync(`${root}/annual-club-comparison.csv`,[keys.join(','),...rows.map(r=>keys.map(k=>csv(r[k])).join(','))].join('\n')+'\n');
  const main=summaries.main,previous=summaries.previous,after=summaries.after;
  const metrics=[['翌年を観測したCPU指名選手',s=>s.cpuCohortsWithFollowingYear],['初年度の出場0',s=>s.cpuFirstYearZero],
    ['初年度から複数年連続0',s=>s.cpuMultipleYearZero],['途中年からも含む複数年連続0',s=>s.cpuAnyMultipleYearZero],
    ['最長連続0（途中年含む）',s=>s.cpuLongestAnyZero],['野手初年度PA P10／中央値',s=>`${s.firstYearBatterPA.p10}／${s.firstYearBatterPA.median}`],
    ['投手初年度BF 最少／P10／中央値',s=>`${s.firstYearPitcherBF.min}／${s.firstYearPitcherBF.p10}／${s.firstYearPitcherBF.median}`],
    ['CPU指名数',s=>s.picks],['CPU指名0最長継続',s=>s.longestZeroPick],['CPU市場獲得数',s=>s.faCount],
    ['CPU市場支出（万円）',s=>s.faSalary],['CPU支配下分布',s=>JSON.stringify(s.controlled)],
    ['CPU捕手 最少～最多',s=>`${s.catchers.min}～${s.catchers.max}`],['CPU投手 最少～最多',s=>`${s.pitchers.min}～${s.pitchers.max}`],
    ['CPU予算負値',s=>s.negativeBudgets],['二軍未実施カード',s=>s.farmUnplayed],['保存・再開',s=>s.checkpoints]];
  const average=(rs,k)=>rs.reduce((n,r)=>n+r[k],0)/rs.length;
  const lines=['# 二軍育成起用の3シード×10年比較','',
    `実行：完了。受入検査：${result.acceptance.status==='passed'?'合格':'不合格'}。${blockingReasons.length?blockingReasons.join('; '):'対象範囲の検査条件を満たす。完全Appの10年旅程を認定するものではない。'}`,'',
    'main・旧PR・修正版の各30年度を完了。CPUは各年度3シード×11球団。PA/BFは一軍＋二軍、出場0は両方0。',
    '初年度だけでなく、その後に始まる連続0も追跡する。途中退団・所在不明・自球団所属をCPUの出場0へ置換しない。','',
    '|項目|main|旧PR|修正版|','|---|---:|---:|---:|',
    ...metrics.map(([label,value])=>`|${label}|${value(main)}|${value(previous)}|${value(after)}|`),'',
    '## 年度別のCPU編成・指名','',
    '各セルは main／旧PR／修正後。各年度のCPUは33球団年度。支配下は年度末オフシーズン完了後。','',
    '|年度|平均支配下|70人球団|平均指名|指名0|',
    '|---|---:|---:|---:|---:|'];
  for(let year=2026;year<=2035;year++){
    const annual=['main','previous','after'].map(variant=>rows.filter(r=>r.variant===variant&&r.year===year&&r.teamId!==0));
    const values=fn=>annual.map(fn).join('／');
    lines.push(`|${year}|${values(rs=>average(rs,'controlled').toFixed(2))}|${values(rs=>rs.filter(r=>r.controlled===70).length)}|${values(rs=>average(rs,'nominations').toFixed(2))}|${values(rs=>rs.filter(r=>!r.nominations).length)}|`);
  }
  lines.push('','## 年度別の修正版CPU出場量・財務','','年俸・予算・FA支出は万円。出場量は前年指名コホートの選手単位。','',
    '|年度|捕手 最少～最多|野手PA P10／中央値|投手BF P10／中央値|市場人数／支出|平均年俸総額|平均予算|',
    '|---|---:|---:|---:|---:|---:|---:|');
  for(let year=2026;year<=2035;year++){
    const annual=rows.filter(r=>r.variant==='after'&&r.year===year&&r.teamId!==0);
    const rookies=variants.after.flatMap(r=>r.seasons.filter(s=>s.year===year).flatMap(s=>s.seasonEnd.filter(t=>t.id!==0).flatMap(t=>t.playerUsage.filter(p=>p.rookie))));
    const pa=distribution(rookies.filter(p=>!p.isPitcher).map(p=>(p.PA||0)+p.farmPA)),bf=distribution(rookies.filter(p=>p.isPitcher).map(p=>(p.BF||0)+p.farmBF));
    lines.push(`|${year}|${Math.min(...annual.map(r=>r.catchers))}～${Math.max(...annual.map(r=>r.catchers))}|${pa?`${pa.p10}／${pa.median}`:'対象なし'}|${bf?`${bf.p10}／${bf.median}`:'対象なし'}|${annual.reduce((n,r)=>n+r.faCount,0)}／${annual.reduce((n,r)=>n+r.faSalary,0)}|${average(annual,'payroll').toFixed(0)}|${average(annual,'budget').toFixed(0)}|`);
  }
  lines.push('','## 67人超の指名理由','',`修正版：${JSON.stringify(after.aboveTargetReasons)}。`,
    '人数・評価差の定数を変えず、例外理由が許可された種類であることを全該当指名で検査する。','',
    '全12球団・3版・各30年度の1,080行は annual-club-comparison.csv、分布・個別の連続0追跡・財務・異動は opportunity-comparison.json。','',
    'ポストシーズン大会を迂回し、最終2035年指名の翌年度は期間外。詳細な判断・未検証項目は README.md。','');
  writeFileSync(`${root}/comparison.md`,lines.join('\n'));
  return result;
}

export function retainOpportunityEvidence(raw,root,remoteEquivalentCommit,diagnosticDir,checkDir) {
  const snapshot=JSON.parse(readFileSync(`${raw}/source-snapshot.json`));
  snapshot.seeds=[20261015,20261016,20261017];
  if(remoteEquivalentCommit)snapshot.remoteEquivalentCommit=remoteEquivalentCommit;
  const artifacts=[];
  mkdirSync(root,{recursive:true});
  const retain=(path,bytes)=>{
    writeFileSync(`${root}/${path}`,bytes);
    artifacts.push({path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  };
  for(const seed of snapshot.seeds){
    const bytes=readFileSync(`${raw}/seed-${seed}.json`),data=JSON.parse(bytes);
    assert.equal(data.base,snapshot.sourceCommit);assert.deepEqual(data.sources,snapshot.sources);
    assert.equal(data.seeds[0].status,'passed');assert.equal(data.seeds[0].seasons.length,10);
    let log=readFileSync(`${raw}/seed-${seed}.log`);
    if(existsSync(`${raw}/seed-${seed}.completion.json`)){
      const receipt=readFileSync(`${raw}/seed-${seed}.completion.json`);
      assert.throws(()=>assertCompletedVitestLog(log.toString(),1),'supplemented prefix must remain explicitly incomplete');
      const combined=combineCompletedCapture(log.toString(),JSON.parse(receipt),bytes);
      retain(`after-${seed}.file-prefix.log.gz`,gzipSync(log,{level:9,mtime:0}));
      retain(`after-${seed}.completion.json`,receipt);
      log=Buffer.from(combined);
    }
    assertCompletedVitestLog(log.toString(),1);
    retain(`after-${seed}.json.gz`,gzipSync(bytes,{level:9,mtime:0}));
    retain(`after-${seed}.log.gz`,gzipSync(log,{level:9,mtime:0}));
  }
  retain('after-source-snapshot.json',Buffer.from(JSON.stringify(snapshot,null,2)+'\n'));
  retain('original-roster.json.gz',readFileSync(`${root}/original-roster.json.gz`));
  if(diagnosticDir){
    const bytes=readFileSync(`${diagnosticDir}/seed-20261016.json`),diagnostic=JSON.parse(bytes),run=diagnostic.seeds[0];
    assert.equal(diagnostic.base,snapshot.sourceCommit);assert.deepEqual(diagnostic.sources,snapshot.sources);
    assert.equal(run.status,'passed');assert.equal(run.seasons.length,3);
    const full=JSON.parse(readFileSync(`${raw}/seed-20261016.json`)).seeds[0];
    const comparable=s=>({year:s.year,phases:s.phases,events:s.events,seasonEnd:s.seasonEnd,afterOffseason:s.afterOffseason,
      decisions:s.decisions,endedTeams:s.endedTeams,farmCards:s.farmCards,registered:s.registered,picks:s.picks});
    assert.deepEqual(run.seasons.map(comparable),full.seasons.slice(0,3).map(comparable));
    const log=readFileSync(`${diagnosticDir}/probe.log`);assertCompletedVitestLog(log.toString(),1);
    const trace=readFileSync(`${diagnosticDir}/single-year-zero-probe.json`),probe=JSON.parse(trace);
    const days=probe.farmDays.filter(d=>d.year===2028),official=probe.officialDays.filter(d=>d.year===2028);
    assert.equal(days.length,143);assert.equal(official.length,143);
    const review={id:probe.id,seed:probe.seed,year:2028,prefixMatches:true,diagnosticYears:3,
      healthyGames:days.filter(d=>!d.injury).length,injuredGames:days.filter(d=>d.injury>0).length,
      activeGames:days.filter(d=>d.active).length,farmGames:days.filter(d=>d.farm).length,
      farmStarts:days.filter(d=>d.selected).length,officialBatEvents:official.reduce((n,d)=>n+d.actualBatEvents,0),
      followingYears:full.seasons.filter(s=>s.year>=2029).map(s=>({year:s.year,
        usage:s.seasonEnd.flatMap(t=>t.playerUsage).find(p=>p.id===probe.id)??null}))};
    retain('single-year-zero-review.json',Buffer.from(JSON.stringify(review,null,2)+'\n'));
    retain('single-year-zero-probe.json.gz',gzipSync(trace,{level:9,mtime:0}));
    retain('single-year-zero-run.json.gz',gzipSync(bytes,{level:9,mtime:0}));
    retain('single-year-zero.log.gz',gzipSync(log,{level:9,mtime:0}));
  }
  if(checkDir)for(const name of ['farm-replay-red','farm-replay-green','farm-opportunity-unit','farm-opportunity-build','farm-opportunity-tools',
    'management-rollover-red','management-rollover-green-sequential','opportunity-missing-red','opportunity-margin-red','opportunity-tools-final',
    'cpu-opportunity-red-expanded','cpu-opportunity-green','cpu-opportunity-catcher-green','cpu-opportunity-build','opportunity-capture-green']){
    retain(`${name}.log.gz`,gzipSync(readFileSync(`${checkDir}/${name}.log`),{level:9,mtime:0}));
  }
  writeFileSync(`${root}/evidence-manifest.json`,JSON.stringify({artifacts},null,2)+'\n');
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==='--fixture'){
    const probe=JSON.parse(readFileSync(process.argv[3])),snapshot=probe.snapshots.find(s=>s.year===2027&&s.team.id===5);
    assert.equal(probe.seed,20261016);assert.ok(snapshot.team.farm.some(p=>p.id==='fh42yrh'));
    const root=process.argv[4]||'docs/validation/roster-planning-65/farm-opportunities';mkdirSync(root,{recursive:true});
    writeFileSync(`${root}/original-roster.json.gz`,gzipSync(Buffer.from(JSON.stringify({seed:probe.seed,
      sourceCommit:'8bc5b0ed28ded9a17292356ceaa4e7a56424cfa4',target:'fh42yrh',...snapshot})+'\n'),{level:9,mtime:0}));
    console.log('Retained the actual pre-fix 2027 opening roster for deterministic replay.');
  }else{
  let root=process.argv[2];
  if(root==='--retain'){
    root=process.argv[4]||'docs/validation/roster-planning-65/farm-opportunities';
    retainOpportunityEvidence(process.argv[3],root,process.argv[5],process.argv[6],process.argv[7]);
  }
  const r=buildOpportunityComparison(root);
  console.log(JSON.stringify(Object.fromEntries(Object.entries(r.summaries).map(([v,s])=>[v,{cohorts:s.cpuCohortsWithFollowingYear,
    firstZero:s.cpuFirstYearZero,multipleZero:s.cpuMultipleYearZero,anyMultipleZero:s.cpuAnyMultipleYearZero,
    longest:s.cpuLongestAnyZero,PA:s.firstYearBatterPA,BF:s.firstYearPitcherBF,controlled:s.controlled,
    catchers:s.catchers,fa:s.faCount,picks:s.picks,zeroPick:s.longestZeroPick,unplayed:s.farmUnplayed}]))));
  }
}
