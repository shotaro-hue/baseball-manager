import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import LZString from 'lz-string';
import { saveGame, loadGame } from '../src/engine/saveload';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb';
const key = 'baseball_manager_v1';
let rows;
const state = day => ({ teams: [{ id: 0, name: '球団', players: [], farm: [] }], myId: 0,
  year: 2026, gameDay: day, saveId: 'capacity-game', seasonHistory: { day }, news: [{ day }], mailbox: [],
  largeState: Array.from({length: 4000}, (_, i) => ({id:i, value:`選手成績${i*7919}`})) });
const save = s => saveGame(s, {skipCompression:true});
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem:k=>rows.get(k)??null, setItem:(k,v)=>rows.set(k,String(v)), removeItem:k=>rows.delete(k) });
  vi.spyOn(console,'log').mockImplementation(()=>{});vi.spyOn(console,'warn').mockImplementation(()=>{});vi.spyOn(console,'error').mockImplementation(()=>{});vi.spyOn(console,'table').mockImplementation(()=>{});
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
async function mutateBody(raw, mutation) {
  const ref=JSON.parse(raw);const db=await openBaseballManagerDb();
  await new Promise((resolve,reject)=>{const tx=db.transaction('save_chunks','readwrite'),store=tx.objectStore('save_chunks');
    const req=store.get(ref.key);req.onsuccess=()=>mutation(store,ref.key,req.result);
    tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);
  });db.close();
}
it('saves and reloads a large root despite a 64KiB localStorage budget, including all three generations',async()=>{
  const set=localStorage.setItem;
  vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{
    const bytes=[...rows].filter(([name])=>name!==k).reduce((n,[name,value])=>n+(name.length+value.length)*2,0)+(k.length+String(v).length)*2;
    if(bytes>65536)throw new DOMException('full','QuotaExceededError');set(k,v);
  });
  for(const day of [1,2,3,4]){
    rows.set(key+'_last_rotate_at','0');const s=state(day);
    expect(await save(s)).toMatchObject({ok:true,warnings:[]});
    expect((await loadGame()).largeState).toEqual(s.largeState);
  }
  expect([key,key+'_bk1',key+'_bk2'].every(k=>rows.get(k).length<1024)).toBe(true);
  rows.set(key,'corrupt');expect((await loadGame()).gameDay).toBe(3);
});
it('moves a full legacy root only after staging its exact bytes; legacy backups remain recoverable',async()=>{
  const legacy=JSON.stringify(state(1));rows.set(key,legacy);rows.set(key+'_bk1',legacy);rows.set(key+'_bk2',legacy);
  expect((await loadGame()).gameDay).toBe(1);expect(await save(state(2))).toMatchObject({ok:true,warnings:[]});
  expect(rows.get(key+'_bk2').length).toBeLessThan(1024);
  rows.set(key,'broken');expect((await loadGame()).gameDay).toBe(1);
});
it('body transaction abort preserves primary and backups and the next retry works',async()=>{
  await save(state(1));await save(state(2));const before=[key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k));
  const add=IDBObjectStore.prototype.add;let once=false;
  vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(v,k){const req=add.call(this,v,k);if(!once&&String(k).startsWith('root-body:')){once=true;this.transaction.abort();}return req;});
  expect(await save(state(3))).toMatchObject({ok:false});expect(once).toBe(true);
  expect([key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k))).toEqual(before);
  expect((await loadGame()).gameDay).toBe(2);vi.restoreAllMocks();expect((await save(state(3))).ok).toBe(true);
});
it('independent body readback catches corruption before root publication',async()=>{
  await save(state(1));const before=rows.get(key),add=IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(v,k){return add.call(this,String(k).startsWith('root-body:')?{...v,payload:'truncated'}:v,k);});
  expect((await save(state(2))).ok).toBe(false);expect(rows.get(key)).toBe(before);expect((await loadGame()).gameDay).toBe(1);
});
it('a missing primary body falls back to its own backup and GC retains backup dependencies',async()=>{
  for(const day of [1,2,3,4]){rows.set(key+'_last_rotate_at','0');expect((await save(state(day))).ok).toBe(true);}
  await mutateBody(rows.get(key),(store,k)=>store.delete(k));
  const restored=await loadGame();expect(restored.gameDay).toBe(3);expect(restored.news).toEqual([{day:3}]);
  expect((await save({...restored,gameDay:5},{dirtyScopes:[]})).ok).toBe(true);
  rows.set(key,'broken');expect((await loadGame()).gameDay).toBe(3);
});
it('a corrupt newest backup body does not prevent recovery from the older backup',async()=>{
  for(const day of [1,2,3]){rows.set(key+'_last_rotate_at','0');await save(state(day));}
  await mutateBody(rows.get(key+'_bk1'),(store,k,row)=>store.put({...row,payload:'broken'},k));rows.set(key,'broken');
  expect((await loadGame()).gameDay).toBe(1);
});
it('does not report success for a semantically invalid state that cannot reload',async()=>{
  await save(state(1));const before=rows.get(key);
  expect((await save({...state(2),myId:999})).ok).toBe(false);expect(rows.get(key)).toBe(before);
});
it.each([0,1])('does not overwrite a valid legacy primary/backup when staging body %s fails',async failingIndex=>{
  for(const [name,day]of [[key,3],[key+'_bk1',2],[key+'_bk2',1]])rows.set(name,JSON.stringify(state(day)));
  await loadGame();const before=[key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k));
  const add=IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(v,k){
    if(String(k).startsWith('root-body:')&&v.payload===before[failingIndex])throw new DOMException('disk full','QuotaExceededError');
    return add.call(this,v,k);
  });
  expect((await save(state(4))).ok).toBe(false);
  expect([key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k))).toEqual(before);
});
it('reclaims an orphan body before a root-only retry so failed publication cannot strand saving at quota',async()=>{
  await save(state(1));
  const oldSet=localStorage.setItem;
  vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===key)throw new Error('interrupted publication');oldSet(k,v);});
  expect((await saveGame(state(2),{skipCompression:true,dirtyScopes:[]})).ok).toBe(false);vi.restoreAllMocks();
  const db=await openBaseballManagerDb();const orphanKeys=await new Promise(resolve=>{
    const tx=db.transaction('save_chunks','readonly'),req=tx.objectStore('save_chunks').getAllKeys();
    tx.oncomplete=()=>resolve(req.result.filter(k=>String(k).startsWith('root-body:')&&k!==JSON.parse(rows.get(key)).key));
  });db.close();expect(orphanKeys.length).toBeGreaterThan(0);
  const retainedOrphans=new Set(orphanKeys),remove=IDBObjectStore.prototype.delete,add=IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype,'delete').mockImplementation(function(k){retainedOrphans.delete(k);return remove.call(this,k);});
  vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(v,k){
    if(String(k).startsWith('root-body:')&&retainedOrphans.size)throw new DOMException('disk full','QuotaExceededError');
    return add.call(this,v,k);
  });
  expect((await saveGame(state(3),{skipCompression:true,dirtyScopes:[]})).ok).toBe(true);
  expect((await loadGame()).gameDay).toBe(3);
});
it('uses native asynchronous compression for large snapshots instead of the synchronous LZ path',async()=>{
  vi.spyOn(LZString,'compressToUTF16').mockImplementation(()=>{throw new Error('large synchronous compression is unavailable');});
  expect((await saveGame(state(1))).ok).toBe(true);
  expect((await loadGame()).largeState).toEqual(state(1).largeState);
});
it.each(['###','AAAA'])('a corrupt inline gzip primary %s does not block a verified backup from being saved',async payload=>{
  const s=day=>({...state(day),largeState:'x'.repeat(50000)});
  await saveGame(s(1));await saveGame(s(2));
  const backup=rows.get(key+'_bk1');rows.set(key,'gzip-json-v1:'+payload);rows.set(key+'_last_rotate_at','0');
  const restored=await loadGame();expect(restored.gameDay).toBe(1);
  expect((await saveGame({...restored,gameDay:3})).ok).toBe(true);
  expect(rows.get(key+'_bk1')).toBe(backup);expect((await loadGame()).gameDay).toBe(3);
});
it('keeps only owned immutable root metadata when callers mutate a loaded full state',async()=>{
  await save(state(1));const loaded=await loadGame();
  loaded.saveManifest.chunks.news.key='changed-by-caller';
  expect((await saveGame({...loaded,gameDay:2},{skipCompression:true,dirtyScopes:[]})).ok).toBe(true);
  expect((await loadGame()).news).toEqual([{day:1}]);
});
