import { expect, it } from 'vitest';
import { MAX_ROSTER, SEASON_GAMES } from '../src/constants';
import { applyManagementPolicy, validateTeamRoster } from '../src/engine/rosterAutomation';
import { freeze } from '../src/engine/__tests__/farmFixtures';
import { opportunityFixture as fixture } from './cpu-opportunity-fixtures';

it('moves an unused DH-only reserve to actual farm practice at the normal roster-review interval',()=>{
  const {t,farmUsage}=fixture(),before=structuredClone(t);
  expect(t.lineupNoDh).not.toContain('unused-dh');expect(t.lineupDh).toContain('unused-dh');
  const result=applyManagementPolicy(freeze(t),{gameDay:70,automationMode:'full',farmUsage:freeze(farmUsage)});
  expect(result.farm.some(p=>p.id==='unused-dh')).toBe(true);
  expect(result.farm.find(p=>p.id==='unused-dh').registrationCooldownDays).toBe(10);
  expect(result.players).toHaveLength(MAX_ROSTER);expect(validateTeamRoster(result).valid).toBe(true);
  expect(result.players.filter(p=>p.pos==='捕手')).toHaveLength(3);
  expect(result.farm.some(p=>p.pos==='捕手'&&!p.injuryDaysLeft)).toBe(true);
  expect([...result.players,...result.farm].map(p=>p.id).sort()).toEqual([...before.players,...before.farm].map(p=>p.id).sort());
  expect(t).toEqual(before);
});

it.each(['manual','emergency'])('keeps %s membership unchanged even with opportunity measurements',mode=>{
  const {t,farmUsage}=fixture();const r=applyManagementPolicy(t,{gameDay:70,automationMode:mode,farmUsage});
  expect(r.players.map(p=>p.id)).toEqual(t.players.map(p=>p.id));expect(r.farm.map(p=>p.id)).toEqual(t.farm.map(p=>p.id));
});

it('does not use a forced repair before the next scheduled review to rotate healthy reserves',()=>{
  const {t,farmUsage}=fixture();t.managementMeta={lastRosterDay:69};
  const r=applyManagementPolicy(t,{gameDay:70,force:true,automationMode:'full',farmUsage});
  expect(r.players.some(p=>p.id==='unused-dh')).toBe(true);
});

it('keeps missing or legacy-only farm measurements out of the opportunity decision',()=>{
  const {t}=fixture();t.farm.forEach(p=>{p.stats2={PA:999};});
  for(const farmUsage of [undefined,{}]){
    const r=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
    expect(r.players.some(p=>p.id==='unused-dh')).toBe(true);
  }
});

it('keeps field starters and required catchers registered while rotating at most one reserve',()=>{
  const {t,farmUsage}=fixture();t.players.filter(p=>!p.isPitcher).forEach(p=>{p.stats={...p.stats,PA:0};});
  const r=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
  for(const id of t.lineupNoDh)expect(r.players.some(p=>p.id===id)).toBe(true);
  expect(r.players.filter(p=>p.pos==='捕手')).toHaveLength(3);
  expect(t.players.filter(p=>!r.players.some(x=>x.id===p.id))).toHaveLength(1);
});

it('honors foreign-active and registration-cooldown eligibility for the replacement',()=>{
  const {t,farmUsage}=fixture();
  t.players.filter(p=>!p.isPitcher).slice(0,3).forEach(p=>{p.isForeign=true;});t.players.find(p=>p.isPitcher).isForeign=true;
  t.farm.find(p=>p.id==='replacement').isForeign=true;
  t.farm.filter(p=>p.id!=='replacement').forEach(p=>{p.registrationCooldownDays=10;});
  const r=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
  expect(r.players.some(p=>p.id==='unused-dh')).toBe(true);
});

it.each([undefined,null,1])('does not call missing or already-recorded main PA=%s an unused batter',PA=>{
  const {t,farmUsage}=fixture();t.players.find(p=>p.id==='unused-dh').stats.PA=PA;
  const r=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
  expect(r.players.some(p=>p.id==='unused-dh')).toBe(true);
});

it.each([150,200])('keeps a reserve whose measured farm PA=%s already matches or exceeds the replacement',battingPA=>{
  const {t,farmUsage}=fixture();farmUsage['unused-dh']={battingGames:40,battingPA};
  const r=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
  expect(r.players.some(p=>p.id==='unused-dh')).toBe(true);
});

it.each([{includeRosterChanges:false},{force:true}])('does not turn an explicit lineup-only or forced command into reserve practice (%j)',extra=>{
  const {t,farmUsage}=fixture();const r=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage,...extra});
  expect(r.players.some(p=>p.id==='unused-dh')).toBe(true);
});

it('does not rotate after the final regular-season game or repeat the same scheduled review',()=>{
  const {t,farmUsage}=fixture();
  const ended=applyManagementPolicy(t,{gameDay:SEASON_GAMES+1,automationMode:'full',farmUsage});
  expect(ended.players.some(p=>p.id==='unused-dh')).toBe(true);
  const first=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
  expect(first.farm.some(p=>p.id==='unused-dh')).toBe(true);
  const second=applyManagementPolicy(first,{gameDay:70,automationMode:'full',farmUsage});
  expect(second.players.map(p=>p.id)).toEqual(first.players.map(p=>p.id));
  expect(second.farm.map(p=>p.id)).toEqual(first.farm.map(p=>p.id));
});

it.each([{injuryDaysLeft:1},{育成:true},{isIkusei:true},{registrationCooldownDays:10}])('never demotes without an eligible replacement (%j)',extra=>{
  const {t,farmUsage}=fixture();
  // Every non-catcher can now cover the spare batting registration slot;
  // make all alternatives ineligible, while retaining the original asserts.
  t.farm.filter(p=>!p.isPitcher&&p.pos!=='捕手').forEach(p=>Object.assign(p,extra));
  const r=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
  expect(r.players.some(p=>p.id==='unused-dh')).toBe(true);
  expect(r.players.some(p=>p.id==='replacement')).toBe(false);
  expect(r.players).toHaveLength(MAX_ROSTER);
});

it('handles player ID zero and gives the same plan after serialization',()=>{
  const {t,farmUsage}=fixture();t.players.find(p=>p.id==='unused-dh').id=0;
  for(const key of ['lineup','lineupDh','lineupNoDh'])t[key]=t[key].map(id=>id==='unused-dh'?0:id);
  const result=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
  expect(result.farm.some(p=>p.id===0)).toBe(true);
  expect(applyManagementPolicy(JSON.parse(JSON.stringify(t)),{gameDay:70,automationMode:'full',farmUsage})).toEqual(result);
});

it('keeps the last healthy farm catcher even when catcher is only his secondary position',()=>{
  const {t,farmUsage}=fixture();
  t.farm.filter(p=>p.pos==='捕手').forEach(p=>{p.injuryDaysLeft=1;});
  t.farm.filter(p=>!p.isPitcher&&p.pos!=='捕手'&&p.id!=='replacement')
    .forEach(p=>{p.registrationCooldownDays=10;});
  t.farm.find(p=>p.id==='replacement').positions.捕手=100;
  const r=applyManagementPolicy(t,{gameDay:70,automationMode:'full',farmUsage});
  expect(r.farm.some(p=>p.id==='replacement')).toBe(true);
  expect(r.players.some(p=>p.id==='unused-dh')).toBe(true);
  expect(validateTeamRoster(r).valid).toBe(true);
});

