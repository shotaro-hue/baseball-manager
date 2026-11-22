import { expect, it } from 'vitest';
import { createContractLedger, applyContractLedgerAction, snapshotContractLedger, contractLiabilityRows, contractEmploymentAt, contractEmploymentsAt } from '../contractLedger';
import { createSeasonContract } from '../seasonContract';

const sign = (contractId='source',actionId='sign') => ({id:actionId,type:'sign',teamId:0,effectiveDate:'2026-02-01',contract:createSeasonContract({contractId,playerId:'p',signedSeason:2026,agreementPhase:'preseason',purpose:'acquisition',termYears:3,annualSalaryManYen:1000,guaranteed:true,registrationType:'controlled'})});
const commands=[sign(),{id:'transfer',type:'transfer',contractId:'source',teamId:0,toTeamId:1,effectiveDate:'2026-06-01'},
 {id:'increase',type:'increase',contractId:'source',teamId:1,effectiveDate:'2026-07-01',annualSalaryManYen:1200},
 {id:'end',type:'end',contractId:'source',teamId:1,effectiveDate:'2026-08-01',reason:'release',settlement:'retain'}];
it('immutable ledger snapshots match native transfer, increase and retained-guarantee projections',()=>{
 let native=createContractLedger(),snap=createContractLedger();
 for(const c of commands){
  native=applyContractLedgerAction(native,c);snap=snapshotContractLedger(applyContractLedgerAction(snap,c));
  expect(contractLiabilityRows(snap)).toEqual(contractLiabilityRows(native));
  const dates=['2026-02-01','2026-06-01','2026-07-01','2026-08-01','2027-02-01','2028-11-30'];
  expect(contractEmploymentsAt(snap,dates)).toEqual(contractEmploymentsAt(native,dates));
  for(const date of dates)expect(contractEmploymentAt(snap,date)).toEqual(contractEmploymentAt(native,date));
  expect(JSON.parse(JSON.stringify(snap))).toEqual(native);
 }
});
it('snapshot cache cannot hide a new overlap or an edited copy of a frozen record',()=>{
 const ledger=snapshotContractLedger(applyContractLedgerAction(createContractLedger(),sign()));
 expect(()=>applyContractLedgerAction(ledger,sign('other','other-sign'))).toThrow('重複');
 const copy={...ledger.records[0],changes:[{id:'bad-increase',type:'increase',contractId:'source',teamId:0,effectiveDate:'2026-07-01',annualSalaryManYen:500}]};
 expect(()=>contractLiabilityRows({...ledger,records:[copy]})).toThrow('引き下げ');
 expect(contractLiabilityRows(ledger).map(r=>r.amountManYen)).toEqual([1000,1000,1000]);
});
