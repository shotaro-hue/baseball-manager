import {expect,it} from 'vitest';
import {snapshotAnnualSpendingProposals,quoteAnnualSpendingPlan} from '../annualSpending';
import {renewalFixture} from './fixtures/renewalWorld';
import {renewalEnvelope} from './fixtures/economyWorld';
import {reduceEconomyCommand} from '../contractEconomy';
it('isolates frozen proposal snapshots without trusting mutable or cold-loaded proposals',()=>{
 const w=renewalFixture(),r=reduceEconomyCommand(w,renewalEnvelope(w));expect(r.ok,r.error).toBe(true);
 const source=r.world.contractEconomy.engine.spending,snapshot=snapshotAnnualSpendingProposals(source),rows=quoteAnnualSpendingPlan(snapshot);
 expect(rows).toEqual(quoteAnnualSpendingPlan(source));
 expect(()=>{rows[0].remainingManYen=99999999;}).toThrow();
 source.authorizations[0].approvedManYen=0;expect(quoteAnnualSpendingPlan(snapshot)).toEqual(rows);
 source.reservations[0].proposal.contract.annualSalaryManYen=-1;
 expect(quoteAnnualSpendingPlan(snapshot)).toEqual(rows);expect(()=>quoteAnnualSpendingPlan(source)).toThrow();
 const cold=JSON.parse(JSON.stringify(snapshot));cold.reservations[0].proposal.contract.annualSalaryManYen=-1;expect(()=>quoteAnnualSpendingPlan(cold)).toThrow();
 expect(()=>{snapshot.reservations[0].proposal.contract.annualSalaryManYen=-1;}).toThrow();
});
