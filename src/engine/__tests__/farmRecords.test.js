import { it, expect } from 'vitest';
import { createFarmCompetition, applyFarmRound } from '../farmRecords';
import { validateFarmCompetition } from '../farmRecordValidation';
import { simulateFarmRound } from '../farmGame';
import { teams, freeze } from './farmFixtures';
const initial=(ts=teams(),startRound=1)=>createFarmCompetition({teams:ts,saveId:'records',year:2026,startRound});
const sim=(ts,round=1)=>simulateFarmRound({teams:ts,year:2026,round,saveId:'records'});

it('records six cards and actual players independently, with no events or ability snapshots',()=>{
  const ts=freeze(teams()),base=freeze(initial(ts)),result=freeze(sim(ts));
  const next=applyFarmRound(base,result,ts);
  expect(next.nextRound).toBe(2);expect(base.nextRound).toBe(1);
  expect(next.cards).toHaveLength(6);expect(next.players.length).toBeGreaterThan(108);
  expect(JSON.stringify(next)).not.toMatch(/runnersBefore|contact|pitchingRounds|contractYears/);
  expect(()=>validateFarmCompetition(next)).not.toThrow();
  expect(next.usage.some(u=>u.recentPitching?.length===1)).toBe(true);
  expect(next.players.every(p=>p.teams.length===1)).toBe(true);
});
it('is idempotent on same round but rejects conflicts, gaps and invalid games atomically',()=>{
  const ts=teams(),base=initial(ts),r=sim(ts),next=applyFarmRound(base,r,ts);
  expect(applyFarmRound(freeze(next),r,ts)).toBe(next);
  expect(()=>applyFarmRound(base,sim(ts,2),ts)).toThrow();
  const bad=structuredClone(r);bad.games[0].game.teams[0].records[0].batting.PA++;
  expect(()=>applyFarmRound(base,bad,ts)).toThrow();expect(base.cards).toHaveLength(0);
  const other=simulateFarmRound({teams:ts,year:2026,round:1,saveId:'different-seed'});
  expect(()=>applyFarmRound(next,other,ts)).toThrow();
});
it('preserves deficiency reasons for both teams without inventing players',()=>{
  const ts=teams();ts[0].farm=ts[0].farm.filter(p=>p.pos!=='捕手');
  const next=applyFarmRound(initial(ts),sim(ts),ts),card=next.cards.find(c=>c.status==='unplayed');
  expect(card.reasons).toContainEqual({code:'insufficient-catcher',available:0,required:1,teamId:0});
  expect(card.game).toBeUndefined();expect(next.players.some(p=>p.teams.some(t=>t.teamId===0))).toBe(false);
  expect(()=>validateFarmCompetition(next)).not.toThrow();
});
it('preserves ID0, promoted/released players, separate league stints, and accumulates a returned player',()=>{
  const ts=teams();ts[0].farm[1].id=0;
  let c=applyFarmRound(initial(ts),sim(ts),ts);
  const original=c.players.find(p=>p.playerId===0),old=structuredClone(original.teams[0]);
  const moved=ts[0].farm.splice(1,1)[0];ts[6].farm.push(moved);
  ts[0].farm.push({...ts[0].farm.find(p=>!p.isPitcher&&p.pos==='一塁手'),id:'replacement'});
  c=applyFarmRound(c,sim(ts,2),ts);
  expect(c.players.find(p=>p.playerId===0).teams.map(t=>t.league)).toEqual(['セ','パ']);
  expect(c.players.find(p=>p.playerId===0).teams[0]).toEqual(old);
  ts[6].farm=ts[6].farm.filter(p=>p.id!==0);ts[0].farm.push(moved);
  c=applyFarmRound(c,sim(ts,3),ts);
  const p=c.players.find(p=>p.playerId===0);expect(p.teams).toHaveLength(2);expect(p.teams[0].batting.G).toBe(2);
  ts[0].farm=ts[0].farm.filter(p=>p.id!==0);
  c=applyFarmRound(c,sim(ts,4),ts);expect(c.players.find(p=>p.playerId===0)).toEqual(p);
});
it('rejects wrong membership, duplicated cards, unsupported metadata, workload and persisted counter corruption',()=>{
  const ts=teams(),base=initial(ts),r=sim(ts);
  const active=structuredClone(ts);active[0].players.push(active[0].farm.shift());
  expect(()=>applyFarmRound(base,r,active)).toThrow();
  const duplicate=structuredClone(r);duplicate.games[1]=duplicate.games[0];expect(()=>applyFarmRound(base,duplicate,ts)).toThrow();
  const meta=structuredClone(r);meta.games[0].game.model.version='unsupported';expect(()=>applyFarmRound(base,meta,ts)).toThrow();
  const load=structuredClone(r);load.games[0].game.workload[0].BF++;expect(()=>applyFarmRound(base,load,ts)).toThrow();
  const next=applyFarmRound(base,r,ts);
  for(const kind of ['counter','cards','usage']) {
    const bad=structuredClone(next);
    if(kind==='counter') bad.players[0].teams[0].batting.AB=NaN;
    if(kind==='cards') bad.cards.pop();
    if(kind==='usage') bad.usage[0].lastBattedRound=144;
    expect(()=>validateFarmCompetition(bad)).toThrow();
  }
});

