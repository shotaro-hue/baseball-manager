import { generateSeasonSchedule } from '../scheduleGen';
import { it, expect } from 'vitest';
import { migrateFarmCompetition,advanceFarmYear,validateFarmSaveState } from '../farmMigration';
import { selectFarmPlayer,selectFarmTeams,selectFarmUsage } from '../farmSelectors';
import { createFarmCompetition,applyFarmRound } from '../farmRecords';
import { simulateFarmRound } from '../farmGame';
import { teams,freeze } from './farmFixtures';
export const farmState=(day=1)=>({saveId:'migration',year:2026,myId:0,gameDay:day,teams:teams().map(t=>({...t,wins:day-1,losses:0,draws:0})),
  seasonHistory:{awards:[]},gameResultsMap:{},allTeamResultsMap:{}});
const play=(state,round)=>({...state,farmCompetition:applyFarmRound(state.farmCompetition,
  simulateFarmRound({teams:state.teams,year:state.year,round,saveId:state.saveId,usage:selectFarmUsage(state.farmCompetition)}),state.teams),
  gameDay:round+1,teams:state.teams.map(t=>({...t,wins:round}))});

it.each(['regular','tactical','allstar','result'])('starts from next unplayed official round: %s',phase=>{
  const s=farmState(51);s.screen=phase;
  s.gameResultsMap[50]={gameNo:50};s.allTeamResultsMap[0]={50:{gameNo:50}};
  const m=migrateFarmCompetition(freeze(s));
  expect(m.farmCompetition.startRound).toBe(51);expect(m.farmCompetition.nextRound).toBe(51);
  expect(m.farmCompetition.source).toBe('migrated');expect(s.farmCompetition).toBeUndefined();
  expect(selectFarmPlayer(m,s.teams[0].farm[0].id)).toMatchObject({status:'measured',partial:true,batting:{PA:0},pitching:null});
});
it('uses finished standings and postseason plan rather than gameDay alone; ambiguous state is rejected',()=>{
  const s=farmState(144);s.gameDay=143;s.offseasonPlan={year:2026,myId:0,stage:'postseason',resumeScreen:'playoff'};
  expect(migrateFarmCompetition(s).farmCompetition.startRound).toBe(144);
  const bad=farmState(4);bad.teams[0].wins=1;expect(()=>migrateFarmCompetition(bad)).toThrow();
  const future=farmState(4);future.gameResultsMap[4]={};expect(()=>migrateFarmCompetition(future)).toThrow();
  const incomplete=farmState(4);incomplete.offseasonPlan={year:2026,myId:0,stage:'open'};expect(()=>migrateFarmCompetition(incomplete)).toThrow();
});
it('retains located legacy snapshots without guessing year/AB/outs or rewriting old player values',()=>{
  const s=farmState(3);s.teams[0].farm[0].id=0;s.teams[0].farm[0].stats2={PA:200,H:70,IP:8.1};
  s.teams[0].players.push({...s.teams[0].farm[1],id:'active',stats2:{HR:2}});
  s.teams[0].history=[{id:'retired',name:'old',stats2:{W:3}}];s.faPool=[{id:'free',name:'free',stats2:{H:4}}];
  s.offseasonPlan=null;s.offseasonLegacy={};
  const m=migrateFarmCompetition(freeze(s));
  expect(m.farmCompetition.legacy.entries.map(x=>x.playerId)).toEqual(expect.arrayContaining([0,'active','retired','free']));
  const old=m.farmCompetition.legacy.entries.find(x=>x.playerId===0);
  expect(old).toMatchObject({year:null,stats:{PA:200,H:70,IP:8.1}});expect(old.stats.AB).toBeUndefined();expect(old.stats.outs).toBeUndefined();
  expect(m.teams[0].farm[0].stats2).toEqual(s.teams[0].farm[0].stats2);
  expect(selectFarmPlayer(m,0).batting.PA).toBe(0);
  expect(selectFarmPlayer(m,0).legacy.entries[0].stats.H).toBe(70);
});
it('exposes independent aggregate/team/league stats, zero versus missing, and undefined rates',()=>{
  let s=farmState();s.farmCompetition=createFarmCompetition({teams:s.teams,year:2026,saveId:s.saveId});
  const unused=s.teams[0].farm.find(p=>p.isPitcher).id;
  expect(selectFarmPlayer(s,unused)).toMatchObject({status:'measured',pitching:{outs:0},ERA:null});
  expect(selectFarmPlayer({...s,farmCompetition:undefined},unused)).toMatchObject({status:'unrecorded'});
  s=play(s,1);const id=s.farmCompetition.players.find(p=>!p.isPitcher).playerId;
  const selected=selectFarmPlayer(s,id);expect(selected.batting.PA).toBeGreaterThan(0);
  expect(selected.AVG).toBe(selected.batting.H/selected.batting.AB);
  expect(selectFarmPlayer(s,id,{league:'other'}).batting.G).toBe(0);
  expect(selectFarmTeams(s)[0]).toMatchObject({scheduled:1,played:1,unplayed:0});
  const p=s.farmCompetition.players.find(p=>p.isPitcher).playerId;
  expect(selectFarmUsage(s.farmCompetition)[p].lastPitchedRound).toBe(1);
});
it('freezes year records and retains all archives; new year/records/archives are one unpublished candidate',()=>{
  let s=farmState(144);s=migrateFarmCompetition(s);
  const old=freeze(s),next=advanceFarmYear(old,{year:2027,nextSchedule:generateSeasonSchedule(2027,old.teams),teams:s.teams.map(t=>({...t,wins:0}))});
  expect(old.year).toBe(2026);expect(next.year).toBe(2027);expect(next.gameDay).toBe(1);
  expect(next.seasonHistory.farmArchives[0]).toMatchObject({year:2026,startRound:144,fullYearEligible:false});
  expect(next.seasonHistory.farmArchives[0].cards).toBeUndefined();expect(next.farmCompetition.nextRound).toBe(1);
  expect(()=>validateFarmSaveState(next)).not.toThrow();
  expect(()=>advanceFarmYear(farmState(),{year:2027,teams:s.teams})).toThrow();
  let cursor=next;
  for(let year=2028;year<=2047;year++) {
    cursor={...cursor,gameDay:144,teams:cursor.teams.map(t=>({...t,wins:143})),
      farmCompetition:createFarmCompetition({saveId:cursor.saveId,year:cursor.year,teams:cursor.teams,startRound:144,
        archiveSignature:cursor.farmCompetition.archiveSignature})};
    cursor=advanceFarmYear(cursor,{year,nextSchedule:generateSeasonSchedule(year,cursor.teams),teams:cursor.teams.map(t=>({...t,wins:0}))});
  }
  expect(cursor.seasonHistory.farmArchives).toHaveLength(21);
});
it('refuses lost, wrong-game/year or future records and archive mismatch',()=>{
  let s=farmState();s=migrateFarmCompetition(s);expect(()=>validateFarmSaveState(s)).not.toThrow();
  for(const key of ['saveId','year']) expect(()=>validateFarmSaveState({...s,[key]:key==='year'?2027:'another'})).toThrow();
  expect(()=>validateFarmSaveState({...s,farmCompetition:undefined,farmCompetitionVersion:1})).toThrow();
  const future=play(s,1);expect(()=>validateFarmSaveState({...future,gameDay:1,teams:s.teams})).toThrow();
  expect(()=>validateFarmSaveState({...s,seasonHistory:{farmArchives:[{}]}})).toThrow();
});

