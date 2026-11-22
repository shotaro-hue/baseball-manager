import { expect, it } from 'vitest';
import { snapshotAnnualSpendingProposals, quoteAnnualSpendingPlan, reserveContractProposal, commitContractReservation } from '../annualSpending';
import { createContractLedger } from '../contractLedger';
import { createSeasonContract } from '../seasonContract';
const plan = (budgetSeason=2026) => ({version:1,budgetSeason,ledger:createContractLedger(),reservations:[],resolvedReservations:[],oneOffCosts:[],
 authorizations:[0,1].flatMap(teamId=>[2026,2027,2028,2029].map(season=>({teamId,season,approvedManYen:50000,minimumRosterReserveManYen:0})))});
const proposal = (offseason=false) => ({id:'offer',type:'sign',teamId:0,offeredDate:offseason?'2026-12-01':'2026-07-01',effectiveDate:offseason?'2027-02-01':'2026-07-01',
 marketEntry:offseason?{id:'market',kind:'domestic-fa',enteredDate:'2026-11-01',originTeamId:1,compensationRank:'A',compensationBasis:{previousAnnualSalaryManYen:10000,exercise:'first'}}:{id:'market',kind:'released',enteredDate:'2026-02-01'},
 contract:createSeasonContract({contractId:'contract',playerId:'free',signedSeason:2026,agreementPhase:offseason?'offseason':'season',purpose:'acquisition',termYears:3,annualSalaryManYen:10000,guaranteed:true,registrationType:'controlled'})});
it('proposal snapshots retain delayed accepted terms and still reject altered resolution metadata',()=>{
 const p=proposal(),held=reserveContractProposal(plan(),{kind:'offer',proposal:p}),source=commitContractReservation(held,p,{effectiveDate:'2026-07-16',answeredDate:'2026-07-16'});
 const snap=snapshotAnnualSpendingProposals(source),rows=quoteAnnualSpendingPlan(source);
 expect(quoteAnnualSpendingPlan(snap)).toEqual(rows);expect(snap.resolvedReservations).toEqual(source.resolvedReservations);
 expect(Object.isFrozen(snap.resolvedReservations[0].acceptedProposal.contract)).toBe(true);
 expect(()=>quoteAnnualSpendingPlan({...snap,resolvedReservations:[{...snap.resolvedReservations[0],answeredDate:'2025-01-01'}]})).toThrow();
 source.resolvedReservations[0].acceptedProposal.effectiveDate='2026-06-01';
 expect(()=>quoteAnnualSpendingPlan(source)).toThrow();expect(quoteAnnualSpendingPlan(snap)).toEqual(rows);
 const cold=JSON.parse(JSON.stringify(snap));cold.resolvedReservations[0].acceptedProposal.effectiveDate='2026-06-01';expect(()=>quoteAnnualSpendingPlan(cold)).toThrow();
});
it('proposal snapshots retain FA compensation basis and recheck cross-hold collisions',()=>{
 const p=proposal(true),held=reserveContractProposal(plan(2027),{kind:'offer',proposal:p}),snap=snapshotAnnualSpendingProposals(held);
 expect(quoteAnnualSpendingPlan(snap)).toEqual(quoteAnnualSpendingPlan(held));
 expect(()=>quoteAnnualSpendingPlan({...snap,reservations:[...snap.reservations,snap.reservations[0]]})).toThrow();
 const accepted=commitContractReservation(snap,snap.reservations[0].proposal,{answeredDate:'2026-12-02'}),actual=commitContractReservation(held,p,{answeredDate:'2026-12-02'});
 expect(accepted).toEqual(actual);expect(quoteAnnualSpendingPlan(accepted)).toEqual(quoteAnnualSpendingPlan(actual));
 expect(()=>{snap.reservations[0].proposal.marketEntry.compensationBasis.previousAnnualSalaryManYen=0;}).toThrow();
});
it('full spending snapshots isolate other cost fields and never trust spread derivatives',()=>{
 const source=plan();source.staffContracts=[{id:'coach',teamId:0,season:2026,role:'manager',annualSalaryManYen:100}];
 source.oneOffCosts=[{id:'stadium',teamId:0,season:2026,kind:'stadium',amountManYen:500}];
 const snap=snapshotAnnualSpendingProposals(source),rows=quoteAnnualSpendingPlan(snap);
 expect(snapshotAnnualSpendingProposals(snap)).toBe(snap);
 source.staffContracts[0].annualSalaryManYen=200;source.oneOffCosts[0].amountManYen=900;
 expect(quoteAnnualSpendingPlan(snap)).toEqual(rows);expect(quoteAnnualSpendingPlan(source)).not.toEqual(rows);
 const badAuthorizations=snap.authorizations.map((r,i)=>i? r:{...r,approvedManYen:-1});
 expect(()=>quoteAnnualSpendingPlan({...snap,authorizations:badAuthorizations})).toThrow();
 expect(()=>snapshotAnnualSpendingProposals({...snap,authorizations:badAuthorizations})).toThrow();
 expect(()=>quoteAnnualSpendingPlan({...snap,budgetSeason:0})).toThrow();
 expect(()=>{snap.staffContracts[0].annualSalaryManYen=0;}).toThrow();
 expect(()=>{snap.oneOffCosts[0].amountManYen=0;}).toThrow();
});
