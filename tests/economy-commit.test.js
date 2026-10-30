import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { economyFixture, renewalEnvelope } from '../src/engine/__tests__/fixtures/economyWorld';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
const key = 'baseball_manager_v1';
let rows, current, bindings, expected;
const roots = () => [key, key+'_bk1', key+'_bk2'].map(k=>rows.get(k));
const surface = () => vi.stubGlobal('localStorage', { getItem:k=>rows.get(k)??null,
  setItem:(k,v)=>rows.set(k,String(v)), removeItem:k=>rows.delete(k) });
const options = { skipCompression:true };
const candidate = () => reduceEconomyCommand(current.world, renewalEnvelope(current.world)).world;
const commit = world => saves.commitEconomyCandidate(world, expected, bindings, options);
beforeEach(async () => {
  rows=new Map(); surface(); vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('IDBKeyRange',IDBKeyRange);
  for(const level of ['log','warn','error','table']) vi.spyOn(console,level).mockImplementation(()=>{});
  current={world:economyFixture(),progressToken:3,sessionToken:7};
  expected={saveId:'test-save',epoch:current.world.contractEconomy.epoch,baseRevision:0,progressToken:3,sessionToken:7};
  bindings={readCurrent:()=>current, adopt:async (world,ack,canAdopt)=>{
    if(!canAdopt()) return false;
    current={...current,world:gameStateReducer(current.world,{type:G.APPLY_ECONOMY_WORLD,world,expected}),progressToken:4};
    return true;
  }};
  expect((await saves.saveGame(current.world,options)).ok).toBe(true);
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});

it.each([false,true])('adopts only the published candidate and acknowledges readback (large=%s)',async large=>{
  const next=candidate(), original=structuredClone(next);
  if(large) next.padding='large'.repeat(20000);
  const result=await commit(next);
  expect(result).toMatchObject({ok:true,committed:{saveId:'test-save',epoch:expected.epoch,revision:1,receiptIds:[0]}});
  expect(result.committed.rootSignature).toMatch(/^[a-f0-9]{64}$/);
  expect(current.world.contractEconomy).toEqual(original.contractEconomy);
  expect(JSON.parse(rows.get(key)).rootBodyVersion===1).toBe(large);
  surface(); expect((await saves.loadGame()).contractEconomy).toEqual(original.contractEconomy);
});

it('drains older saves, blocks stale manual/auto saves until adoption finishes, and owns its candidate',async()=>{
  const old=structuredClone(current.world), next=candidate(); let release, entered;
  const gate=new Promise(r=>release=r), inside=new Promise(r=>entered=r), adopt=bindings.adopt;
  bindings.adopt=async(...args)=>{entered();await gate;return adopt(...args);};
  const a=saves.enqueueSaveGame(old,options), b=commit(next);
  next.contractEconomy.randomRoot.seed='caller-mutated';
  await a; await inside;
  expect(current.world.contractEconomy.revision).toBe(0);
  expect(saves.getSaveQueueSnapshot().isSaving).toBe(true);
  for(const save of [saves.saveGame,saves.enqueueSaveGame]) expect(await save(old,options)).toMatchObject({ok:false,reason:'economy_commit_pending'});
  release(); expect((await b).ok).toBe(true);
  expect(current.world.contractEconomy.revision).toBe(1);
  expect((await saves.saveGame(old,options)).ok).toBe(false);
});

it.each(['sessionToken','progressToken','revision'])('rejects changed %s before publication',async field=>{
  const next=candidate(), before=roots();
  if(field==='revision') current.world.contractEconomy.revision++;
  else current[field]++;
  expect(await commit(next)).toMatchObject({ok:false,reason:'economy_candidate_stale'});
  expect(roots()).toEqual(before);
});

it('keeps roots and live world on publication failure and allows retry',async()=>{
  const next=candidate(), old=structuredClone(current), before=roots(), set=localStorage.setItem;
  localStorage.setItem=(k,v)=>{if(k===key)throw new Error('disk unavailable');set(k,v);};
  expect((await commit(next)).ok).toBe(false); expect(current).toEqual(old);expect(roots()).toEqual(before);
  localStorage.setItem=set;expect((await commit(next)).ok).toBe(true);
});

it('fails closed on a substituted published root, even with the right generation',async()=>{
  const next=candidate(), old=structuredClone(current.world), set=localStorage.setItem;
  localStorage.setItem=(k,v)=>{if(k===key){const root=JSON.parse(v);root.contractEconomy=old.contractEconomy;v=JSON.stringify(root);}set(k,v);};
  expect(await commit(next)).toMatchObject({ok:false,reason:'economy_adoption_required'});
  expect(current.world).toEqual(old);
  expect((await saves.saveGame(old,options)).ok).toBe(false);
});

it('recovers a published world after failed adoption without rewriting the primary or backups',async()=>{
  const next=candidate();bindings.adopt=async()=>{throw new Error('render interrupted');};
  expect(await commit(next)).toMatchObject({ok:false,reason:'economy_adoption_required'});
  const published=roots();expect(current.world.contractEconomy.revision).toBe(0);
  expect(await saves.saveGame(current.world,options)).toMatchObject({ok:false,reason:'economy_adoption_required'});
  bindings.adopt=async world=>{current={...current,world};return true;};
  expect((await saves.recoverEconomyCommit(expected,bindings)).ok).toBe(true);
  expect(current.world.contractEconomy.revision).toBe(1);expect(roots()).toEqual(published);
  expect((await saves.saveGame(current.world,options)).ok).toBe(true);
});

it('never accepts an adoption callback that did not apply the world',async()=>{
  bindings.adopt=async()=>true;
  expect(await commit(candidate())).toMatchObject({ok:false,reason:'economy_adoption_required'});
  expect(current.world.contractEconomy.revision).toBe(0);
});

