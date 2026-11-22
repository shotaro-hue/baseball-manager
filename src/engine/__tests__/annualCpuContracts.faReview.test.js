import { expect, it } from 'vitest';
import { faWinter } from './fixtures/faDeclarations';
import { cpuContractsRequest } from '../annualCpuContracts';
import { reduceEconomyCommand, fromAnnualState, toAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';

function qualifiedCpuWinter() {
 const w=faWinter();w.myId=1;
 for(const a of w.contractEconomy.engine.spending.authorizations)if(a.teamId===0&&a.season>=2027)a.approvedManYen=0;
 for(const a of w.contractEconomy.budgetPolicies)if(a.teamId===0&&a.season>=2027)a.approvedManYen=0;
 return fromAnnualState(w,toAnnualState(w));
}
it('CPU budget failure declares qualified domestic FA with formal ranks, market and history after reload',()=>{
 const w=qualifiedCpuWinter(),before=structuredClone(w);
 const r=reduceEconomyCommand(w,cpuContractsRequest(w));expect(r.ok,r.error).toBe(true);
 const n=JSON.parse(JSON.stringify(r.world));expect(validateEconomySave(n)).toBe('annual');expect(w).toEqual(before);
 const g=n.contractEconomy.engine.transactions.at(-1).cpuContracts;
 expect(g.rows).toHaveLength(12);expect(g.rows.every(r=>r.outcome==='domestic-fa'&&r.reason&&r.attempts.length<=6)).toBe(true);
 expect(n.contractEconomy.engine.spending.reservations).toHaveLength(0);
 const departures=n.contractEconomy.engine.faDeclarations;expect(departures).toHaveLength(12);
 expect(n.teams[0].players).toHaveLength(0);expect(n.teams[0].farm).toHaveLength(0);expect(n.teams[0].history).toHaveLength(12);
 for(const p of n.faPool){
  expect(p).toMatchObject({isFA:true,isWaiverReleased:false,departureReason:'domestic-fa',marketEntry:{kind:'domestic-fa',originTeamId:0}});
  expect(p.marketEntry.compensationRank).toBe(p.id<=2?'A':p.id<=9?'B':'C');
  expect(departures.find(d=>d.player.id===p.id)?.marketEntry).toEqual(p.marketEntry);
  expect(n.teams[0].history.find(h=>h.id===p.id)?.faDeclarationId).toBe(p.faDeclarationId);
 }
 expect(n.teams[1]).toEqual(w.teams[1]);expect(n.contractEconomy.engine.spending.ledger).toEqual(w.contractEconomy.engine.spending.ledger);
 expect(economyOverwriteIssue(w,n)).toBeNull();
 expect(reduceEconomyCommand(n,cpuContractsRequest(w))).toMatchObject({ok:true,replayed:true,world:n});
});
it('CPU FA rank boundary tie rejects the whole batch with no published children or changed revision',()=>{
 const w=qualifiedCpuWinter(),records=w.contractEconomy.engine.spending.ledger.records;
 // Salary positions 3 and 4 share a number: this crosses compensation A/B.
 records.find(r=>r.contract.playerId===3).contract.annualSalaryManYen=records.find(r=>r.contract.playerId===2).contract.annualSalaryManYen;
 const source=fromAnnualState(w,toAnnualState(w)),before=structuredClone(source);
 const result=reduceEconomyCommand(source,cpuContractsRequest(source));
 expect(result).toMatchObject({ok:false,replayed:false,world:source});expect(result.error).toContain('ランク境界');expect(source).toEqual(before);
 expect(source.contractEconomy.engine.transactions.some(t=>t.cpuContracts||JSON.parse(t.id)[0]==='cpu-contract-child')).toBe(false);
 expect(validateEconomySave(source)).toBe('annual');
});
