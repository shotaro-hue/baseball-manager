import { expect, it } from 'vitest';
import { renewalFixture } from './fixtures/renewalWorld';
import { economyPolicy } from './fixtures/economyWorld';
import { createAnnualNewGameWorld, fromAnnualState, toAnnualState, reduceEconomyCommand } from '../contractEconomy';
import { applyAnnualTransaction } from '../annualTransactions';
import { cpuContractsRequest } from '../annualCpuContracts';
import { quoteAnnualSpendingPlan } from '../annualSpending';

const winter=()=>renewalFixture({phase:'offseason',date:'2026-12-01'});
function authorize(w,teamId,season,amount){
 w.contractEconomy.engine.spending.authorizations.find(r=>r.teamId===teamId&&r.season===season).approvedManYen=amount;
 w.contractEconomy.budgetPolicies.find(r=>r.teamId===teamId&&r.season===season).approvedManYen=amount;
 return fromAnnualState(w,toAnnualState(w));
}
function compareCanonical(w){
 const r=reduceEconomyCommand(w,cpuContractsRequest(w));expect(r.ok,r.error).toBe(true);
 const n=r.world,children=n.contractEconomy.engine.transactions.slice(w.contractEconomy.engine.transactions.length,-1);
 let canonical=toAnnualState(w);
 for(const child of children){const result=applyAnnualTransaction(canonical,JSON.parse(child.signature));expect(result.ok,result.error).toBe(true);canonical=result.state;}
 expect(canonical.spending).toEqual(toAnnualState(n).spending);
 expect(canonical.teams.map(t=>({players:t.players,farm:t.farm,history:t.history}))).toEqual(n.teams.map(t=>({players:t.players,farm:t.farm,history:t.history})));
 expect(canonical.faPool).toEqual(n.faPool);
 expect(quoteAnnualSpendingPlan(canonical.spending)).toEqual(quoteAnnualSpendingPlan(toAnnualState(n).spending));
 return n;
}
it('CPU optimized renewals match canonical child transactions with future-budget fallback',()=>{
 const n=compareCanonical(authorize(winter(),1,2028,0));
 const row=n.contractEconomy.engine.transactions.at(-1).cpuContracts.rows[0];expect(row.outcome).toBe('renewed');expect(row.attempts.at(-1).years).toBe(1);
});
it('CPU optimized renewals preserve canonical refusal when already below the roster funding floor',()=>{
 const n=compareCanonical(authorize(winter(),1,2027,419));
 expect(n.contractEconomy.engine.transactions.at(-1).cpuContracts.rows[0].outcome).toBe('expiry');
 expect(quoteAnnualSpendingPlan(toAnnualState(n).spending).find(r=>r.teamId===1&&r.season===2027).remainingManYen).toBe(-1);
});
it('CPU optimized development renewal matches canonical spending and registration',()=>{
 const teams=structuredClone(winter().teams);teams[1].players[0].isIkusei=true;teams[1].players[0].ikuseiYears=1;
 let w=createAnnualNewGameWorld({teams,faPool:[],myId:0,saveId:'review-dev-admission',season:2026,policy:economyPolicy(teams),randomRoot:{algorithmVersion:1,seed:'review'}});
 w.contractEconomy.clock={season:2026,phase:'offseason',date:'2026-12-01',offseasonTurn:0};w.contractEconomy.engine.spending.budgetSeason=2027;
 const n=compareCanonical(fromAnnualState(w,toAnnualState(w)));
 expect(n.contractEconomy.engine.spending.ledger.records.at(-1).contract.registrationType).toBe('development');
});