it('builds an annual candidate with consistent cleared main match-history fields',()=>{
  const old=migrateFarmCompetition(farmState(144));
  old.allTeamBoxScoresMap={0:{143:{old:true}}};old.allStarDone=true;old.pressEvent={old:true};
  old.scheduleArchive=[{year:2025}];
  const next=advanceFarmYear(old,{year:2027,nextSchedule:generateSeasonSchedule(2027,old.teams),teams:old.teams.map(t=>({...t,wins:0}))});
  expect(next.allTeamBoxScoresMap).toEqual({});expect(next.allStarDone).toBe(false);expect(next.pressEvent).toBeNull();
  expect(next.scheduleArchive).toEqual(old.scheduleArchive);
});

it('refuses unrelated team topology at the same saveId and official position',()=>{
  const s=migrateFarmCompetition(farmState()),changed=structuredClone(s);changed.teams[1].id='different-team';
  expect(()=>validateFarmSaveState(changed)).toThrow();
});

it('archives the finished-year schedule while installing a distinct new-year schedule',()=>{
  const old=migrateFarmCompetition(farmState(144));
  old.schedule=generateSeasonSchedule(2026,old.teams);
  old.gameResultsMap={143:{win:true}};
  const nextSchedule=generateSeasonSchedule(2027,old.teams);
  const next=advanceFarmYear(freeze(old),{year:2027,teams:old.teams.map(t=>({...t,wins:0})),nextSchedule});
  expect(next.scheduleArchive.at(-1)).toMatchObject({year:2026,schedule:old.schedule,gameResultsMap:old.gameResultsMap});
  expect(next.schedule).toEqual(nextSchedule);expect(next.schedule).not.toEqual(old.schedule);
  expect(old.scheduleArchive).toBeUndefined();expect(old.year).toBe(2026);
});
it.each([undefined,null,[],[null],{},Array(144).fill(null)])('rejects absent or incomplete new-year schedule: %j',nextSchedule=>{
  const old=migrateFarmCompetition(farmState(144));
  expect(()=>advanceFarmYear(old,{year:2027,teams:old.teams.map(t=>({...t,wins:0})),nextSchedule})).toThrow(/schedule/);
});
it('rejects a new-year schedule with missing or duplicate club participation',()=>{
  const old=migrateFarmCompetition(farmState(144)),nextSchedule=generateSeasonSchedule(2027,old.teams);
  nextSchedule[143].matchups[0].homeId=nextSchedule[143].matchups[0].awayId;
  expect(()=>advanceFarmYear(old,{year:2027,teams:old.teams.map(t=>({...t,wins:0})),nextSchedule})).toThrow(/schedule/);
});
