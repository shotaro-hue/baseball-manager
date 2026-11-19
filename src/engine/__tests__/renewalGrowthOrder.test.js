import { reduceOffseasonPostingRequest, offseasonPostingRequest } from '../humanPosting';
import { requiresYearEndGrowth } from '../annualYearEndGrowth';
import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { validateEconomySave } from '../economyPersistence';
import { renewalFixture } from './fixtures/renewalWorld';
import { renewalClosingWorld, openRenewalWinter, reviewRenewalWinter, growRenewalWinter } from './fixtures/renewalGrowth';
import { renewalRequest, reduceRenewalRequest, dueRenewalDecisions } from '../renewalDecisions';
import { reduceEconomyCommand, reduceEconomyCommandAsync } from '../contractEconomy';
import { growthCommand } from './fixtures/yearEndGrowth';
import { wrap } from './fixtures/annualRetirements';
import { createSeasonContract } from '../seasonContract';

const offer = w => renewalRequest(w, { type: 'offer', playerId: w.teams[0].players[0].id, salary: 2000, years: 2 });
const command = w => wrap(w, { id: 'direct-renewal', type: 'offer-renewal', contractId: w.teams[0].players[0].contractId,
  proposal: { id: 'direct-proposal', type: 'sign', teamId: w.myId, effectiveDate: '2027-02-01',
    contract: createSeasonContract({ contractId: 'direct-contract', playerId: w.teams[0].players[0].id, signedSeason: w.year,
      agreementPhase: 'offseason', purpose: 'renewal', termYears: 2, annualSalaryManYen: 2000, guaranteed: true, registrationType: 'controlled' }) } });

it.each([['just opened',openRenewalWinter],['retirement reviewed',reviewRenewalWinter]])('rejects a fresh human offer with unchanged source when growth is pending: %s',(_,source)=>{
 const w=source(),before=structuredClone(w),r=reduceRenewalRequest(w,offer(w));
 expect(r).toMatchObject({ok:false,world:w});expect(r.error).toContain('年度末成長');expect(w).toEqual(before);
});
it.each([reduceEconomyCommand,reduceEconomyCommandAsync])('rejects a direct shared-world offer before growth (%#)',async reduce=>{
 const w=reviewRenewalWinter(),before=structuredClone(w),r=await reduce(w,command(w));
 expect(r).toMatchObject({ok:false,world:w});expect(r.error).toContain('年度末成長');expect(w).toEqual(before);
});
it('uses the frozen salary demand after growth, without changing old salary or growth evidence',()=>{
 const w=growRenewalWinter(),g=structuredClone(w.contractEconomy.engine.transactions.find(t=>t.yearEndGrowth));
 const row=g.yearEndGrowth.rows.find(r=>r.playerId===w.teams[0].players[0].id);
 w.teams[0].players[0].stats={};
 const req=offer(w),r=reduceRenewalRequest(w,req);expect(r.ok,r.error).toBe(true);
 expect(r.world.contractEconomy.decisions.at(-1).demand).toMatchObject(row.salary);
 expect(r.world.teams[0].players[0].salary).toBe(w.teams[0].players[0].salary);
 expect(r.world.contractEconomy.engine.transactions.find(t=>t.yearEndGrowth)).toEqual(g);
 expect(reduceRenewalRequest(r.world,req)).toMatchObject({ok:true,replayed:true,world:r.world});
});

it('retains in-season offers, carried replies and saved replays across native opening',()=>{
 const closing=renewalClosingWorld(),req=offer(closing),h=reduceRenewalRequest(closing,req);expect(h.ok,h.error).toBe(true);
 const w=openRenewalWinter(h.world),before=structuredClone(w),pending=w.contractEconomy.decisions[0];
 expect(reduceRenewalRequest(w,req)).toMatchObject({ok:true,replayed:true,world:w});
 const replacement=reduceRenewalRequest(w,renewalRequest(w,{...req.action,replaceProposalId:pending.proposalId,salary:2100}));
 expect(replacement).toMatchObject({ok:false,world:w});expect(replacement.error).toContain('年度末成長');
 expect(dueRenewalDecisions(w)).toHaveLength(1);
 const replied=reduceRenewalRequest(w,renewalRequest(w,{type:'resolve-due'}));expect(replied.ok,replied.error).toBe(true);
 expect(replied.world.contractEconomy.decisions[0].status).toBe('accepted');
 const grown=growRenewalWinter(reviewRenewalWinter(replied.world));expect(validateEconomySave(grown)).toBe('annual');
 expect(grown.contractEconomy.engine.spending.ledger).toEqual(replied.world.contractEconomy.engine.spending.ledger);
 expect(w).toEqual(before);
});

