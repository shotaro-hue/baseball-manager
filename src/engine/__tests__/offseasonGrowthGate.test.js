import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { advanceEconomyDecisions, advanceOffseasonTurn, offseasonTurnRequest } from '../economyDecisions';
import { requiresYearEndGrowth } from '../annualYearEndGrowth';
import { reduceRenewalRequest, renewalRequest } from '../renewalDecisions';
import { reduceAcquisitionRequest, acquisitionRequest } from '../acquisitionDecisions';
import { openRenewalWinter, reviewRenewalWinter, growRenewalWinter } from './fixtures/renewalGrowth';
import { acquisitionFixture } from './fixtures/acquisitionWorld';
import { validateEconomySave } from '../economyPersistence';

const good = r => { expect(r.ok,r.error).toBe(true); expect(validateEconomySave(r.world)).toBe('annual'); return r.world; };
const step = w => advanceOffseasonTurn(w,offseasonTurnRequest(w));
const oldPending = () => JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/renewalBeforeGrowthPending.json.gz',import.meta.url))));
const assertBlocked = w => {
 const before=structuredClone(w),r=step(w);
 expect(r).toMatchObject({ok:false,replayed:false});expect(r.world).toBe(w);expect(r.error).toContain('年度末成長');
 expect(w).toEqual(before);expect(r.world.contractEconomy).toEqual(before.contractEconomy);
};

