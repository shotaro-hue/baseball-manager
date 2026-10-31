import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createInitialTeams, createInitialTeamsAsync } from '../bootstrapTeams';
import { validateTeamRoster } from '../rosterAutomation';
import { createAnnualNewGameWorld } from '../contractEconomy';
import { economyPolicy } from './fixtures/economyWorld';
import { saveGame, loadGame } from '../saveload';
import { generateSeasonSchedule } from '../scheduleGen';
import { simulateSeasonBatch } from '../../workers/seasonBatchCore';
import { FIELDING_POSITIONS } from '../../constants';

// Project-authored population for capacity/integration checks; never real-player evidence.
function population() {
 const players=[];
 for(let teamId=0;teamId<12;teamId++) for(let i=0;i<90;i++) {
  const development=i>=65,isPitcher=i<32||i>=65&&i%2===0;
  const pos=isPitcher?'先発':i<38||i===67?'捕手':FIELDING_POSITIONS[1+(i-38+70)%7];
  players.push({playerId:`synthetic:${teamId}:${i}`,name:`検証${teamId}-${i}`,teamId,registration:development?'development':'controlled',kind:isPitcher?'pitcher':'batter',
   birthDate:'2001-04-01',throws:'right',bats:'switch',pos,positions:isPitcher?{}:{[pos]:100},
   salaryManYen:development?240:1000,salaryStatus:'reported',contractEndYear:development?2026:2028,contractStatus:'reported',
   foreignQuotaStatus:'domestic',sourceIds:['test'],entryType:'高卒',roleStatus:'verified',history:[]});
 }
 return {schemaVersion:1,asOf:'2026-03-27',status:'verified',sources:[{id:'test',url:'https://example.org/synthetic',redistribution:'cleared',rightsEvidence:'project-authored fixtures'}],
 teams:Array.from({length:12},(_,teamId)=>({teamId,controlled:65,development:25,verified:true})),players};
}
const owned=t=>[...t.players,...t.farm];
const state=teams=>({saveId:'player-master-test',year:2026,myId:0,gameDay:1,teams,schedule:generateSeasonSchedule(2026,teams),faPool:[],
 seasonHistory:{transfers:[],awards:[]},news:[],mailbox:[],gameResultsMap:{},scheduleArchive:[],allStarDone:true,allStarTriggerDay:72,saveRevision:0});
const setupStorage=()=>{const rows=new Map();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});return rows;};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const thinBattingPopulation=count=>{
 const m=population(),pos=['捕手','捕手','捕手','一塁手','二塁手','三塁手','左翼手','中堅手','右翼手','一塁手'];
 for(const p of m.players) {
  const index=Number(p.playerId.split(':').at(-1));
  if(index>=65)continue;
  p.kind=index<count?'batter':'pitcher';p.pos=index<count?pos[index]:'先発';p.positions=index<count?{[p.pos]:100}:{};
  if(index===0)p.positions.遊撃手=85;
 }
 return m;
};
it('rejects complete data that cannot field nine batters after reserving a farm catcher',()=>{
 expect(()=>createInitialTeams(thinBattingPopulation(9))).toThrow(/完全名簿/);
});
it('reserves another catcher when the first catcher is also the only shortstop',()=>{
 const teams=createInitialTeams(thinBattingPopulation(10));
 for(const team of teams) {
  expect(validateTeamRoster(team).errors).toEqual([]);
  expect(team.players.some(p=>p.realPlayerId===`synthetic:${team.id}:0`)).toBe(true);
 }
});
it('places all 1,080 supplied identities exactly once and keeps 300 development players off active squads',async()=>{
 const master=population(),before=structuredClone(master),original=Math.random;
 const run=async fn=>{let x=109;Math.random=()=>{x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};return fn(master);};
 try {
  const sync=await run(createInitialTeams),asyncTeams=await run(createInitialTeamsAsync);
  expect(asyncTeams).toEqual(sync);expect(master).toEqual(before);
  const all=sync.flatMap(owned);expect(all).toHaveLength(1080);
  expect(new Set(all.map(p=>p.realPlayerId)).size).toBe(1080);
  for(const team of sync) {
   expect(owned(team).filter(p=>!p.isIkusei)).toHaveLength(65);
   expect(owned(team).filter(p=>p.isIkusei)).toHaveLength(25);
   expect(team.players.some(p=>p.isIkusei)).toBe(false);
   expect(validateTeamRoster(team).errors).toEqual([]);
  }
 }finally{Math.random=original;}
});
it('constructs 1,080 native contracts with annual salary and term preserved, then progresses a real game day',async()=>{
 const teams=createInitialTeams(population());
 const world=createAnnualNewGameWorld({teams,faPool:[],myId:0,saveId:'master-economy',season:2026,policy:economyPolicy(teams,2026,1000000),randomRoot:{algorithmVersion:1,seed:'master'}});
 const records=world.contractEconomy.engine.spending.ledger.records;
 expect(records).toHaveLength(1080);
 for(const team of teams)for(const p of owned(team)) {
  const r=records.find(r=>r.contract.playerId===p.id);
  expect(r.contract.annualSalaryManYen).toBe(p.salary);expect(r.contract.termYears).toBe(p.isIkusei?1:3);
 }
 const {nextState}=await simulateSeasonBatch({snapshot:state(teams),count:1,isCancelled:()=>false});
 expect(nextState.gameDay).toBe(2);
 expect(nextState.teams.flatMap(owned)).toHaveLength(1080);
 expect(nextState.teams.every(t=>t.wins+t.losses+t.draws===1)).toBe(true);
});
it('round-trips a large new population through real save storage and measures its payload',async()=>{
 setupStorage();const s=state(createInitialTeams(population())),before=s.teams.flatMap(owned).map(p=>[p.id,p.realPlayerId,p.salary,p.contractYearsLeft,p.isIkusei]);
 expect((await saveGame(s)).ok).toBe(true);const loaded=await loadGame();
 expect(loaded.teams.flatMap(owned).map(p=>[p.id,p.realPlayerId,p.salary,p.contractYearsLeft,p.isIkusei])).toEqual(before);
 const json=JSON.stringify(s),bytes=Buffer.byteLength(json),compressed=gzipSync(json).length;
 console.log(JSON.stringify({syntheticPlayers:1080,utf8Bytes:bytes,gzipBytes:compressed}));
 expect(bytes).toBeLessThan(8*1024*1024);
});
it('does not inject or replace the new master when loading an existing real save fixture',async()=>{
 const rows=setupStorage();
 const old=JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/new-game.json.gz',import.meta.url))));
 const before=old.teams.flatMap(owned).map(p=>[p.id,p.name,p.salary,p.育成,p.pos]);
 rows.set('baseball_manager_v1',JSON.stringify(old));
 const loaded=await loadGame();
 expect(loaded.teams.flatMap(owned).map(p=>[p.id,p.name,p.salary,p.育成,p.pos])).toEqual(before);
 expect(loaded.teams.flatMap(owned).every(p=>!p.realPlayerId)).toBe(true);
});