it('detects structurally plausible edits to persisted player/load attribution',()=>{
  const ts=teams(),c=applyFarmRound(initial(ts),sim(ts),ts);
  const load=structuredClone(c),p=load.usage.find(u=>u.recentPitching.length);p.recentPitching[0].BF++;
  expect(()=>validateFarmCompetition(load)).toThrow();
});

it('does not accept warnings attributed to nonparticipants',()=>{
  const ts=teams(),r=sim(ts),g=r.games[0].game;
  g.warnings.push({code:'pitcher-rescue',teamId:g.teams[0].teamId,playerId:'ghost'});
  expect(()=>applyFarmRound(initial(ts),r,ts)).toThrow();
});

it('validates 143 fixture rounds with explicit catcher shortage and compact annual size',async()=>{
  const {readFileSync}=await import('node:fs'),{gunzipSync}=await import('node:zlib'),{performance}=await import('node:perf_hooks');
  const fixture=JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz'))),ts=freeze(fixture.teams);
  const {selectFarmUsage}=await import('../farmSelectors');
  let c=createFarmCompetition({teams:ts,saveId:fixture.saveId,year:fixture.year});const start=performance.now();
  let fiveMs;
  for(let round=1;round<=143;round++) {
    const result=simulateFarmRound({teams:ts,saveId:fixture.saveId,year:fixture.year,round,usage:selectFarmUsage(c)});
    c=applyFarmRound(c,result,ts);if(round===5)fiveMs=performance.now()-start;
  }
  expect(c.cards).toHaveLength(858);expect(c.cards.filter(c=>c.status==='unplayed')).toHaveLength(143);
  expect(()=>validateFarmCompetition(c)).not.toThrow();
  const encoded=JSON.stringify(c);expect(encoded).not.toContain('runnersBefore');expect(Buffer.byteLength(encoded)).toBeLessThan(2000000);
  const {advanceFarmYear}=await import('../farmMigration'),{selectFarmPlayer}=await import('../farmSelectors');
  const state={...fixture,gameDay:144,farmCompetitionVersion:1,farmCompetition:c,seasonHistory:{},
    teams:ts.map(t=>({...t,wins:143,losses:0,draws:0}))};
  const next=advanceFarmYear(state,{year:fixture.year+1,teams:ts.map(t=>({...t,wins:0,losses:0,draws:0,farm:[]}))});
  const archived=next.seasonHistory.farmArchives[0],retired=c.players[0];
  expect(archived.fullYearEligible).toBe(true);
  expect(selectFarmPlayer(next,retired.playerId,{year:fixture.year}).status).toBe('measured');
  const archiveBytes=Buffer.byteLength(JSON.stringify(archived));
  expect(archiveBytes).toBeLessThan(Buffer.byteLength(encoded));
  console.info(JSON.stringify({farmF02Measurement:true,fiveRoundsMs:Math.round(fiveMs),round143Ms:Math.round(performance.now()-start),
    currentYearBytes:Buffer.byteLength(encoded),archiveYearBytes:archiveBytes,synthetic20ArchiveBytes:archiveBytes*20,players:c.players.length,cards:c.cards.length}));
},30000);
