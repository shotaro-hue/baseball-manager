import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { opportunityFixture } from './cpu-opportunity-fixtures';
import { emptyStats } from '../src/engine/playerCore';
import { createFarmCompetition, applyFarmRound } from '../src/engine/farmRecords';
import { simulateFarmRound } from '../src/engine/farmGame';
import { selectFarmUsage } from '../src/engine/farmSelectors';
import { validateFarmSaveState } from '../src/engine/farmMigration';
import { validateTeamRoster } from '../src/engine/rosterAutomation';
import { simulateSingleDay } from '../src/workers/singleDayCore';
import { simulateSeasonBatch } from '../src/workers/seasonBatchCore';
import { useSeasonFlow } from '../src/hooks/useSeasonFlow';

// Isolate roster and measured farm progression from random official results.
// Farm games, roster policy and lifecycle remain the real implementations.
vi.mock('../src/engine/simulation',()=>({quickSimGame:()=>({score:{my:0,opp:0},won:false,log:[],inningSummary:[]})}));
vi.mock('../src/engine/player',async original=>({...await original(),checkForInjuries:()=>[]}));
vi.mock('../src/engine/trade',async original=>({...await original(),generateCpuOffer:()=>null,generateCpuCpuTrade:()=>null}));
beforeEach(()=>vi.spyOn(Math,'random').mockReturnValue(.99));
afterEach(()=>vi.restoreAllMocks());

function state(day){
  const s=JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz'))),{t}=opportunityFixture();
  const original=s.teams.find(t=>t.id===1),sample=original.players;
  const decorate=p=>({...sample.find(q=>q.isPitcher===p.isPitcher),...p,stats:{...emptyStats(),...p.stats},salary:420});
  s.teams=s.teams.map(team=>({...team,...(team.id===1?{...t,players:t.players.map(decorate),farm:t.farm.map(decorate)}:{}),
    wins:day-1,losses:0,draws:0,managementMeta:{lastRosterDay:0,lastLineupDay:7}}));
  Object.assign(s,{gameDay:day,myId:0,year:2026,saveId:'opportunity-flow',allStarDone:true,offseasonPlan:null,
    gameResultsMap:{},allTeamResultsMap:{},news:[],mailbox:[],cpuTradeOffers:[],
    seasonHistory:{awards:[],records:{},hallOfFame:[],championships:[],standingsHistory:[],transfers:[]},
    schedule:Array.from({length:day+2},(_,round)=>round?{gameNo:round,date:{month:4,day:round},
      matchups:Array.from({length:6},(_,i)=>({homeId:i*2,awayId:i*2+1}))}:null)});
  s.farmCompetition=createFarmCompetition({teams:s.teams,year:s.year,saveId:s.saveId,startRound:13});
  if(day===14)s.farmCompetition=applyFarmRound(s.farmCompetition,
    simulateFarmRound({teams:s.teams,year:s.year,saveId:s.saveId,round:13,usage:{}}),s.teams);
  s.farmCompetitionVersion=1;validateFarmSaveState(s);return s;
}

async function tactical(s){
  let api,candidate;
  const gs={...s,myTeam:s.teams[0],getGameResultsMap:()=>s.gameResultsMap,
    getSeasonHistory:()=>s.seasonHistory,applyProgressCandidate:next=>{validateFarmSaveState(next);candidate=next;return true;},
    ...Object.fromEntries(['setTeams','setGameDay','setScreen','setPregameError','notify','addNews','addTransferLog',
      'pushResult','pushGameResult','setAllTeamResultsMap','setMailbox','setRetireModal'].map(k=>[k,vi.fn()]))};
  function Harness(){api=useSeasonFlow(gs);return null;}
  let view;act(()=>{view=create(React.createElement(Harness));});
  try{
    await act(async()=>api.handleStartGame());
    expect(gs.setPregameError).toHaveBeenLastCalledWith(null);
    await act(async()=>api.handleTacticalGameEnd({score:{my:0,opp:0},log:[],inningSummary:[]}));
    expect(gs.notify).not.toHaveBeenCalled();expect(candidate).toBeDefined();return candidate;
  }finally{act(()=>view.unmount());}
}

it('gives the same unused reserve real farm practice in batch, single-day and tactical progression after reload',async()=>{
  const s=state(14),before=structuredClone(s);
  expect(selectFarmUsage(s.farmCompetition).replacement.battingPA).toBeGreaterThan(0);
  const loaded=JSON.parse(JSON.stringify(s));
  const single=simulateSingleDay({snapshot:loaded,gameContext:{selectedOpponentId:1,isHome:true,useDh:false}}).nextState;
  const batch=simulateSeasonBatch({snapshot:loaded,count:1}).nextState;
  const played=await tactical(loaded);
  for(const next of [single,batch,played]){
    const cpu=next.teams.find(t=>t.id===1);
    expect(cpu.farm.some(p=>p.id==='unused-dh')).toBe(true);
    expect(cpu.players.some(p=>p.id==='replacement')).toBe(true); // The ordinary score-based promotion still happens.
    expect(selectFarmUsage(next.farmCompetition)['unused-dh'].battingPA).toBeGreaterThan(0);
    expect(validateTeamRoster(cpu).valid).toBe(true);validateFarmSaveState(next);
  }
  const membership=next=>next.teams.find(t=>t.id===1).players.map(p=>p.id).sort();
  expect(membership(batch)).toEqual(membership(single));expect(membership(played)).toEqual(membership(single));
  expect(batch.farmCompetition).toEqual(single.farmCompetition);expect(played.farmCompetition).toEqual(single.farmCompetition);
  expect(s).toEqual(before);
});

it('uses the just-completed farm round for a tactical postgame review scheduled for tomorrow',async()=>{
  const s=state(13);expect(selectFarmUsage(s.farmCompetition)).toEqual({});
  const next=await tactical(s),cpu=next.teams.find(t=>t.id===1);
  expect(selectFarmUsage(next.farmCompetition).replacement.battingPA).toBeGreaterThan(0);
  expect(cpu.farm.some(p=>p.id==='unused-dh')).toBe(true);
  expect(cpu.managementMeta.lastRosterDay).toBe(14);
});
