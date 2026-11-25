import {it,expect} from 'vitest';
import {renewalFixture} from './fixtures/renewalWorld';
import {reduceEconomyCommand,fromAnnualState,toAnnualState} from '../contractEconomy';
import {cpuContractsRequest} from '../annualCpuContracts';
import {MIN_SALARY_SHIHAKA} from '../../constants';
it('handles minimum-salary CPU budget failure as finite expiry',()=>{
 let w=renewalFixture({phase:'offseason',date:'2026-12-01'});
 const e=w.contractEconomy.engine;
 e.spending.ledger.records.find(r=>r.contract.playerId==='b').contract.annualSalaryManYen=MIN_SALARY_SHIHAKA;
 for(const a of e.spending.authorizations)if(a.teamId===1&&a.season>=2027)a.approvedManYen=0;
 for(const a of w.contractEconomy.budgetPolicies)if(a.teamId===1&&a.season>=2027)a.approvedManYen=0;
 w=fromAnnualState(w,toAnnualState(w));
 const r=reduceEconomyCommand(w,cpuContractsRequest(w));
 expect(r.ok,r.error).toBe(true);const row=r.world.contractEconomy.engine.transactions.at(-1).cpuContracts.rows[0];expect(row.outcome).toBe('expiry');expect(row.attempts).toHaveLength(6);
});
