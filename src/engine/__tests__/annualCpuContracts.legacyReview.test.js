import {it,expect} from 'vitest';
import {offseasonPostingWorld} from './fixtures/offseasonPosting';
import {reduceEconomyCommand} from '../contractEconomy';
import {cpuContractsRequest} from '../annualCpuContracts';
import {validateEconomySave} from '../economyPersistence';
it('rejects CPU settlement while a legacy CPU retirement remains unfinalized',()=>{
 const w=offseasonPostingWorld();
 const pending=w.contractEconomy.engine.retirementReservations.filter(r=>r.teamId!==w.myId&&!r.finalization);expect(pending.length).toBeGreaterThan(0);
 const before=structuredClone(w);const r=reduceEconomyCommand(w,cpuContractsRequest(w));expect(r).toMatchObject({ok:false,world:w});expect(w).toEqual(before);
});
