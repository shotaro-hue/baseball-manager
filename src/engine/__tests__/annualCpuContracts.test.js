import { faWinter } from './fixtures/faDeclarations';
import { economyPolicy, renewalEnvelope } from './fixtures/economyWorld';
import { reviewRenewalWinter } from './fixtures/renewalGrowth';
import { expect, it } from 'vitest';
import { renewalFixture } from './fixtures/renewalWorld';
import { createAnnualNewGameWorld, fromAnnualState, reduceEconomyCommand, toAnnualState } from '../contractEconomy';
import { cpuContractsRequest } from '../annualCpuContracts';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { contractEmploymentAt } from '../contractLedger';

const winter = () => renewalFixture({ phase:'offseason', date:'2026-12-01' });
const run = w => reduceEconomyCommand(w,cpuContractsRequest(w));
const good = r => { expect(r.ok,r.error).toBe(true);expect(validateEconomySave(r.world)).toBe('annual');return r.world; };
it('renews CPU through guaranteed ledger promises, leaving current salary and human decisions intact',()=>{
 const w=winter(),before=structuredClone(w),req=cpuContractsRequest(w),n=good(run(w));
 expect(w).toEqual(before);expect(n.contractEconomy.revision).toBe(w.contractEconomy.revision+1);
 expect(n.teams[0]).toEqual(w.teams[0]);expect(n.teams[1].players).toEqual(w.teams[1].players);
 const future=contractEmploymentAt(toAnnualState(n).spending.ledger,'2027-02-01').find(e=>e.teamId===1);
 expect(future.contract.purpose).toBe('renewal');expect(future.contract.guaranteed).toBe(true);
 expect(n.contractEconomy.engine.spending.reservations).toHaveLength(0);
 expect(n.contractEconomy.engine.transactions.at(-1).cpuContracts.rows[0]).toMatchObject({outcome:'renewed'});
 expect(economyOverwriteIssue(w,n)).toBeNull();
 expect(reduceEconomyCommand(JSON.parse(JSON.stringify(n)),req)).toMatchObject({ok:true,replayed:true});
});
it('falls back to a single year when the second year lacks budget',()=>{
 const w=winter();for(const a of w.contractEconomy.engine.spending.authorizations)if(a.teamId===1&&a.season===2028)a.approvedManYen=0;
 for(const a of w.contractEconomy.budgetPolicies)if(a.teamId===1&&a.season===2028)a.approvedManYen=0;
 const n=good(run(w)),row=n.contractEconomy.engine.transactions.at(-1).cpuContracts.rows[0];
 expect(row.outcome).toBe('renewed');expect(row.attempts.some(a=>a.years===2&&!a.admitted)).toBe(true);
 expect(row.attempts.at(-1).years).toBe(1);
});
it('supplies unaffordable expiry through the formal market, roster removal and history',()=>{
 const w=winter();for(const a of w.contractEconomy.engine.spending.authorizations)if(a.teamId===1&&a.season>=2027)a.approvedManYen=0;
 for(const a of w.contractEconomy.budgetPolicies)if(a.teamId===1&&a.season>=2027)a.approvedManYen=0;
 // Refresh projected wallet from the authoritative annual rows.
 const n=good(run(w)),row=n.contractEconomy.engine.transactions.at(-1).cpuContracts.rows[0];
 expect(row).toMatchObject({outcome:'expiry'});expect(row.reason).toBeTruthy();
 expect(n.teams[1].players).toHaveLength(0);expect(n.teams[1].history.at(-1).exitReason).toBe('契約満了');
 expect(n.faPool.find(p=>p.id==='b')).toMatchObject({departureReason:'expiry',isWaiverReleased:true,marketEntry:{kind:'released'}});
 expect(n.contractEconomy.engine.offseasonDepartures).toHaveLength(1);
});
it('refuses CPU pending reservations and forged human delegation without mutation',()=>{
 const w=winter(),r=cpuContractsRequest(w);r.transaction.humanTeamId=1;
 expect(reduceEconomyCommand(w,r)).toMatchObject({ok:false,world:w});
});
it('rejects missing result rows or changed terminal proof after JSON reload',()=>{
 const n=good(run(winter()));for(const edit of [g=>g.rows.pop(),g=>g.rows[0].transactionIds.pop(),g=>g.rows[0].outcome='expiry']){
  const bad=structuredClone(n);edit(bad.contractEconomy.engine.transactions.at(-1).cpuContracts);
  expect(()=>validateEconomySave(bad)).toThrow();
 }
});
it('keeps an existing accepted future contract without a second offer',()=>{
 const w=good(run(winter())),n=structuredClone(w);
 // Removing an entire parent is forbidden even if the child transactions remain.
 n.contractEconomy.engine.transactions.pop();expect(()=>validateEconomySave(n)).toThrow();
});

