import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange, IDBObjectStore } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { inSeasonWorld } from '../src/engine/__tests__/fixtures/inSeasonDepartures';
import { reserve, finish, winter } from '../src/engine/__tests__/fixtures/annualRetirements';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { makeCareerEntry } from '../src/engine/careerStats';
import { rootBodyReference, readRootBody, MAX_INLINE_ROOT_BYTES } from '../src/engine/saveRootBodies';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
const primary = 'baseball_manager_v1';
let rows, current, expected, bindings;
const roots = () => [primary,primary+'_bk1',primary+'_bk2'].map(k=>rows.get(k));
beforeEach(()=>{
  rows=new Map();vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});
  vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('IDBKeyRange',IDBKeyRange);
  for(const level of ['log','warn','error','table'])vi.spyOn(console,level).mockImplementation(()=>{});
  current={world:inSeasonWorld(),progressToken:3,sessionToken:7};
  current.world.teams[0].players[0].careerLog=[makeCareerEntry({HR:17},{},2025,0,'Club 0')];
  current.world.teams[0].players[0].stats={HR:30};
  bindings={readCurrent:()=>current,adopt:async(world,ack,canAdopt)=>{
    if(!canAdopt())return false;
    current={...current,world:gameStateReducer(current.world,{type:G.APPLY_ECONOMY_WORLD,world,expected}),progressToken:current.progressToken+1};return true;
  }};
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const commit = (command,options) => {
  const w=current.world;expected={saveId:w.saveId,epoch:w.contractEconomy.epoch,baseRevision:w.contractEconomy.revision,progressToken:current.progressToken,sessionToken:current.sessionToken};
  const result=reduceEconomyCommand(w,command);expect(result.ok,result.error).toBe(true);
  return saves.commitEconomyCandidate(result.world,expected,bindings,options);
};
it.each([false,true])('publishes reservation and finalization with actual root readback, cold reload and replay (external=%s)',async large=>{
  const options=large?{skipCompression:true}:{};
  if(large)current.world.padding='large'.repeat(20000);
  expect((await saves.saveGame(current.world,options)).ok).toBe(true);
  const c=reserve(current.world);expect((await commit(c,options)).ok).toBe(true);
  expect(Boolean(rootBodyReference(rows.get(primary)))).toBe(large);
  const body=await readRootBody(rows.get(primary));expect(new TextEncoder().encode(body).length > MAX_INLINE_ROOT_BYTES).toBe(large);
  current.world=await saves.loadGame();
  expect(reduceEconomyCommand(current.world,c)).toMatchObject({ok:true,replayed:true});
  current.world=winter(current.world);current.world.contractEconomy.revision++;current.progressToken++;
  expect((await saves.saveGame(current.world,options)).ok).toBe(true);
  const f=finish(current.world);const result=await commit(f,options);
  expect(result).toMatchObject({ok:true,committed:{revision:3,receiptIds:['retire-0','finish']}});
  const loaded=await saves.loadGame();
  expect(loaded.teams[0].history).toHaveLength(1);expect(loaded.teams[0].history[0].recentCareerLog.map(e=>e.year)).toEqual([2025,2026]);
  expect(loaded.contractEconomy).toEqual(current.world.contractEconomy);
  const detailed=await saves.loadPlayerCareerLogById('0',loaded.saveId);
  expect(detailed.map(e=>[e.year,e.stats.HR])).toEqual([[2025,17],[2026,30]]);
  expect(reduceEconomyCommand(loaded,c)).toMatchObject({ok:true,replayed:true});
  expect(reduceEconomyCommand(loaded,f)).toMatchObject({ok:true,replayed:true});
  expect(Boolean(rootBodyReference(rows.get(primary)))).toBe(large);
});
it.each(['reservation','finalization'])('keeps the old world and roots on %s save failure and permits retry',async phase=>{
  const options={};
  if(phase==='finalization'){
    const n=reduceEconomyCommand(current.world,reserve(current.world));expect(n.ok).toBe(true);current.world=winter(n.world);
  }
  expect((await saves.saveGame(current.world,options)).ok).toBe(true);
  const c=phase==='reservation'?reserve(current.world):finish(current.world), before=roots(), old=current.world, set=localStorage.setItem;
  localStorage.setItem=(k,v)=>{if(k===primary)throw new Error('disk unavailable');set(k,v);};
  expect((await commit(c,options)).ok).toBe(false);expect(current.world).toBe(old);expect(roots()).toEqual(before);
  expect((await saves.loadPlayerCareerLogById('0',old.saveId)).map(e=>e.year)).toEqual([2025]);
  localStorage.setItem=set;expect((await commit(c,options)).ok).toBe(true);
  expect((await saves.loadPlayerCareerLogById('0',old.saveId)).map(e=>e.year)).toEqual(phase==='reservation'?[2025]:[2025,2026]);
  const loaded=await saves.loadGame();expect(reduceEconomyCommand(loaded,c)).toMatchObject({ok:true,replayed:true});
});
it('rejects deletion of both final receipt and history without publishing a new root',async()=>{
  const n=reduceEconomyCommand(current.world,reserve(current.world));expect(n.ok).toBe(true);current.world=winter(n.world);
  expect((await saves.saveGame(current.world)).ok).toBe(true);expect((await commit(finish(current.world))).ok).toBe(true);
  const before=roots(), broken=structuredClone(current.world);broken.contractEconomy.revision++;
  broken.contractEconomy.engine.transactions.pop();broken.teams[0].history=[];
  expect((await saves.saveGame(broken)).ok).toBe(false);expect(roots()).toEqual(before);
});

it('aborted career generation does not publish retirement and retry archives exactly once',async()=>{
  const n=reduceEconomyCommand(current.world,reserve(current.world));expect(n.ok).toBe(true);current.world=winter(n.world);
  expect((await saves.saveGame(current.world)).ok).toBe(true);const old=current.world,before=roots(),command=finish(old);
  const add=IDBObjectStore.prototype.add;
  const abort=vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(row,key){
    const request=add.call(this,row,key);if(row.scope==='careerLogs')this.transaction.abort();return request;
  });
  expect((await commit(command)).ok).toBe(false);expect(current.world).toBe(old);expect(roots()).toEqual(before);
  expect((await saves.loadPlayerCareerLogById('0',old.saveId)).map(e=>e.year)).toEqual([2025]);
  abort.mockRestore();expect((await commit(command)).ok).toBe(true);
  expect((await saves.loadPlayerCareerLogById('0',old.saveId)).map(e=>e.year)).toEqual([2025,2026]);
  expect((await saves.saveGame(current.world)).ok).toBe(true);
  expect((await saves.loadPlayerCareerLogById('0',old.saveId)).map(e=>e.year)).toEqual([2025,2026]);
});
