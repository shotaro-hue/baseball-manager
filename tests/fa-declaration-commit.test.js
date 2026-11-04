import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { IDBFactory,IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { faWinter,declaration } from '../src/engine/__tests__/fixtures/faDeclarations';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { nativeFaExerciseOrigins } from '../src/engine/annualFaDeclarations';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { gameStateReducer,G } from '../src/hooks/gameStateReducer';
import { rootBodyReference,readRootBody,MAX_INLINE_ROOT_BYTES } from '../src/engine/saveRootBodies';
const primary='baseball_manager_v1';let rows,current,expected,bindings;
const surface=()=>vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});
const roots=()=>[primary,primary+'_bk1',primary+'_bk2'].map(k=>rows.get(k));
beforeEach(()=>{
  rows=new Map();surface();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('IDBKeyRange',IDBKeyRange);
  for(const level of ['log','warn','error','table'])vi.spyOn(console,level).mockImplementation(()=>{});
  current={world:faWinter(),sessionToken:7,progressToken:3};
  expected={saveId:current.world.saveId,epoch:current.world.contractEconomy.epoch,baseRevision:0,sessionToken:7,progressToken:3};
  bindings={readCurrent:()=>current,adopt:async(world,ack,canAdopt)=>{if(!canAdopt())return false;
    current={...current,world:gameStateReducer(current.world,{type:G.APPLY_ECONOMY_WORLD,world,expected}),progressToken:4};return true;}};
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
const candidate=command=>{const r=reduceEconomyCommand(current.world,command);expect(r.ok,r.error).toBe(true);return r.world;};
it.each([false,true])('publishes a complete FA declaration and replays after cold load (external=%s)',async large=>{
  const options={skipCompression:large};if(large)current.world.padding='large'.repeat(20000);
  expect((await saves.saveGame(current.world,options)).ok).toBe(true);
  const c=declaration(current.world),next=candidate(c),r=await saves.commitEconomyCandidate(next,expected,bindings,options);
  expect(r).toMatchObject({ok:true,committed:{revision:1,receiptIds:[c.transaction.id]}});
  const raw=rows.get(primary),body=await readRootBody(raw);expect(Boolean(rootBodyReference(raw))).toBe(large);expect(body.length*2>MAX_INLINE_ROOT_BYTES).toBe(large);
  surface();const loaded=await saves.loadGame();expect(validateEconomySave(loaded)).toBe('annual');expect(loaded.contractEconomy).toEqual(next.contractEconomy);
  expect(loaded.teams[0].history).toHaveLength(1);expect(loaded.faPool[0].marketEntry.compensationBasis).toMatchObject({previousAnnualSalaryManYen:12000,exercise:'first'});
  expect(reduceEconomyCommand(loaded,c)).toMatchObject({ok:true,replayed:true});
});
it.each([false,true])('keeps the original roots/world on failed declaration publication and permits retry (external=%s)',async large=>{
  const options={skipCompression:large};if(large)current.world.padding='large'.repeat(20000);
  expect((await saves.saveGame(current.world,options)).ok).toBe(true);const before=roots(),old=current.world,c=declaration(old),next=candidate(c),set=localStorage.setItem;
  localStorage.setItem=(k,v)=>{if(k===primary)throw new Error('disk unavailable');set(k,v);};
  expect((await saves.commitEconomyCandidate(next,expected,bindings,options)).ok).toBe(false);expect(roots()).toEqual(before);expect(current.world).toBe(old);
  localStorage.setItem=set;expect((await saves.commitEconomyCandidate(next,expected,bindings,options)).ok).toBe(true);
  surface();const loaded=await saves.loadGame();expect(reduceEconomyCommand(loaded,c)).toMatchObject({ok:true,replayed:true});expect(loaded.teams[0].history).toHaveLength(1);
});
it('preserves unknown old-v2 history and refuses later insertion of a fabricated native count',async()=>{
  const birth=structuredClone(current.world.contractEconomy.faExerciseBirth);
  delete current.world.contractEconomy.engine.faExerciseOrigins;delete current.world.contractEconomy.faExerciseBirth;
  expect((await saves.saveGame(current.world)).ok).toBe(true);const before=roots();
  const fake=structuredClone(current.world);fake.contractEconomy.engine.faExerciseOrigins=nativeFaExerciseOrigins(fake);fake.contractEconomy.faExerciseBirth=birth;
  const forged=reduceEconomyCommand(fake,declaration(fake));expect(forged.ok,forged.error).toBe(true);
  expect(await saves.saveGame(forged.world)).toMatchObject({ok:false,reason:'economy_history_conflict'});expect(roots()).toEqual(before);
  const actual=candidate(declaration(current.world));expect(actual.faPool[0].marketEntry.compensationBasis.exercise).toBe('legacy-conservative-max');
  expect((await saves.commitEconomyCandidate(actual,expected,bindings)).ok).toBe(true);surface();expect(validateEconomySave(await saves.loadGame())).toBe('annual');
});
it('refuses coordinated deletion of creation manifest and native origins on overwrite',async()=>{
  expect((await saves.saveGame(current.world)).ok).toBe(true);const before=roots(),bad=structuredClone(current.world);
  bad.contractEconomy.revision++;delete bad.contractEconomy.faExerciseBirth;delete bad.contractEconomy.engine.faExerciseOrigins;
  expect(validateEconomySave(bad)).toBe('annual');
  expect(await saves.saveGame(bad)).toMatchObject({ok:false,reason:'economy_history_conflict'});expect(roots()).toEqual(before);
  surface();expect((await saves.loadGame()).contractEconomy.faExerciseBirth).toEqual(current.world.contractEconomy.faExerciseBirth);
});
it('refuses paired history/receipt removal without replacing committed roots',async()=>{
  expect((await saves.saveGame(current.world)).ok).toBe(true);expect((await saves.commitEconomyCandidate(candidate(declaration(current.world)),expected,bindings)).ok).toBe(true);
  const before=roots(),bad=structuredClone(current.world);bad.contractEconomy.revision++;bad.teams[0].history=[];bad.contractEconomy.engine.transactions=[];
  expect((await saves.saveGame(bad)).ok).toBe(false);expect(roots()).toEqual(before);surface();expect(validateEconomySave(await saves.loadGame())).toBe('annual');
});
it('reuses one immutable closing snapshot for two committed declarations and rejects its later edit',async()=>{
  expect((await saves.saveGame(current.world)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(candidate(declaration(current.world)),expected,bindings)).ok).toBe(true);
  expected={...expected,baseRevision:1,progressToken:current.progressToken};
  expect((await saves.commitEconomyCandidate(candidate(declaration(current.world,3)),expected,bindings)).ok).toBe(true);
  expect(current.world.contractEconomy.engine.faDeclarationContexts).toHaveLength(1);
  const saved=roots(),bad=structuredClone(current.world);bad.contractEconomy.revision++;
  bad.contractEconomy.engine.faDeclarationContexts[0].members[0].isForeign=true;
  expect((await saves.saveGame(bad)).ok).toBe(false);expect(roots()).toEqual(saved);
  surface();const loaded=await saves.loadGame();expect(validateEconomySave(loaded)).toBe('annual');expect(loaded.contractEconomy.engine.faDeclarations).toHaveLength(2);
});
