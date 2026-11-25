import { expect, it } from 'vitest';
import { renewalFixture } from '../src/engine/__tests__/fixtures/renewalWorld';
import { reduceEconomyCommand, fromAnnualState, toAnnualState } from '../src/engine/contractEconomy';
import { cpuContractsRequest } from '../src/engine/annualCpuContracts';
import { validateEconomySave } from '../src/engine/economyPersistence';
const settled=(expiry=false)=>{
 let w=renewalFixture({phase:'offseason',date:'2026-12-01'});
 if(expiry){for(const r of w.contractEconomy.engine.spending.authorizations)if(r.teamId===1&&r.season>=2027)r.approvedManYen=0;for(const r of w.contractEconomy.budgetPolicies)if(r.teamId===1&&r.season>=2027)r.approvedManYen=0;w=fromAnnualState(w,toAnnualState(w));}
 const result=reduceEconomyCommand(w,cpuContractsRequest(w));expect(result.ok,result.error).toBe(true);return result.world;
};
it('save validator rechecks accepted promise mismatches in cold and immutable-hold/mutable-ledger inputs',()=>{
 for(const cold of [false,true]){
  const source=settled(),world=cold?JSON.parse(JSON.stringify(source)):source;
  world.contractEconomy.engine.spending.ledger=JSON.parse(JSON.stringify(world.contractEconomy.engine.spending.ledger));
  const before=JSON.stringify(world);expect(validateEconomySave(world)).toBe('annual');expect(JSON.stringify(world)).toBe(before);
  const future=world.contractEconomy.engine.spending.ledger.records.find(r=>r.contract.purpose==='renewal');future.contract.annualSalaryManYen+=100;
  expect(()=>validateEconomySave(world)).toThrow();
 }
});
it('save validator does not retain successful roster, budget, market or history verdicts',()=>{
 const original=JSON.parse(JSON.stringify(settled(true)));
 for(const change of [w=>w.teams[0].players[0].salary++,w=>w.teams[0].budget++,w=>w.faPool.splice(w.faPool.findIndex(p=>p.id==='b'),1),w=>w.teams[1].history[0].exitReason='changed']){
  const world=structuredClone(original);expect(validateEconomySave(world)).toBe('annual');change(world);expect(()=>validateEconomySave(world)).toThrow();
 }
});
it('save validator rejects removal of the accepted contract and its answer after a previous successful inspection',()=>{
 const world=JSON.parse(JSON.stringify(settled()));expect(validateEconomySave(world)).toBe('annual');
 world.contractEconomy.engine.spending.ledger.records=world.contractEconomy.engine.spending.ledger.records.filter(r=>r.contract.purpose!=='renewal');
 world.contractEconomy.engine.spending.resolvedReservations=[];
 expect(()=>validateEconomySave(world)).toThrow();
});
