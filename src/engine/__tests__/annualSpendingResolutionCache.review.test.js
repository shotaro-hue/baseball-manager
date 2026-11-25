import { expect, it } from 'vitest';
import { snapshotAnnualSpendingProposals, quoteAnnualSpendingPlan, reserveContractProposal, commitContractReservation, cancelContractReservation } from '../annualSpending';
import { createContractLedger, applyContractLedgerAction, isContractLedgerSnapshotRecord } from '../contractLedger';
import { createSeasonContract } from '../seasonContract';
const plan=()=>({version:1,budgetSeason:2027,ledger:createContractLedger(),reservations:[],resolvedReservations:[],oneOffCosts:[],authorizations:[2027,2028].map(season=>({teamId:0,season,approvedManYen:50000,minimumRosterReserveManYen:0}))});
const proposal=()=>({id:'review-offer',type:'sign',teamId:0,effectiveDate:'2027-02-01',contract:createSeasonContract({contractId:'review-contract',playerId:'p',signedSeason:2026,agreementPhase:'offseason',purpose:'renewal',termYears:2,annualSalaryManYen:1000,guaranteed:true,registrationType:'controlled'})});
it('cached immutable answer must not trust a subsequently mutated plain ledger record',()=>{
 const p=proposal(),held=reserveContractProposal(plan(),{kind:'renewal',proposal:p});
 const accepted=commitContractReservation(held,p),snap=snapshotAnnualSpendingProposals(accepted);
 const mixed={...snap,ledger:JSON.parse(JSON.stringify(snap.ledger))};
 expect(quoteAnnualSpendingPlan(mixed)).toEqual(quoteAnnualSpendingPlan(snap));
 mixed.ledger.records[0].contract.annualSalaryManYen=1200;
 expect(()=>quoteAnnualSpendingPlan(mixed)).toThrow();
 expect(mixed.resolvedReservations[0].proposal.contract.annualSalaryManYen).toBe(1000);
});

it('certificate cache rechecks unbranded shallow-frozen records, missing records and copied answers',()=>{
 const p=proposal(),held=reserveContractProposal(plan(),{kind:'renewal',proposal:p});
 const snap=snapshotAnnualSpendingProposals(commitContractReservation(held,p));
 expect(isContractLedgerSnapshotRecord(snap.ledger.records[0])).toBe(true);
 const record=Object.freeze({...snap.ledger.records[0],contract:{...snap.ledger.records[0].contract}});
 expect(isContractLedgerSnapshotRecord(record)).toBe(false);
 const mixed={...snap,ledger:{...snap.ledger,records:[record]}};
 expect(quoteAnnualSpendingPlan(mixed)).toEqual(quoteAnnualSpendingPlan(snap));
 record.contract.annualSalaryManYen=1200;expect(()=>quoteAnnualSpendingPlan(mixed)).toThrow();
 expect(()=>quoteAnnualSpendingPlan({...snap,ledger:{...snap.ledger,records:[]}})).toThrow();
 const copied={...snap.resolvedReservations[0],proposal:{...p,contract:{...p.contract,annualSalaryManYen:1200}}};
 expect(()=>quoteAnnualSpendingPlan({...snap,resolvedReservations:[copied]})).toThrow();
 expect(()=>quoteAnnualSpendingPlan({...snap,resolvedReservations:[...snap.resolvedReservations,...snap.resolvedReservations]})).toThrow();
});
it('cached rejection cannot hide later reuse of the rejected proposal action ID',()=>{
 const p=proposal(),held=reserveContractProposal(plan(),{kind:'renewal',proposal:p});
 const rejected=snapshotAnnualSpendingProposals(cancelContractReservation(held,p.id,{resolution:'rejected'}));
 expect(quoteAnnualSpendingPlan(rejected)[0].salaryManYen).toBe(0);
 const signed=applyContractLedgerAction(rejected.ledger,p);
 expect(()=>quoteAnnualSpendingPlan({...rejected,ledger:signed})).toThrow();
 const cold=JSON.parse(JSON.stringify(rejected));cold.resolvedReservations[0].resolution='accepted';expect(()=>quoteAnnualSpendingPlan(cold)).toThrow();
});
