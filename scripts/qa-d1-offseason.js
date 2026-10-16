import React from 'react';
import {act,create} from 'react-test-renderer';
import {afterEach,expect,it,vi} from 'vitest';
import {IDBFactory,IDBKeyRange} from 'fake-indexeddb';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
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

// Real application hooks run in react-test-renderer. Only browser storage is
// adapted to Node (Map localStorage and fake-indexeddb); game logic is unmocked.
let view,current,restoreRandom;
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
 const before=current.s;integrity(before);
 const persistedPlan=before.offseasonPlan&&{...before.offseasonPlan,resumeScreen:before.screen};
 let result;await act(async()=>{result=await current.gs.handleSave({silent:true,payload:{offseasonPlan:persistedPlan}});});
 expect(result.ok,`${label}: save`).toBe(true);
 const loaded=await loadGame();expect(loaded,`${label}: load`).toBeTruthy();integrity(loaded);
 expect(loaded.year).toBe(before.year);expect(loaded.gameDay).toBe(before.gameDay);
 expect(loaded.teams.map(t=>ownedPlayers(t).map(p=>[p.id,p.salary,p.contractYearsLeft,p.contractSignedYear])))
  .toEqual(before.teams.map(t=>ownedPlayers(t).map(p=>[p.id,p.salary,p.contractYearsLeft,p.contractSignedYear])));
 expect(loaded.farmCompetition).toEqual(before.farmCompetition);
 expect(loaded.seasonHistory).toEqual(before.seasonHistory);
 // JSON persistence canonically removes undefined and normalizes numeric -0.
 expect(loaded.offseasonPlan).toEqual(JSON.parse(JSON.stringify(persistedPlan)));
 if(persistedPlan)expect(planningResumeScreen(loaded.offseasonPlan,loaded.year,loaded.myId)).toBe(before.screen);
 rows.push({phase:label,year:loaded.year,gameDay:loaded.gameDay,owned:loaded.teams.map(t=>ownedPlayers(t).length),registered:loaded.teams.map(registeredDraftCount)});
 mount({...loaded,screen:loaded.offseasonPlan?.resumeScreen||before.screen});
}
function saveEvidence(){if(process.env.QA_D1_WRITE_EVIDENCE==='1')writeFileSync(`docs/validation/qa-d1/offseason-${measurements[0]?.seed}.json`,JSON.stringify({base:'a14a5c888dca3cfe07c7338482e4130290a6257b',environment:'Vitest Node; real useGameState + useOffseason in react-test-renderer; fake-indexeddb and Map localStorage; no engine/hook mocks',postseason:'Regular-season games are simulated; playoff tournament is bypassed to invoke offseason. Not full App/UI journey.',seeds:measurements},null,2)+'\n');}
afterEach(()=>{if(view)act(()=>view.unmount());view=null;restoreRandom?.();restoreRandom=null;vi.restoreAllMocks();vi.unstubAllGlobals();saveEvidence();});

