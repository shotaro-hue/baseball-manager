import * as economy from '../contractEconomy';
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { offseasonTurnRequest, advanceOffseasonTurn } from '../economyDecisions';
import { renewalRequest, reduceRenewalRequest } from '../renewalDecisions';
import { acquisitionRequest, reduceAcquisitionRequest } from '../acquisitionDecisions';
import { acquisitionFixture } from './fixtures/acquisitionWorld';
import { renewalClosingWorld, openRenewalWinter, growRenewalWinter } from './fixtures/renewalGrowth';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';

const good = r => { expect(r.ok,r.error).toBe(true); expect(validateEconomySave(r.world)).toBe('annual'); return r.world; };
const step = w => good(advanceOffseasonTurn(w,offseasonTurnRequest(w)));
const offer = (w,salary=12000) => good(reduceRenewalRequest(w,renewalRequest(w,{type:'offer',playerId:w.teams[0].players[0].id,salary,years:1})));
const winter = turn => acquisitionFixture({phase:'offseason',date:'2026-12-01',turn:turn??0});

it('advances exactly one turn with one revision and fixed date/year, refusing duplicate and stale requests',()=>{
 const w=winter(),before=structuredClone(w),req=offseasonTurnRequest(w),n=good(advanceOffseasonTurn(w,req));
 expect(n.contractEconomy.clock).toEqual({...w.contractEconomy.clock,offseasonTurn:1});
 expect(n.year).toBe(w.year);expect(n.contractEconomy.revision).toBe(w.contractEconomy.revision+1);
 expect(n.teams).toEqual(w.teams);expect(n.contractEconomy.engine).toEqual(w.contractEconomy.engine);
 expect(economyOverwriteIssue(w,n)).toBeNull();expect(w).toEqual(before);
 expect(advanceOffseasonTurn(n,req)).toMatchObject({ok:false,world:n});
});
it('resolves mixed same-turn replies without publishing intermediate revisions or redrawing outcomes',()=>{
 let w=offer(winter());w=good(reduceAcquisitionRequest(w,acquisitionRequest(w,{type:'offer',playerId:'free',salary:12000,years:1})));
 const before=structuredClone(w),decisions=w.contractEconomy.decisions;
 while(w.contractEconomy.clock.offseasonTurn<Math.max(...decisions.map(d=>d.dueTurn))){
  const previous=w;w=step(w);expect(w.contractEconomy.revision).toBe(previous.contractEconomy.revision+1);
  expect(economyOverwriteIssue(previous,w)).toBeNull();
  for(const d of w.contractEconomy.decisions)expect(d.status).toBe(d.dueTurn<=w.contractEconomy.clock.offseasonTurn?(d.willAccept?'accepted':'rejected'):'pending');
 }
 expect(w.contractEconomy.decisions.every(d=>d.status==='accepted')).toBe(true);
 expect(w.contractEconomy.engine.acquisitions).toHaveLength(1);expect(w.teams[0].players).toEqual(before.teams[0].players);
});
it('resolves actual pre-growth native promises, while still refusing fresh offers',()=>{
 let w=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/renewalBeforeGrowthPending.json.gz',import.meta.url))));
 const before=structuredClone(w);expect(reduceRenewalRequest(w,renewalRequest(w,{type:'offer',playerId:w.teams[0].players[0].id,salary:2000,years:1})).ok).toBe(false);
 w=step(w);expect(w.contractEconomy.decisions[0].status).toBe('pending');w=step(w);
 expect(w.contractEconomy.decisions[0].status).toBe('accepted');expect(w.contractEconomy.engine.transactions.some(t=>t.yearEndGrowth)).toBe(false);
 expect(w.teams[0].players[0].salary).toBe(before.teams[0].players[0].salary);
});
it('resolves date-based carried replies at the current clock before incrementing',()=>{
 let w=offer(renewalClosingWorld(),2000);w=openRenewalWinter(w);const n=step(w);
 expect(n.contractEconomy.decisions[0].status).toBe('accepted');expect(n.contractEconomy.decisions[0].resolvedClock.offseasonTurn).toBe(0);
});
it('keeps fixed growth demands and does not require posting completion',()=>{
 let w=growRenewalWinter();w=offer(w,2000);const d=structuredClone(w.contractEconomy.decisions[0]);
 while(w.contractEconomy.clock.offseasonTurn<d.dueTurn)w=step(w);
 expect(w.contractEconomy.decisions[0]).toMatchObject({demand:d.demand,evaluation:d.evaluation,status:'accepted'});
});
it('allows turn30 offers, refuses turn31 offers, and answers on37 before stopping',()=>{
 let w=offer(winter(30));w=step(w);
 expect(reduceRenewalRequest(w,renewalRequest(w,{type:'offer',playerId:0,salary:12000,years:1,replaceProposalId:w.contractEconomy.decisions[0].proposalId})).ok).toBe(false);
 while(w.contractEconomy.clock.offseasonTurn<37)w=step(w);
 expect(w.contractEconomy.decisions[0].status).toBe('accepted');expect(advanceOffseasonTurn(w,offseasonTurnRequest(w))).toMatchObject({ok:false,world:w});
 // A historical late promise already due at36 is answered there, not expired after the final boundary.
 const late=offer(winter(30));late.contractEconomy.clock.offseasonTurn=36;const n=step(late);
 expect(n.contractEconomy.decisions[0]).toMatchObject({status:'accepted',resolvedClock:{offseasonTurn:36}});
});
it.each(['saveId','epoch','baseRevision','extra','action'])('refuses invalid %s without changing source',field=>{
 const w=winter(),req=offseasonTurnRequest(w);if(field==='baseRevision')req[field]++;else if(field==='action')req.action.extra=true;else req[field]='wrong';
 expect(advanceOffseasonTurn(w,req)).toMatchObject({ok:false,world:w});
});
it('refuses season, legacy and old beyond-deadline clocks',()=>{
 for(const w of [acquisitionFixture(),{...winter(),contractEconomy:undefined},winter(38)])expect(advanceOffseasonTurn(w,offseasonTurnRequest(w))).toMatchObject({ok:false,world:w});
});

it('validates an empty turn once without repeatedly rebuilding the full twelve-club economy',()=>{
 const w=winter(),spy=vi.spyOn(economy,'toAnnualState');
 try { const r=advanceOffseasonTurn(w,offseasonTurnRequest(w));expect(r.ok,r.error).toBe(true);expect(spy).toHaveBeenCalledTimes(1); }
 finally { spy.mockRestore(); }
});
