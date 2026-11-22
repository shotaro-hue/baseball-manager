import {expect,it} from 'vitest';
import {snapshotContractLedger,contractLiabilityRows,applyContractLedgerAction,isContractLedgerExtension,createContractLedger} from '../contractLedger';
import {renewalFixture} from './fixtures/renewalWorld';
it('isolates immutable inspection snapshots while mutable and cold records are validated afresh',()=>{
 const original=renewalFixture().contractEconomy.engine.spending.ledger;
 const snapshot=snapshotContractLedger(original),expected=contractLiabilityRows(snapshot);
 original.records[0].contract.annualSalaryManYen=-1;
 expect(contractLiabilityRows(snapshot)).toEqual(expected);expect(()=>contractLiabilityRows(original)).toThrow();
 const cold=JSON.parse(JSON.stringify(snapshot));cold.records[0].contract.annualSalaryManYen=-1;expect(()=>contractLiabilityRows(cold)).toThrow();
 expect(()=>{snapshot.records[0].contract.annualSalaryManYen=-1;}).toThrow();
});
it('rechecks cross-record identity collisions even with inspected immutable records',()=>{
 const ledger=snapshotContractLedger(renewalFixture().contractEconomy.engine.spending.ledger);
 expect(()=>contractLiabilityRows({...ledger,records:[...ledger.records,ledger.records[0]]})).toThrow();
 expect(()=>applyContractLedgerAction(ledger,{id:'wrong',type:'end',contractId:'missing',teamId:0,effectiveDate:'2026-07-16',reason:'release',settlement:'retain'})).toThrow();
});
it('keeps opted-in transaction results isolated and immutable without freezing ordinary callers',()=>{
 const native=renewalFixture().contractEconomy.engine.spending.ledger,source=native.records[0];
 const action={id:'snapshot-increase',type:'increase',teamId:source.initialTeamId,
  contractId:source.contract.contractId,effectiveDate:'2026-07-01',annualSalaryManYen:source.contract.annualSalaryManYen+100};
 const ordinary=applyContractLedgerAction(native,action),next=applyContractLedgerAction(snapshotContractLedger(native),action);
 expect(next).toEqual(ordinary);expect(Object.isFrozen(ordinary)).toBe(false);
 expect(Object.isFrozen(next)).toBe(true);expect(Object.isFrozen(next.records[0].changes[0])).toBe(true);
 expect(()=>{next.records[0].changes[0].annualSalaryManYen=-1;}).toThrow();
 action.annualSalaryManYen=-1;expect(contractLiabilityRows(next)).toEqual(contractLiabilityRows(ordinary));
 const cold=JSON.parse(JSON.stringify(next));cold.records[0].changes[0].annualSalaryManYen=-1;
 expect(()=>contractLiabilityRows(cold)).toThrow();
});
it('validates shared mutable inputs and preserves changes and closed-year checks during extension comparison',()=>{
 const ledger=renewalFixture().contractEconomy.engine.spending.ledger;
 expect(isContractLedgerExtension(ledger,ledger)).toBe(true);
 const altered=structuredClone(ledger);altered.records[0].contract.annualSalaryManYen+=100;
 expect(isContractLedgerExtension(ledger,altered)).toBe(false);
 const source=ledger.records[0];
 const extra=applyContractLedgerAction(createContractLedger(),{id:'extra-sign',type:'sign',teamId:0,effectiveDate:source.effectiveDate,
  contract:{...source.contract,contractId:'extra-contract',playerId:'extra-player'}}).records[0];
 const closed={...ledger,closedThroughSeason:2026};
 expect(isContractLedgerExtension(closed,{...closed,records:[...closed.records,extra]})).toBe(false);
 ledger.records[0].contract.annualSalaryManYen=-1;
 expect(()=>isContractLedgerExtension(ledger,ledger)).toThrow();
 expect(()=>snapshotContractLedger({...snapshotContractLedger(altered),closedThroughSeason:-1})).toThrow();
});