export function registerOffseasonQa(seed) {
it(`QA-D1: seed ${seed} plays three generated seasons with offseason save/reload`,async()=>{
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
 const row={seed,seasons:[],checkpoints:[]};measurements.push(row);
 for(let season=0;season<3;season++) {
  const y=current.s.year,started=performance.now();
  catcherPhase('season-start');
  // Split at 72 to prove real midseason serialization, then run to round 143.
  for(const count of [72,71]) {
   const r=simulateSeasonBatch({snapshot:current.s,count,autoManageMyTeam:true});
   const merge=(old,part)=>Object.fromEntries([...new Set([...Object.keys(old||{}),...Object.keys(part||{})])].map(k=>[k,{...old?.[k],...part?.[k]}]));
   patch({...r.nextState,gameResultsMap:{...current.s.gameResultsMap,...r.gameResultsMapPatch},allTeamResultsMap:merge(current.s.allTeamResultsMap,r.allTeamResultsPatch),allTeamBoxScoresMap:merge(current.s.allTeamBoxScoresMap,r.allTeamBoxScoresPatch)});
   expect(current.s.gameDay).toBe(count===72?73:144);
   if(count===72)await checkpoint('midseason',row.checkpoints);
  }
  const finished=current.s;integrity(finished);
  expect(finished.teams.map(t=>t.wins+t.losses+(t.draws||0))).toEqual(Array(12).fill(143));
  expect(finished.farmCompetition.nextRound).toBe(144);
  const playedCards=finished.farmCompetition.cards.filter(c=>c.status==='played').length;
  const unplayed=finished.farmCompetition.cards.filter(c=>c.status==='unplayed');
  const farmReasons=unplayed.flatMap(c=>c.reasons||[]).reduce((a,r)=>(a[r.code||r.reason||JSON.stringify(r)]=(a[r.code||r.reason||JSON.stringify(r)]||0)+1,a),{});
  catcherPhase('season-end');
  patch({screen:'retire_phase'});
  await act(async()=>{expect(await current.os.handleRetirePhaseNext({})).toBe(true);});
  catcherPhase('cpu-renewal-retirement-fa');
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
  catcherPhase('planning-complete');
  expect(current.s.screen).toBe('waiver_result');
  if(releasedId)expect(ownedPlayers(current.gs.myTeam).some(p=>p.id===releasedId)).toBe(false);
  if(seed===20261015)await checkpoint('waiver-results',row.checkpoints);
  const pool=current.s.offseasonPlan.draftPool;expect(pool.length).toBeGreaterThanOrEqual(80);
  const evaluation=startDraftEvaluation(ensureDraftEvaluation({teams:current.s.teams,pool,year:y,myId:0}),pool);
  const order=[...current.s.teams].sort((a,b)=>a.wins-b.wins),drafted={};
  const first=resolveFirstRound(order,pool,{evaluation,year:y});
  for(const [tid,p] of Object.entries(first.picks))drafted[p.id]=Number(tid);
  for(let round=2;round<=6;round++)for(const team of order) {
   const available=pool.filter(p=>drafted[p.id]==null);
   if(!available.length||remainingDraftSlots(team,pool,drafted)<=0)continue;
   const p=chooseDraftProspect(team,available,round,draftPicksForTeam(pool,drafted,team.id),{evaluation,teams:order,draftPool:pool,drafted,year:y});
   drafted[p.id]=team.id;
  }
  patch({screen:'draft_review',offseasonPlan:{...current.s.offseasonPlan,draftEvaluation:evaluation,draftResult:{pool,drafted}}});
  if(seed===20261015)await checkpoint('draft-review',row.checkpoints);
  act(()=>expect(current.os.handleDraftComplete(pool,drafted)).toBe(true));
  catcherPhase('draft-complete');
  integrity(current.s);expect(current.s.screen).toBe('spring_training');
  await checkpoint('camp',row.checkpoints);
  act(()=>expect(current.os.handleDraftComplete(pool,drafted)).toBe(false));
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
  const seasonRow={year:y,officialGamesPerTeam:143,elapsedMs:Math.round(performance.now()-started),farmCards:{played:playedCards,unplayed:unplayed.length,reasons:farmReasons},candidateCount:pool.length,firstNominationRounds:first.rounds.length,picks:Object.keys(drafted).length,faSigned,releasedId,registered:current.s.teams.map(registeredDraftCount),archives:current.s.seasonHistory.farmArchives.length};
  row.seasons.push(seasonRow);saveEvidence();console.log('QA-D1 season',seed,y,'ms',seasonRow.elapsedMs,'farm unplayed',unplayed.length);
 }
 const recorded=current.s.teams.flatMap(ownedPlayers).find(p=>p.recentCareerLog?.length===3);
 expect(recorded).toBeTruthy();
 const career=await loadPlayerCareerLogById(recorded.id,current.s.saveId);
 expect(new Set(career.filter(r=>r.year>=2026&&r.year<=2028).map(r=>r.year))).toEqual(new Set([2026,2027,2028]));
 expect(new Set(career.map(getCareerEntryKey)).size).toBe(career.length);
 expect(current.s.year).toBe(2029);expect(current.s.seasonHistory.awards).toHaveLength(3);expect(current.s.seasonHistory.standingsHistory).toHaveLength(3);
 if(catcherProbe) {
  const report=catcherProbe.report();
  expect(report.seasons.map(s=>s.rounds)).toEqual([143,143,143]);
  expect(report.seasons.map(s=>s.unplayedCards)).toEqual(row.seasons.map(s=>s.farmCards.unplayed));
  expect(report.shortages.every(s=>s.farmHealthy===0)).toBe(true);
  const sourcePaths=['scripts/farm-catcher-diagnostics.js','scripts/qa-d1-offseason.js',
   'src/workers/seasonBatchCore.js','src/engine/rosterAutomation.js','src/engine/regularGameUpdates.js',
   'src/engine/farmProgression.js','src/engine/farmSelection.js','src/engine/cpuTradeExecution.js','src/hooks/useOffseason.js'];
  const sources=Object.fromEntries(sourcePaths.map(path=>[path,createHash('sha256').update(readFileSync(path)).digest('hex')]));
  mkdirSync('docs/validation/farm-catcher-shortage',{recursive:true});
  writeFileSync(`docs/validation/farm-catcher-shortage/seed-${seed}.json`,JSON.stringify({
   base:'db80d6c92dd094d0f20a5128e4185c062de86f1d',sources,
   environment:'Real QA-D1 hooks/engine; test-side pass-through spies; LCG RNG; fake-indexeddb and Map localStorage',
   ...report})+'\n');
  console.log('Farm catcher diagnosis',seed,JSON.stringify(report.seasons));
 }
},600000);
}
