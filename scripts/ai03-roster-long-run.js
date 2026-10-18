import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {mkdirSync,writeFileSync,renameSync,existsSync,appendFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {draftRulesFor,draftParticipation} from '../src/engine/draftConference';
import {evaluateDraftContinuation} from '../src/engine/draftContinuation';
import {draftRefused} from '../src/engine/draftRules';
import {createCatcherProbe,installCatcherProbe} from './farm-catcher-diagnostics';
import {useOffseason} from '../src/hooks/useOffseason';
import {useGameState} from '../src/hooks/useGameState';
import {createInitialTeams} from '../src/engine/bootstrapTeams';
import {generateSeasonSchedule} from '../src/engine/scheduleGen';
import {createFarmCompetition} from '../src/engine/farmRecords';
import {validateFarmSaveState} from '../src/engine/farmMigration';
import {simulateSeasonBatch} from '../src/workers/seasonBatchCore';
import {loadGame,loadPlayerCareerLogById} from '../src/engine/saveload';
import {renewalEligible,ownedPlayers} from '../src/engine/renewalRules';
import {ensureDraftEvaluation,startDraftEvaluation} from '../src/engine/draftReports';
import {resolveFirstRound,chooseDraftProspect,remainingDraftSlots,registeredDraftCount} from '../src/engine/draftRules';
import {planningResumeScreen} from '../src/engine/offseasonPlanning';
import {draftPicksForTeam} from '../src/engine/offseasonResume';
import {addMarketSigning,validateMarketContract} from '../src/components/hub/faMarket';
import {getCareerEntryKey} from '../src/engine/careerStats';
import {matchHistorySnapshot} from '../src/engine/matchHistory';
import {rosterRows,rosterTransitions} from './roster-capacity-metrics';
import {releaseCompletedTransactions} from './fake-indexeddb-prune';
import {recordCareerExpectations,verifyCareerExpectations} from './roster-career-evidence';
import {validationSourceHashes,assertValidationSourcesUnchanged} from './roster-long-run-source.mjs';

// Real application hooks run in react-test-renderer. Only browser storage is
// adapted to Node (Map localStorage and fake-indexeddb); game logic is unmocked.
let view,current,restoreRandom,validationSources,restoreDecisionTrace;
const measurements=[];
const snapshot=gs=>({teams:gs.teams,year:gs.year,saveId:gs.saveId,myId:gs.myId,gameDay:gs.gameDay,
 screen:gs.screen,faPool:gs.faPool,faYears:gs.faYears,news:gs.getNewsBySelector(),mailbox:gs.getMailboxBySelector(),
 seasonHistory:gs.getSeasonHistory(),schedule:gs.schedule,...gs.getMatchHistorySnapshot(),
 ...(gs.farmCompetition?{farmCompetition:gs.farmCompetition,farmCompetitionVersion:1}:{}),offseasonPlan:gs.offseasonPlan});
function adopt(s) {
 act(()=>{
  const gs=current.gs;gs.applyProgressCandidate(s);gs.setSchedule(s.schedule);
  gs.hydrateLargeSaveData(s);gs.hydrateMatchHistory(s);gs.setFaPool(s.faPool||[]);gs.setFaYears(s.faYears||{});
  gs.setOffseasonPlan(s.offseasonPlan||null);gs.setScreen(s.screen||'qa_harness');gs.setIsAutoSaveSuspended(true);
  gs.markSaveDirty(['seasonHistory','news','mailbox','matchHistory']);
 });
}
function mount(initial) {
 if(view)act(()=>view.unmount());
 function Harness() {
  const gs=useGameState();current={gs,os:useOffseason(gs),get s(){return snapshot(gs);}};return null;
 }
 act(()=>{view=create(React.createElement(Harness));});adopt(initial);
}
function patch(n){adopt({...current.s,...n});}
function integrity(s) {
 const owned=s.teams.flatMap(ownedPlayers),ids=owned.map(p=>p.id);
 expect(new Set(ids).size).toBe(ids.length);
 expect(s.faPool.every(p=>!ids.includes(p.id))).toBe(true);
 for(const t of s.teams) {
  expect(registeredDraftCount(t)).toBeLessThanOrEqual(70);
  expect(Number.isFinite(t.budget)).toBe(true);
  for(const p of ownedPlayers(t)) {
   expect(Number.isFinite(p.salary)).toBe(true);expect(p.salary).toBeGreaterThan(0);
   expect(Number.isInteger(p.contractYearsLeft)).toBe(true);expect(p.contractYearsLeft).toBeGreaterThanOrEqual(0);
  }
 }
 validateFarmSaveState(s);
}
async function checkpoint(label,rows) {
 assertValidationSourcesUnchanged(validationSources);
 const before=current.s;integrity(before);
 const persistedPlan=before.offseasonPlan&&{...before.offseasonPlan,resumeScreen:before.screen};
 let result;await act(async()=>{result=await current.gs.handleSave({silent:true,payload:{offseasonPlan:persistedPlan}});});
 expect(result.ok,`${label}: save`).toBe(true);
 const loaded=await loadGame();expect(loaded,`${label}: load`).toBeTruthy();integrity(loaded);
 expect(loaded.year).toBe(before.year);expect(loaded.gameDay).toBe(before.gameDay);
 expect(loaded.teams.map(t=>ownedPlayers(t).map(p=>[p.id,p.salary,p.contractYearsLeft,p.contractSignedYear])))
  .toEqual(before.teams.map(t=>ownedPlayers(t).map(p=>[p.id,p.salary,p.contractYearsLeft,p.contractSignedYear])));
 expect(loaded.teams.map(t=>(t.history||[]).map(p=>[p.id,p.exitYear,p.exitReason])))
  .toEqual(before.teams.map(t=>(t.history||[]).map(p=>[p.id,p.exitYear,p.exitReason])));
 expect(loaded.farmCompetition).toEqual(before.farmCompetition);
 expect(loaded.seasonHistory).toEqual(before.seasonHistory);
 // JSON persistence canonically removes undefined and normalizes numeric -0.
 expect(loaded.offseasonPlan).toEqual(JSON.parse(JSON.stringify(persistedPlan)));
 if(persistedPlan)expect(planningResumeScreen(loaded.offseasonPlan,loaded.year,loaded.myId)).toBe(before.screen);
 rows.push({phase:label,year:loaded.year,gameDay:loaded.gameDay,owned:loaded.teams.map(t=>ownedPlayers(t).length),registered:loaded.teams.map(registeredDraftCount),
  releasedAdapterTransactions:releaseCompletedTransactions(indexedDB)});
 mount({...loaded,screen:loaded.offseasonPlan?.resumeScreen||before.screen});
 globalThis.gc?.();
}
function saveEvidence(){
 if(!measurements.length)return;
 const dir=process.env.ROSTER_LONG_EVIDENCE||'/tmp/roster-long-evidence';mkdirSync(dir,{recursive:true});
 assertValidationSourcesUnchanged(validationSources);const sources=validationSources;
 const path=`${dir}/seed-${measurements[0].seed}.json`;
 writeFileSync(`${path}.tmp`,JSON.stringify({base:process.env.ROSTER_LONG_BASE,variant:process.env.ROSTER_LONG_VARIANT,sources,environment:'Real application hooks + 143-game season batch + farm synchronization; fake-indexeddb/Map localStorage; postseason tournament bypassed; user renews all remaining players, releases1 and signs at most1 FA, delegates draft; no engine mocks',seeds:measurements})+'\n');renameSync(`${path}.tmp`,path);
}
afterEach(()=>{if(view)act(()=>view.unmount());view=null;restoreRandom?.();restoreRandom=null;restoreDecisionTrace?.();restoreDecisionTrace=null;vi.restoreAllMocks();vi.unstubAllGlobals();saveEvidence();});

export function registerRosterLongRun(seed,years=Number(process.env.ROSTER_LONG_YEARS)||10) {
it(`QA-D1: seed ${seed} targets ${years} generated seasons with offseason save/reload`,async()=>{
 validationSources=validationSourceHashes();
 const audit=[];
 const tracePath=resolve('src/engine/cpuDecisionTrace.js');
 if(existsSync(tracePath)){
  const {subscribeCpuDecisions}=await import(/* @vite-ignore */ tracePath);
  const dir=process.env.ROSTER_LONG_EVIDENCE||'/tmp/roster-long-evidence';mkdirSync(dir,{recursive:true});
  const file=`${dir}/decisions-${seed}.jsonl`;writeFileSync(file,'');
  const unsubscribe=subscribeCpuDecisions(event=>{audit.push(event);appendFileSync(file,JSON.stringify(event)+'\n');});
  restoreDecisionTrace=unsubscribe;
 }
 // A non-recording RNG adapter avoids retaining millions of mock call records.
 let random=seed;const originalRandom=Math.random;restoreRandom=()=>{Math.random=originalRandom;};
 Math.random=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};
 const storage=new Map();vi.stubGlobal('localStorage',{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k),clear:()=>storage.clear()});
 vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('IDBKeyRange',IDBKeyRange);
 const teams=createInitialTeams(),year=2026,saveId=`qa-d1-${seed}`;
 mount({teams,year,saveId,myId:0,gameDay:1,screen:'qa_harness',faPool:[],faYears:{},news:[],mailbox:[],
  seasonHistory:{awards:[],records:{},hallOfFame:[],championships:[],standingsHistory:[],transfers:[]},
  schedule:generateSeasonSchedule(year,teams),gameResultsMap:{},allTeamResultsMap:{},allTeamBoxScoresMap:{},scheduleArchive:[],
  farmCompetition:createFarmCompetition({teams,year,saveId}),farmCompetitionVersion:1,offseasonPlan:null});
 const catcherProbe=process.env.FARM_CATCHER_DIAGNOSE==='1'?createCatcherProbe(seed):null;
 if(catcherProbe)installCatcherProbe(vi,catcherProbe);
 const catcherPhase=label=>catcherProbe?.phase(label,current.s);
 const continuousIds=new Set(ownedPlayers(teams[0]).map(p=>p.id)),careerExpectations=new Map();
 let rookieIds=new Set();
 const row={seed,years,status:'in-progress',initial:rosterRows(current.s),seasons:[],checkpoints:[]};measurements.push(row);
 for(let season=0;season<years;season++) {
  const y=current.s.year,started=performance.now(),phases={start:rosterRows(current.s,rookieIds)},events=[];
  let previous=phases.start;
  const recordPhase=name=>{const next=rosterRows(current.s,rookieIds);events.push(...rosterTransitions(previous,next,current.s,name));previous=next;phases[name]=next;return next;};
  catcherPhase('season-start');
  // Split at 72 to prove real midseason serialization, then run to round 143.
  for(const count of [72,71]) {
   const r=simulateSeasonBatch({snapshot:current.s,count,autoManageMyTeam:true});
   const merge=(old,part)=>Object.fromEntries([...new Set([...Object.keys(old||{}),...Object.keys(part||{})])].map(k=>[k,{...old?.[k],...part?.[k]}]));
   patch({...r.nextState,gameResultsMap:{...current.s.gameResultsMap,...r.gameResultsMapPatch},allTeamResultsMap:merge(current.s.allTeamResultsMap,r.allTeamResultsPatch),allTeamBoxScoresMap:merge(current.s.allTeamBoxScoresMap,r.allTeamBoxScoresPatch)});
   expect(current.s.gameDay).toBe(count===72?73:144);
   if(count===72)await checkpoint('midseason',row.checkpoints);
  }
  const finished=current.s,seasonEnd=recordPhase('seasonEnd');integrity(finished);
  expect(finished.teams.map(t=>t.wins+t.losses+(t.draws||0))).toEqual(Array(12).fill(143));
  expect(finished.farmCompetition.nextRound).toBe(144);
  const playedCards=finished.farmCompetition.cards.filter(c=>c.status==='played').length;
  const unplayed=finished.farmCompetition.cards.filter(c=>c.status==='unplayed');
  const farmReasons=unplayed.flatMap(c=>c.reasons||[]).reduce((a,r)=>(a[r.code||r.reason||JSON.stringify(r)]=(a[r.code||r.reason||JSON.stringify(r)]||0)+1,a),{});
  catcherPhase('season-end');
  patch({screen:'retire_phase'});
  await act(async()=>{expect(await current.os.handleRetirePhaseNext({})).toBe(true);});
  catcherPhase('cpu-renewal-retirement-fa');recordPhase('renewal');
  expect(current.s.screen).toBe('offseason_planning');
  patch({offseasonPlan:{...current.s.offseasonPlan,stage:'open'}});
  if(seed===20261015)await checkpoint('renewal-open',row.checkpoints);
  // One real expiring farm player is released each year; all other expiring
  // contracts use the normal accepted-contract callback at the demanded salary.
  const release=current.gs.myTeam.farm.find(p=>renewalEligible(p,y));
  if(release)act(()=>expect(current.os.handlePlanningRelease(release.id)).toBe(true));
  const releasedId=release?.id;
  for(const p of ownedPlayers(current.gs.myTeam).filter(p=>renewalEligible(p,y))) {
   const salary=Math.max(p.育成?240:440,current.s.offseasonPlan.demands?.[p.id]?.demandSalary||p.salary);
   act(()=>current.os.handleContractRenewalSign(p.id,salary,1,0,0));
  }
  if(seed===20261015)await checkpoint('renewal-signed-release',row.checkpoints);
  catcherPhase('user-renewal-release');
  const candidate=current.s.faPool.find(p=>p.id!==releasedId&&!p.育成&&validateMarketContract({team:current.gs.myTeam,pool:current.s.faPool,player:p,salary:p.salary,years:1,gameDay:1})===null);
  let faSigned=null;
  if(candidate) {
   const budget=current.gs.myTeam.budget;
   act(()=>{current.gs.upd(0,t=>addMarketSigning(t,candidate,candidate.salary,1,y,'offseason'));current.gs.setFaPool(pool=>pool.filter(p=>p.id!==candidate.id));});
   expect(current.gs.myTeam.budget).toBe(budget-candidate.salary);faSigned=candidate.id;
   expect(ownedPlayers(current.gs.myTeam).find(p=>p.id===faSigned)).toMatchObject({isFA:false,contractSignedYear:y,contractYearsLeft:1});
  }
  if(seed===20261015)await checkpoint('FA-complete',row.checkpoints);
  catcherPhase('user-fa-signing');
  act(()=>expect(current.os.handlePlanningFinish()).toBe(true));
  catcherPhase('planning-complete');recordPhase('market');phases.marketRemaining=current.s.faPool.length;
  expect(current.s.screen).toBe('waiver_result');
  if(releasedId)expect(ownedPlayers(current.gs.myTeam).some(p=>p.id===releasedId)).toBe(false);
  if(seed===20261015)await checkpoint('waiver-results',row.checkpoints);
  const pool=current.s.offseasonPlan.draftPool;expect(pool.length).toBeGreaterThanOrEqual(80);
  const evaluation=startDraftEvaluation(ensureDraftEvaluation({teams:current.s.teams,pool,year:y,myId:0}),pool);
  const order=[...current.s.teams].sort((a,b)=>a.wins-b.wins),drafted={},log=[],decisions=[];
  const rules=current.s.offseasonPlan.draftRules,context={rules,teams:order,evaluation,year:y,draftPool:pool};
  const first=resolveFirstRound(order,pool,context),endedTeams={...first.endedTeams};
  for(const [tid,p] of Object.entries(first.picks)){
   const team=order.find(t=>String(t.id)===tid),decision=evaluateDraftContinuation(team,pool,1,[],context).decisions.find(d=>d.id===p.id);
   drafted[p.id]=Number(tid);log.unshift({round:1,team:Number(tid),player:p.id});decisions.push({teamId:Number(tid),round:1,id:p.id,pos:p.pos,...decision});
  }
  for(let round=2;round<=draftRulesFor(rules).maxPicks;round++)for(const team of order) {
   const available=pool.filter(p=>!Object.hasOwn(drafted,p.id)),ctx={...context,drafted,log,endedTeams};
   if(!draftParticipation(team,pool,drafted,ctx).eligible)continue;
   const continuation=evaluateDraftContinuation(team,available,round,draftPicksForTeam(pool,drafted,team.id),ctx);
   const p=chooseDraftProspect(team,available,round,draftPicksForTeam(pool,drafted,team.id),ctx);
   if(!p){endedTeams[team.id]=continuation.reason;continue;}
   const refused=draftRefused(p,team.id===0);drafted[p.id]=refused?'refused':team.id;
   log.unshift({round,team:team.id,player:p.id,...(refused?{refused:true}:{})});
   decisions.push({teamId:team.id,round,id:p.id,pos:p.pos,refused,...continuation.decisions.find(d=>d.id===p.id)});
  }
  for(const team of order)endedTeams[team.id]??=draftParticipation(team,pool,drafted,{...context,drafted,log,endedTeams}).reason??'no-upgrade';
  patch({screen:'draft_review',offseasonPlan:{...current.s.offseasonPlan,draftEvaluation:evaluation,draftViews:{...current.s.offseasonPlan.draftViews,draft:{drafted,log,endedTeams}},draftResult:{pool,drafted}}});
  if(seed===20261015)await checkpoint('draft-review',row.checkpoints);
  act(()=>expect(current.os.handleDraftComplete(pool,drafted)).toBe(true));
  catcherPhase('draft-complete');recordPhase('draft');
  rookieIds=new Set(pool.filter(p=>drafted[p.id]!=='refused'&&(drafted[p.id]!=null||p._drafted)).map(p=>p.id));
  integrity(current.s);expect(current.s.screen).toBe('spring_training');
  await checkpoint('camp',row.checkpoints);
  act(()=>expect(current.os.handleDraftComplete(pool,drafted)).toBe(false));
  recordCareerExpectations(careerExpectations,current.gs.myTeam,y);
  const contracts=new Map(current.s.teams.flatMap(ownedPlayers).map(p=>[p.id,{years:p.contractYearsLeft,signed:p.contractSignedYear,age:p.age,salary:p.salary}]));
  await act(async()=>{expect(await current.os.handleSpringTrainingComplete()).toBe(true);});
  expect(current.s.year).toBe(y+1);expect(current.s.gameDay).toBe(1);expect(current.s.screen).toBe('new_season');
  catcherPhase('year-advanced');
  expect(current.s.seasonHistory.farmArchives).toHaveLength(season+1);
  expect(current.s.scheduleArchive.some(a=>a.year===y)).toBe(true);
  for(const p of current.s.teams.flatMap(ownedPlayers)) {
   const old=contracts.get(p.id);expect(p.age).toBe(old.age+1);expect(p.salary).toBe(old.salary);
   expect(p.contractYearsLeft).toBe(old.signed===y?old.years:Math.max(0,old.years-1));
   if(p.recentCareerLog?.length)expect(new Set(p.recentCareerLog.map(getCareerEntryKey)).size).toBe(p.recentCareerLog.length);
  }
  await checkpoint('new-season',row.checkpoints);
  await act(async()=>{expect(await current.os.handleSpringTrainingComplete()).toBe(false);});
  events.push(...rosterTransitions(previous,rosterRows(current.s,rookieIds),{...current.s,year:y},'year-advance'));
  globalThis.gc?.();
  const seasonRow={year:y,cpuDecisions:audit.splice(0),phases,events,seasonEnd,afterOffseason:rosterRows(current.s,rookieIds),decisions,endedTeams,marketRemaining:current.s.faPool.length,officialGamesPerTeam:143,elapsedMs:Math.round(performance.now()-started),memory:process.memoryUsage(),farmCards:{played:playedCards,unplayed:unplayed.length,reasons:farmReasons},candidateCount:pool.length,firstNominationRounds:first.rounds.length,picks:Object.keys(drafted).length,faSigned,releasedId,registered:current.s.teams.map(registeredDraftCount),archives:current.s.seasonHistory.farmArchives.length};
  for(const id of continuousIds)if(!ownedPlayers(current.gs.myTeam).some(p=>p.id===id))continuousIds.delete(id);
  row.seasons.push(seasonRow);saveEvidence();console.log('QA-D1 season',seed,y,'ms',seasonRow.elapsedMs,'farm unplayed',unplayed.length);
 }
 // A continuously owned farm-only player need not have a first-team row every
 // year. Verify every continuing player's actual archive years, not one
 // arbitrarily selected survivor with an assumed ten first-team appearances.
 expect(continuousIds.size).toBeGreaterThan(0);
 row.careerValidation=await verifyCareerExpectations([...continuousIds],careerExpectations,
  id=>loadPlayerCareerLogById(id,current.s.saveId),2026,years);
 expect(row.careerValidation).toHaveLength(continuousIds.size);
 expect(current.s.year).toBe(2026+years);expect(current.s.seasonHistory.awards).toHaveLength(years);expect(current.s.seasonHistory.standingsHistory).toHaveLength(years);
 row.status='passed';saveEvidence();
},3600000);
}