const oldPending = () => JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/renewalBeforeGrowthPending.json.gz',import.meta.url))));
it('keeps actual pre-fix pending promises readable/replayable and cancellable, while refusing replacement',()=>{
 const w=oldPending(),before=structuredClone(w),d=w.contractEconomy.decisions[0];
 expect(validateEconomySave(w)).toBe('annual');expect(dueRenewalDecisions(w)).toEqual([]);
 expect(d.dueTurn).toBe(2);expect(w.contractEconomy.clock.offseasonTurn).toBe(0);
 expect(reduceRenewalRequest(w,d.request)).toMatchObject({ok:true,replayed:true,world:w});
 const replacement=reduceRenewalRequest(w,renewalRequest(w,{...d.request.action,salary:2100,replaceProposalId:d.proposalId}));
 expect(replacement).toMatchObject({ok:false,world:w});expect(replacement.error).toContain('年度末成長');
 const c=command(w);c.transaction.type='replace-renewal';c.transaction.proposalId=d.proposalId;
 expect(reduceEconomyCommand(w,c)).toMatchObject({ok:false,world:w});
 const cancelled=reduceRenewalRequest(w,renewalRequest(w,{type:'cancel',proposalId:d.proposalId}));expect(cancelled.ok,cancelled.error).toBe(true);
 expect(cancelled.world.contractEconomy.decisions[0].status).toBe('cancelled');
 expect(reduceEconomyCommand(cancelled.world,growthCommand(cancelled.world)).ok).toBe(true);expect(w).toEqual(before);
});
it('allows an existing offseason reply when its trusted clock is due',()=>{
 const w=oldPending(),d=w.contractEconomy.decisions[0];w.contractEconomy.clock.offseasonTurn=d.dueTurn;
 const r=reduceRenewalRequest(w,renewalRequest(w,{type:'resolve-due'}));expect(r.ok,r.error).toBe(true);
 expect(r.world.contractEconomy.decisions[0].status).toBe('accepted');expect(validateEconomySave(r.world)).toBe('annual');
});
it('preserves replay of a shared-world offer saved before opening and leaves CPU offers available',()=>{
 const closing=renewalClosingWorld(),c=command(closing);c.transaction.proposal.contract.agreementPhase='season';
 const offered=reduceEconomyCommand(closing,c);expect(offered.ok,offered.error).toBe(true);
 const opened=openRenewalWinter(offered.world);expect(reduceEconomyCommand(opened,c)).toMatchObject({ok:true,replayed:true,world:opened});
 const cpu=command(opened),p=opened.teams[1].players[0];cpu.transaction.contractId=p.contractId;
 cpu.transaction.proposal.teamId=opened.teams[1].id;cpu.transaction.proposal.contract.playerId=p.id;
 cpu.transaction.id='cpu-offer';cpu.transaction.proposal.id='cpu-proposal';cpu.transaction.proposal.contract.contractId='cpu-contract';
 expect(reduceEconomyCommand(opened,cpu).ok).toBe(true);
});
it.each(['old native','old posted'])('retains %s winter offers without retroactive growth requirements',kind=>{
 const old=renewalFixture({phase:'offseason',date:'2026-12-01'});
 const prepared=kind==='old posted'?reduceOffseasonPostingRequest(old,offseasonPostingRequest(old)):null;
 if(prepared)expect(prepared.ok,prepared.error).toBe(true);const w=prepared?.world??old;
 expect(requiresYearEndGrowth(w)).toBe(false);
 const r=reduceRenewalRequest(w,offer(w));expect(r.ok,r.error).toBe(true);expect(validateEconomySave(r.world)).toBe('annual');
});

it('keeps the pre-growth fixed posting save readable without requiring retroactive growth',()=>{
 const w=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/yearEndOldPosting.json.gz',import.meta.url))));
 expect(validateEconomySave(w)).toBe('annual');expect(requiresYearEndGrowth(w)).toBe(false);
 const before=structuredClone(w),r=reduceOffseasonPostingRequest(w,offseasonPostingRequest(w));expect(r.ok,r.error).toBe(true);expect(r.replayed).toBe(true);expect(w).toEqual(before);
});