it.each([['opened',openRenewalWinter],['retirements saved',reviewRenewalWinter]])('refuses pre-growth empty turns with unchanged world: %s',(_,source)=>{
 const w=source();expect(requiresYearEndGrowth(w)).toBe(true);expect(w.contractEconomy.decisions).toEqual([]);assertBlocked(w);
});
it('preserves the chance to renew after native opening and retains grown turn30/31/37 boundaries before posting',()=>{
 let w=openRenewalWinter();
 // Reproduce the actual player path: repeatedly press advance before saving growth.
 for(let i=0;i<31;i++){const r=step(w);if(!r.ok)break;w=r.world;}
 const afterGrowth=growRenewalWinter(reviewRenewalWinter(w));
 const renewal=reduceRenewalRequest(afterGrowth,renewalRequest(afterGrowth,{type:'offer',playerId:afterGrowth.teams[0].players[0].id,salary:2000,years:1}));
 expect(renewal.ok,renewal.error).toBe(true);
 expect(w.contractEconomy.clock.offseasonTurn).toBe(0);
 w=growRenewalWinter(reviewRenewalWinter(w));expect(requiresYearEndGrowth(w)).toBe(false);
 const growth=structuredClone(w.contractEconomy.engine.transactions.find(t=>t.yearEndGrowth));
 while(w.contractEconomy.clock.offseasonTurn<30)w=good(step(w));
 const action={type:'offer',playerId:w.teams[0].players[0].id,salary:2000,years:1};
 w=good(reduceRenewalRequest(w,renewalRequest(w,action)));w=good(step(w));
 expect(reduceRenewalRequest(w,renewalRequest(w,{...action,replaceProposalId:w.contractEconomy.decisions[0].proposalId}))).toMatchObject({ok:false,world:w});
 while(w.contractEconomy.clock.offseasonTurn<37)w=good(step(w));
 expect(step(w)).toMatchObject({ok:false,world:w});expect(w.contractEconomy.engine.transactions.find(t=>t.yearEndGrowth)).toEqual(growth);
});
it('rescues authentic old pre-growth renewal promises only until the saved answer is resolved',()=>{
 let w=oldPending();const d=structuredClone(w.contractEconomy.decisions[0]);
 expect(requiresYearEndGrowth(w)).toBe(true);
 while(w.contractEconomy.clock.offseasonTurn<d.dueTurn)w=good(step(w));
 expect(w.contractEconomy.decisions[0]).toMatchObject({status:'accepted',demand:d.demand,evaluation:d.evaluation});assertBlocked(w);
 // Historical offer replay and cancellation remain separate from the new-turn guard.
 expect(reduceRenewalRequest(w,d.request)).toMatchObject({ok:true,replayed:true,world:w});
 const pending=oldPending(),cancelled=good(reduceRenewalRequest(pending,renewalRequest(pending,{type:'cancel',proposalId:d.proposalId})));
 expect(cancelled.contractEconomy.decisions[0].status).toBe('cancelled');assertBlocked(cancelled);
});
it('resolves mixed renewal/acquisition promises at their distinct due turns, then blocks further empty progress',()=>{
 let w=oldPending();w={...w,faPool:acquisitionFixture({phase:'offseason',date:'2026-12-01'}).faPool};
 w=good(reduceAcquisitionRequest(w,acquisitionRequest(w,{type:'offer',playerId:'free',salary:420,years:1})));
 const renewal=w.contractEconomy.decisions.find(d=>d.kind==='human-renewal'),acquisition=w.contractEconomy.decisions.find(d=>d.kind==='human-acquisition');
 expect(renewal.dueTurn).toBeLessThan(acquisition.dueTurn);
 while(w.contractEconomy.clock.offseasonTurn<renewal.dueTurn)w=good(step(w));
 expect(w.contractEconomy.decisions.map(d=>d.status)).toEqual(['accepted','pending']);
 while(w.contractEconomy.clock.offseasonTurn<acquisition.dueTurn)w=good(step(w));
 expect(w.contractEconomy.decisions.map(d=>d.status)).toEqual(['accepted','rejected']);assertBlocked(w);
});
it('preserves due reply confirmation, including old turn37/38 acquisition rescue, without needing a new turn',()=>{
 const w=oldPending();w.contractEconomy.clock.offseasonTurn=w.contractEconomy.decisions[0].dueTurn;
 const resolved=good(advanceEconomyDecisions(w,acquisitionRequest(w,{type:'resolve-due'})));
 expect(resolved.contractEconomy.clock).toEqual(w.contractEconomy.clock);expect(resolved.contractEconomy.decisions[0].status).toBe('accepted');assertBlocked(resolved);
 for(const turn of [37,38]){
  let a=oldPending();a=good(reduceRenewalRequest(a,renewalRequest(a,{type:'cancel',proposalId:a.contractEconomy.decisions[0].proposalId})));
  a={...a,faPool:acquisitionFixture({phase:'offseason',date:'2026-12-01'}).faPool};
  a=good(reduceAcquisitionRequest(a,acquisitionRequest(a,{type:'offer',playerId:'free',salary:12000,years:1})));a.contractEconomy.clock.offseasonTurn=turn;
  const r=good(advanceEconomyDecisions(a,acquisitionRequest(a,{type:'resolve-due'})));
  expect(r.contractEconomy.decisions.at(-1).status).toBe(turn===37?'accepted':'expired');expect(r.contractEconomy.clock.offseasonTurn).toBe(turn);
 }
});

it.each(['old native','old posted'])('does not introduce retroactive growth requirements for %s',kind=>{
 const w=kind==='old native'?acquisitionFixture({phase:'offseason',date:'2026-12-01'}):JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/yearEndOldPosting.json.gz',import.meta.url))));
 const before=structuredClone(w.contractEconomy.engine);expect(requiresYearEndGrowth(w)).toBe(false);
 const n=good(step(w));expect(n.contractEconomy.clock.offseasonTurn).toBe(w.contractEconomy.clock.offseasonTurn+1);
 expect(n.contractEconomy.engine).toEqual(before);
});
it('keeps legacy saves outside native turn operations without modifying their data',()=>{
 const legacy={...openRenewalWinter(),contractEconomy:undefined},before=structuredClone(legacy);
 expect(step(legacy)).toMatchObject({ok:false,world:legacy});expect(legacy).toEqual(before);
});