it('rejects a live session change after publication, and deletion cannot resurrect the candidate',async()=>{
  const old=structuredClone(current.world);let release, entered;
  const gate=new Promise(r=>release=r), inside=new Promise(r=>entered=r);
  bindings.adopt=async()=>{entered();await gate;return false;};
  const b=commit(candidate());await inside;
  current.sessionToken++;const deletion=saves.deleteSave();release();
  expect((await b).ok).toBe(false);expect((await deletion).ok).toBe(true);
  expect(rows.has(key)).toBe(false);expect(current.world).toEqual(old);
  expect((await saves.recoverEconomyCommit(expected,bindings)).ok).toBe(false);
});

it('rejects a clock rewind even when the next revision is otherwise valid',async()=>{
  const next=candidate(), before=roots(); next.contractEconomy.clock.date='2026-07-15';next.schedule[1].date.day=15;
  expect((await commit(next)).ok).toBe(false);expect(roots()).toEqual(before);
});

it('does not adopt after a live world changes without updating its progress token',async()=>{
  const next=candidate(), set=localStorage.setItem;
  localStorage.setItem=(k,v)=>{set(k,v);if(k===key)current.world.contractEconomy.revision++;};
  let adopted=false;bindings.adopt=async()=>{adopted=true;return true;};
  expect((await commit(next)).ok).toBe(false);expect(adopted).toBe(false);
});

it('holds the native save lock until adoption completes',async()=>{
  let held=false;
  vi.stubGlobal('navigator',{locks:{request:async(name,fn)=>{held=true;try{return await fn();}finally{held=false;}}}});
  const adopt=bindings.adopt;
  bindings.adopt=async(...args)=>{expect(held).toBe(true);return adopt(...args);};
  expect((await commit(candidate())).ok).toBe(true);expect(held).toBe(false);
});

it('allows legal acceptance through a second acknowledged commit',async()=>{
  expect((await commit(candidate())).ok).toBe(true);
  expected={...expected,baseRevision:1,progressToken:current.progressToken};
  const accepted=reduceEconomyCommand(current.world,{...renewalEnvelope(current.world),
    transaction:{id:'answer',type:'accept-renewal',proposalId:'renewal',contractId:current.world.teams[0].players[0].contractId}});
  expect(accepted.ok).toBe(true);
  const saved=await commit(accepted.world);expect(saved,JSON.stringify(saved)).toMatchObject({ok:true,committed:{revision:2,receiptIds:[0,'answer']}});
});

it('can recover the unchanged published root after a failed delete',async()=>{
  const next=candidate(); bindings.adopt=async()=>{throw new Error('interrupted');};
  expect((await commit(next)).ok).toBe(false);
  const before=roots(), remove=localStorage.removeItem;
  localStorage.removeItem=()=>{throw new Error('delete blocked');};
  expect((await saves.deleteSave()).ok).toBe(false); expect(roots()).toEqual(before);
  localStorage.removeItem=remove;
  bindings.adopt=async(world,ack,canAdopt)=>{if(!canAdopt())return false;current={...current,world};return true;};
  expect((await saves.recoverEconomyCommit(expected,bindings)).ok).toBe(true);
  expect(roots()).toEqual(before);expect((await saves.saveGame(current.world,options)).ok).toBe(true);
});

it('recognizes an already adopted published world after the completion callback throws',async()=>{
  const adopt=bindings.adopt;
  bindings.adopt=async(...args)=>{await adopt(...args);throw new Error('interrupted after dispatch');};
  expect((await commit(candidate())).ok).toBe(false);expect(current.world.contractEconomy.revision).toBe(1);
  const before=roots(); expected={...expected,progressToken:current.progressToken};
  // Re-applying a transition-only reducer would reject the same revision.
  bindings.adopt=async()=>{throw new Error('must not repeat completed adoption');};
  expect((await saves.recoverEconomyCommit(expected,bindings)).ok).toBe(true);
  expect(roots()).toEqual(before);expect((await saves.saveGame(current.world,options)).ok).toBe(true);
});

it('does not let an invalidated queued commit clear a newer adoption fence',async()=>{
  let releaseA, releaseB, enteredA, enteredB, releaseD, enteredD, count=0;
  const gateA=new Promise(r=>releaseA=r), gateB=new Promise(r=>releaseB=r), gateD=new Promise(r=>releaseD=r);
  const atA=new Promise(r=>enteredA=r), atB=new Promise(r=>enteredB=r), atD=new Promise(r=>enteredD=r);
  vi.stubGlobal('navigator',{locks:{request:async(name,fn)=>{
    count++;if(count===1){enteredA();await gateA;}if(count===3){enteredB();await gateB;}return fn();
  }}});
  const old=structuredClone(current.world), a=saves.saveGame(old,options);await atA;
  const b=commit(candidate()), deletion=saves.deleteSave();releaseA();await a;
  expect((await deletion).ok).toBe(true);await atB;
  const c=saves.saveGame(old,options);
  bindings.adopt=async()=>{enteredD();await gateD;throw new Error('interrupted');};
  const d=commit(candidate());releaseB();expect((await b).ok).toBe(false);expect((await c).ok).toBe(true);await atD;
  const trailing=saves.saveGame(old,options), queued=saves.getSaveQueueSnapshot().hasQueuedSave;
  releaseD();expect((await d).ok).toBe(false);await trailing;
  expect(queued).toBe(false);
  bindings.adopt=async(world,ack,canAdopt)=>{if(!canAdopt())return false;current={...current,world};return true;};
  expect((await saves.recoverEconomyCommit(expected,bindings)).ok).toBe(true);
});
