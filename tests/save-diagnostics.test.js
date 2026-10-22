import LZString from 'lz-string';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { saveGame, loadGame, enqueueSaveGame } from '../src/engine/saveload';
const key = 'baseball_manager_v1';
const state = day => ({ teams: [{ id: 0, name: 'PRIVATE CLUB', players: [], farm: [] }], myId: 0,
  year: 2026, gameDay: day, saveId: 'PRIVATE SAVE ID', seasonHistory: {}, news: [], mailbox: [] });
let rows;
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null, setItem: (k,v) => rows.set(k,String(v)), removeItem: k => rows.delete(k) });
  vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(['QuotaExceededError', 'SecurityError'])('retains committed roots and reports the failed localStorage API: %s', async name => {
  await saveGame(state(1)); await saveGame(state(2));
  const before = [key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k));
  const original=localStorage.setItem;
  vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===key)throw new DOMException('PRIVATE ERROR BODY',name);original(k,v);});
  const result=await enqueueSaveGame(state(3));
  expect(result).toMatchObject({ok:false, reason:name==='QuotaExceededError'?'quota_exceeded':'storage_write_failed',
    diagnostics:{version:1,step:'commit_root',api:'localStorage.setItem',exceptionName:name,queue:{isSaving:true},storage:{rootBytes:expect.any(Number)}}});
  expect([key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k))).toEqual(before);
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE/);
  expect((await loadGame()).gameDay).toBe(2);
  vi.restoreAllMocks();expect((await saveGame(state(3))).ok).toBe(true);expect((await loadGame()).gameDay).toBe(3);
});
it('reports an aborted IndexedDB write and allows retry without replacing the committed root',async()=>{
  await saveGame(state(1));const before=rows.get(key),add=IDBObjectStore.prototype.add;let injected=false;
  vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(...args){const request=add.apply(this,args);if(!injected){injected=true;this.transaction.abort();}return request;});
  const result=await saveGame(state(2));expect(result).toMatchObject({ok:false,reason:'indexeddb_write_failed',diagnostics:{step:'prepare_generation',api:'IndexedDB',exceptionName:expect.any(String)}});
  expect(rows.get(key)).toBe(before);vi.restoreAllMocks();expect((await saveGame(state(2))).ok).toBe(true);
});
it('reports snapshot failure without recording save contents',async()=>{
  const result=await enqueueSaveGame({...state(1),invalid:()=>{}});
  expect(result).toMatchObject({ok:false,reason:'snapshot_failed',diagnostics:{step:'snapshot',api:'structuredClone',exceptionName:'DataCloneError'}});
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE/);
});
it('turns rejected lock acquisition into a reasoned failure and keeps the next retry usable',async()=>{
  await saveGame(state(1));const before=rows.get(key);
  vi.stubGlobal('navigator',{locks:{request:()=>Promise.reject(new DOMException('PRIVATE','SecurityError'))}});
  expect(await saveGame(state(2))).toMatchObject({ok:false,reason:'save_lock_failed',diagnostics:{step:'acquire_lock',api:'navigator.locks.request',exceptionName:'SecurityError'}});
  expect(rows.get(key)).toBe(before);
  navigator.locks.request=(_name,fn)=>fn();expect((await saveGame(state(2))).ok).toBe(true);
});

it.each(['serialize', 'compress'])('identifies a %s failure and retains the last committed generation',async step=>{
 await saveGame(state(1));const before=[key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k));
 if(step==='compress')vi.spyOn(LZString,'compressToUTF16').mockImplementation(()=>{throw new RangeError('PRIVATE')});
 const result=await saveGame({...state(2),...(step==='serialize'?{extra:1n}:{})});
 expect(result).toMatchObject({ok:false,reason:step==='serialize'?'serialization_failed':'compression_failed',diagnostics:{step:step+'_state',api:step==='serialize'?'JSON.stringify':'LZString.compressToUTF16'}});
 expect([key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k))).toEqual(before);
 vi.restoreAllMocks();expect((await saveGame(state(2))).ok).toBe(true);expect((await loadGame()).gameDay).toBe(2);
});
it.each([[1,'check_conflict'],[2,'validate_previous']])('identifies a refused localStorage read at call %s',async(readNumber,step)=>{
 await saveGame(state(1));const before=[key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k));
 const read=localStorage.getItem;let calls=0;
 vi.spyOn(localStorage,'getItem').mockImplementation(k=>{if(k===key && ++calls===readNumber)throw new DOMException('PRIVATE','SecurityError');return read(k);});
 const result=await saveGame(state(2));expect(result).toMatchObject({ok:false,reason:'storage_read_failed',diagnostics:{step,api:'localStorage.getItem',exceptionName:'SecurityError'}});
 expect([key,key+'_bk1',key+'_bk2'].map(k=>rows.get(k))).toEqual(before);
 vi.restoreAllMocks();expect((await saveGame(state(2))).ok).toBe(true);expect((await loadGame()).gameDay).toBe(2);
});