it('declares overseas FA formally and retains the listing until a separate market outcome',()=>{
 const w=faWinter();w.myId=1;
 for(const t of w.teams)for(const p of [...t.players,...t.farm])p.personality={overseas:100};
 const n=good(run(w)),g=n.contractEconomy.engine.transactions.at(-1).cpuContracts;
 expect(g.rows.every(r=>r.outcome==='overseas-fa')).toBe(true);
 expect(n.contractEconomy.engine.faDeclarations).toHaveLength(12);expect(n.faPool).toHaveLength(12);
 expect(n.faPool.every(p=>p.marketEntry.kind==='overseas-fa'&&!p.isWaiverReleased)).toBe(true);
 expect(n.contractEconomy.engine.spending.ledger).toEqual(w.contractEconomy.engine.spending.ledger);
});
it('refuses an unresolved CPU offer and a stale command atomically',()=>{
 const w=winter(),r=renewalEnvelope(w);r.transaction.proposal.teamId=1;r.transaction.proposal.contract.playerId='b';r.transaction.contractId=w.teams[1].players[0].contractId;r.transaction.proposal.contract.agreementPhase='offseason';
 const held=good(reduceEconomyCommand(w,r)),before=structuredClone(held);
 expect(run(held)).toMatchObject({ok:false,world:held});expect(held).toEqual(before);
 expect(reduceEconomyCommand(held,cpuContractsRequest(w))).toMatchObject({ok:false,world:held});
});
it('refuses new CPU settlement before saved growth, without touching old turn replies',()=>{
 const w=reviewRenewalWinter(),before=structuredClone(w);expect(run(w)).toMatchObject({ok:false,world:w});expect(w).toEqual(before);
});
it('does not renegotiate an accepted CPU future promise',()=>{
 const w=winter(),r=renewalEnvelope(w);r.transaction.proposal.teamId=1;r.transaction.proposal.contract.playerId='b';r.transaction.contractId=w.teams[1].players[0].contractId;r.transaction.proposal.contract.agreementPhase='offseason';
 const held=good(reduceEconomyCommand(w,r)),accepted=good(reduceEconomyCommand(held,{...cpuContractsRequest(held),transaction:{id:'preaccepted',type:'accept-renewal',proposalId:'renewal',contractId:r.transaction.contractId}}));
 const n=good(run(accepted));expect(n.contractEconomy.engine.transactions.at(-1).cpuContracts.rows[0].outcome).toBe('continuing');
 expect(n.contractEconomy.engine.spending).toEqual(accepted.contractEconomy.engine.spending);
});
it('renews development registration without controlled conversion and expires a completed development term',()=>{
 for(const years of [1,3]){
  const teams=structuredClone(winter().teams);teams[1].players[0].isIkusei=true;teams[1].players[0].ikuseiYears=years;
  let w=createAnnualNewGameWorld({teams,faPool:[],myId:0,saveId:'development-cpu',season:2026,policy:economyPolicy(teams),randomRoot:{algorithmVersion:1,seed:'cpu'}});
  w.contractEconomy.clock={season:2026,phase:'offseason',date:'2026-12-01',offseasonTurn:0};w.contractEconomy.engine.spending.budgetSeason=2027;
  w=fromAnnualState(w,toAnnualState(w));const n=good(run(w));
  if(years===3){expect(n.faPool[0]).toMatchObject({isIkusei:true,departureReason:'expiry'});}
  else{expect(contractEmploymentAt(n.contractEconomy.engine.spending.ledger,'2027-02-01').find(e=>e.teamId===1).registrationType).toBe('development');}
 }
});
it('refunds its own active forecast when checking a fully allocated renewal budget',()=>{
 let w=winter();const spending=w.contractEconomy.engine.spending;
 spending.renewalPlans=[{teamId:1,playerId:'b',sourceContractId:w.teams[1].players[0].contractId,season:2027,amountManYen:1000,basis:'recorded-forecast'}];
 for(const a of spending.authorizations)if(a.teamId===1&&a.season>=2027)a.approvedManYen=a.season===2027?1000:0;
 for(const a of w.contractEconomy.budgetPolicies)if(a.teamId===1&&a.season>=2027)a.approvedManYen=a.season===2027?1000:0;
 w=fromAnnualState(w,toAnnualState(w));const n=good(run(w));
 expect(n.contractEconomy.engine.transactions.at(-1).cpuContracts.rows[0].outcome).toBe('renewed');
 expect(n.teams[1].budget).toBe(0);
});
it('refuses a malformed below-minimum annual contract before CPU judgment without rewriting it',()=>{
 const w=winter();w.contractEconomy.engine.spending.ledger.records.find(r=>r.contract.playerId==='b').contract.annualSalaryManYen=100;
 const before=structuredClone(w);expect(run(w)).toMatchObject({ok:false,world:w});expect(w).toEqual(before);
});
