import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { saveGame, loadGame, hasSave, enqueueSaveGame } from '../src/engine/saveload';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb';
const primary = 'baseball_manager_v1', bk1 = primary + '_bk1', bk2 = primary + '_bk2';
let rows;
const state = (day = 1, saveId = 'game-a') => ({ teams: [{ id: 0, name: '球団', players: [], farm: [] }], myId: 0,
  year: 2026, gameDay: day, saveId, seasonHistory: { day }, news: [{ day }], mailbox: [{ day }], gameResultsMap: { [day]: { day } } });
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const save = (s, opts = {}) => saveGame(s, { skipCompression: true, ...opts });
const parsed = () => JSON.parse(rows.get(primary));
async function chunks() { const db = await openBaseballManagerDb(); return new Promise((res, rej) => {
 const tx = db.transaction('save_chunks', 'readonly'), store = tx.objectStore('save_chunks');
 const keys = store.getAllKeys(), values = store.getAll();
 tx.oncomplete = () => { db.close(); res(new Map(keys.result.map((k, i) => [k, values.result[i]]))); }; tx.onabort = () => rej(tx.error);
}); }
it('A01/A05: a backup restores its own history, not latest fixed keys', async () => {
 await save(state(1)); await save(state(2)); rows.set(primary, 'corrupt');
 const result = await loadGame(); expect(result.gameDay).toBe(1); expect(result.news).toEqual([{ day: 1 }]); expect(result.seasonHistory).toEqual({ day: 1 });
});
it('A03: failed primary write preserves last committed body and histories', async () => {
 await save(state(1)); const original = localStorage.setItem;
 vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => { if (k === primary) throw new Error('disk'); original(k, v); });
 expect((await save(state(2))).ok).toBe(false);
 const result = await loadGame(); expect(result.gameDay).toBe(1); expect(result.news).toEqual([{ day: 1 }]);
});
it('A04: metadata failure is a warning after a successful commit', async () => {
 const original = localStorage.setItem;
 vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => { if (k === primary + '_meta') throw new Error('meta'); original(k, v); });
 expect(await save(state())).toMatchObject({ ok: true }); expect((await loadGame()).gameDay).toBe(1);
});
it('A06: missing primary still offers a valid backup', async () => {
 await save(state(1)); await save(state(2)); rows.delete(primary); expect(hasSave()).toBe(true); expect((await loadGame()).gameDay).toBe(1);
});
it('A10: new saveId forces all four histories even with no dirty scopes', async () => {
 await save(state(1)); await save(state(9, 'game-b'), { dirtyScopes: [] });
 expect((await loadGame()).news).toEqual([{ day: 9 }]);
});
it('A13: quota failure never deletes backups', async () => {
 await save(state(1)); await save(state(2)); rows.set(bk2, rows.get(bk1)); const before = [rows.get(bk1), rows.get(bk2)];
 const original = localStorage.setItem;
 vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => { if (k === primary) throw new DOMException('full', 'QuotaExceededError'); original(k, v); });
 expect(await save(state(3))).toMatchObject({ ok: false, quota: true }); expect([rows.get(bk1), rows.get(bk2)]).toEqual(before);
});
it('A02/A09: aborted chunk write preserves old generation and retry is safe', async () => {
 await save(state(1)); let injected = false;
 for (const method of ['put', 'add']) { const original = IDBObjectStore.prototype[method];
 vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function(v, k) { const req = original.call(this, v, k);
  if (!injected && this.name === 'save_chunks') { injected = true; this.transaction.abort(); } return req; }); }
 expect((await save(state(2))).ok).toBe(false); expect((await loadGame()).news).toEqual([{ day: 1 }]);
 vi.restoreAllMocks(); expect((await save(state(3))).ok).toBe(true); expect((await loadGame()).news).toEqual([{ day: 3 }]);
});
it('A07: missing required chunk rejects candidate and falls back', async () => {
 await save(state(1)); await save(state(2)); const manifest = parsed().saveManifest; expect(manifest).toBeDefined();
 const db = await openBaseballManagerDb(); await new Promise(res => { const tx = db.transaction('save_chunks', 'readwrite'); tx.objectStore('save_chunks').delete(manifest.chunks.news.key); tx.oncomplete = res; }); db.close();
 expect((await loadGame()).gameDay).toBe(1);
});
it('A14: unchanged refs are reused and backup referenced chunks survive cleanup', async () => {
 await save(state(1)); const old = parsed().saveManifest; expect(old).toBeDefined();
 await save(state(2), { dirtyScopes: ['news'] }); const next = parsed().saveManifest;
 expect(next.chunks.mailbox).toEqual(old.chunks.mailbox); expect(next.chunks.news.key).not.toBe(old.chunks.news.key);
 const stored = await chunks(); for (const ref of Object.values(old.chunks)) expect(stored.has(ref.key)).toBe(true);
});
it('A08: queued payload is an immutable snapshot and dirty scopes are accumulated', async () => {
 const a = state(1), b = state(2), c = state(3); await save(a);
 const first = enqueueSaveGame(a, { skipCompression: true });
 const second = enqueueSaveGame(b, { skipCompression: true, dirtyScopes: ['news'] });
 const third = enqueueSaveGame(c, { skipCompression: true, dirtyScopes: ['mailbox'] });
 c.news[0].day = 99; await Promise.all([first, second, third]);
 const result = await loadGame(); expect(result.gameDay).toBe(3); expect(result.news).toEqual([{ day: 3 }]); expect(result.mailbox).toEqual([{ day: 3 }]);
});
it('A11/A12: v4 migration failure leaves legacy body and fixed chunks usable', async () => {
 const s = state(); const db = await openBaseballManagerDb(); await new Promise(res => { const tx = db.transaction('save_chunks', 'readwrite'); const store = tx.objectStore('save_chunks');
  store.put(s.news, 'news'); store.put(s.mailbox, 'mailbox'); store.put(s.seasonHistory, 'seasonHistory'); store.put({ gameResultsMap: s.gameResultsMap }, 'matchHistory'); tx.oncomplete = res; }); db.close();
 rows.set(primary, JSON.stringify({ ...s, saveDataVersion: 4, matchHistoryStored: true, news: [], mailbox: [], seasonHistory: null })); const legacy = rows.get(primary);
 const loaded = await loadGame(); expect(loaded.news).toEqual(s.news);
 const original = localStorage.setItem; vi.spyOn(localStorage, 'setItem').mockImplementation((k,v) => { if (k===primary) throw new Error('migration'); original(k,v); });
 expect((await save(loaded, { dirtyScopes: [] })).ok).toBe(false); expect(rows.get(primary)).toBe(legacy); expect((await loadGame()).news).toEqual(s.news);
 vi.restoreAllMocks(); expect((await save(loaded, { dirtyScopes: [] })).ok).toBe(true); expect(parsed().saveManifest).toBeDefined(); expect((await loadGame()).news).toEqual(s.news);
});
it('queued rejection notifies listeners and does not strand a subsequent save', async () => {
 const { createSaveRequestQueue } = await import('../src/engine/saveload'); let release;
 const q = createSaveRequestQueue(p => p === 1 ? new Promise(res => { release = res; }) : p === 2 ? Promise.reject(new Error('fail')) : Promise.resolve(p));
 const a = q.enqueue(1), b = q.enqueue(2); const rejected = expect(b).rejects.toThrow('fail'); release(1); await a; await rejected;
 expect(await q.enqueue(3)).toBe(3);
});
it('all invalid generations return an explicit unrecoverable status', async () => {
 const { getLastLoadResult } = await import('../src/engine/saveload'); rows.set(primary, 'broken'); rows.set(bk1, 'broken');
 expect(await loadGame()).toBeNull(); expect(getLastLoadResult()).toMatchObject({status:'unrecoverable'});
});
it('recovered backup can be saved when primary manifest points at missing data', async () => {
 await save(state(1)); await save(state(2)); const ref=parsed().saveManifest.chunks.news;
 const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('save_chunks','readwrite');tx.objectStore('save_chunks').delete(ref.key);tx.oncomplete=res;});db.close();
 const recovered=await loadGame();expect(recovered.gameDay).toBe(1);recovered.gameDay=3;
 expect((await save(recovered,{dirtyScopes:[]})).ok).toBe(true);expect((await loadGame()).news).toEqual([{day:1}]);
});
it('a primary changed during async load does not grant a stale state permission to overwrite it', async () => {
 await save(state(1)); const old=rows.get(primary); let changed=false;
 const get=IDBObjectStore.prototype.get;
 vi.spyOn(IDBObjectStore.prototype,'get').mockImplementation(function(...args){
  const req=get.apply(this,args);if(this.name==='save_chunks'&&!changed){changed=true;rows.set(primary,JSON.stringify({...JSON.parse(old),gameDay:99}));}return req;
 });
 const loaded=await loadGame();expect(loaded.gameDay).toBe(1);
 expect(await save(loaded)).toMatchObject({ok:false,reason:'save_conflict'});expect(parsed().gameDay).toBe(99);
});
it('rotation due on a failed commit leaves both previous backup roots untouched', async () => {
 await save(state(1));await save(state(2));rows.set(primary+'_last_rotate_at','0');await save(state(3));
 const backups=[rows.get(bk1),rows.get(bk2)];rows.set(primary+'_last_rotate_at','0');const set=localStorage.setItem;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw new DOMException('full','QuotaExceededError');set(k,v);});
 expect((await save(state(4))).ok).toBe(false);expect([rows.get(bk1),rows.get(bk2)]).toEqual(backups);
});
it('deleting a save allows a fresh save in the same tab', async () => {
 const {deleteSave}=await import('../src/engine/saveload');await save(state(1));await deleteSave();
 expect((await save(state(1,'new'))).ok).toBe(true);expect((await loadGame()).saveId).toBe('new');
});
it('A14: obsolete unreferenced generations are collected after successful commit', async () => {
 await save(state(1));await save(state(2));const obsolete=parsed().saveManifest;
 await save(state(3));const stored=await chunks();for(const ref of Object.values(obsolete.chunks))expect(stored.has(ref.key)).toBe(false);
 expect((await loadGame()).gameDay).toBe(3);
});
it('legacy backup fixed chunks remain protected after migration', async () => {
 const s=state();const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('save_chunks','readwrite');for(const scope of ['news','mailbox','seasonHistory'])tx.objectStore('save_chunks').put(s[scope],scope);tx.oncomplete=res;});db.close();
 const legacy={...s,saveDataVersion:4};rows.set(primary,JSON.stringify(legacy));const loaded=await loadGame();
 await save(loaded);const stored=await chunks();expect(stored.has('news')).toBe(true);rows.set(primary,'broken');expect((await loadGame()).news).toEqual(s.news);
});
it('IDB quota retries only after reclaiming unreferenced failed-save chunks', async () => {
 await save(state(1));const oldKeys=new Set((await chunks()).keys());const set=localStorage.setItem;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw new Error('body');set(k,v);});await save(state(2));vi.restoreAllMocks();
 const orphanKeys=[...(await chunks()).keys()].filter(k=>!oldKeys.has(k));expect(orphanKeys).toHaveLength(4);
 const add=IDBObjectStore.prototype.add;let injected=false;vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(...args){
  if(this.name==='save_chunks'&&!injected){injected=true;throw new DOMException('full','QuotaExceededError');}return add.apply(this,args);
 });
 expect((await save(state(3))).ok).toBe(true);const stored=await chunks();for(const k of orphanKeys)expect(stored.has(k)).toBe(false);
 expect((await loadGame()).gameDay).toBe(3);
});
it('full rewrite can repair missing dirty chunks without inheriting their old rows', async () => {
 const s=state(1);await save(s);const ref=parsed().saveManifest.chunks.news;
 const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('save_chunks','readwrite');tx.objectStore('save_chunks').delete(ref.key);tx.oncomplete=res;});db.close();
 expect((await save(state(2))).ok).toBe(true);expect((await loadGame()).news).toEqual([{day:2}]);
});
it('recovery does not rotate a corrupt primary over the backup when rotation is due', async () => {
 await save(state(1));await save(state(2));const backup=rows.get(bk1),ref=parsed().saveManifest.chunks.news;
 const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('save_chunks','readwrite');tx.objectStore('save_chunks').delete(ref.key);tx.oncomplete=res;});db.close();
 const recovered=await loadGame();rows.set(primary+'_last_rotate_at','0');expect((await save(recovered)).ok).toBe(true);
 expect(rows.get(bk1)).toBe(backup);rows.set(primary,'broken');expect((await loadGame()).gameDay).toBe(1);
});
it('failed in-flight dirty scopes are retained in the queued retry', async () => {
 await save(state(1));const set=localStorage.setItem;let fail=true;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary&&fail){fail=false;throw new Error('first commit');}set(k,v);});
 const a=state(2),b={...state(3),news:[{day:2}]};
 const first=enqueueSaveGame(a,{skipCompression:true,dirtyScopes:['news']});
 const retry=enqueueSaveGame(b,{skipCompression:true,dirtyScopes:['mailbox']});
 expect((await first).ok).toBe(false);expect((await retry).ok).toBe(true);const loaded=await loadGame();
 expect(loaded.news).toEqual([{day:2}]);expect(loaded.mailbox).toEqual([{day:3}]);
});
it('deletion during chunk writing prevents active and queued saves from resurrecting roots', async () => {
 const {deleteSave}=await import('../src/engine/saveload');await save(state(1));
 const add=IDBObjectStore.prototype.add;let deletion,queued;
 vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(...args){
  const req=add.apply(this,args);
  if(this.name==='save_chunks'&&!deletion){
   queued=enqueueSaveGame(state(3),{skipCompression:true});
   deletion=deleteSave();
  }
  return req;
 });
 const active=enqueueSaveGame(state(2),{skipCompression:true});
 await active;await deletion;await queued;
 expect(hasSave()).toBe(false);expect(rows.has(primary)).toBe(false);
 expect(rows.has(bk1)).toBe(false);expect(rows.has(bk2)).toBe(false);
 expect((await save(state(9,'new-game'))).ok).toBe(true);
});
it('cleanup reuses immutable root metadata instead of decompressing unchanged committed roots', async () => {
 const {default:LZString}=await import('lz-string');
 await saveGame(state(1));
 const read=vi.spyOn(LZString,'decompressFromUTF16');
 expect((await saveGame(state(2))).ok).toBe(true);
 expect(read).not.toHaveBeenCalled();
 read.mockRestore();expect((await loadGame()).news).toEqual([{day:2}]);
 rows.set(bk1,'corrupt');
 const third=await saveGame(state(3));expect(third).toMatchObject({ok:true,warnings:['cleanup_failed']});
});
it('loaded state mutation cannot change the roots protected by cleanup',async()=>{
 await saveGame(state(1));rows.set(bk1,rows.get(primary));
 const loaded=await loadGame(),key=loaded.saveManifest.chunks.news.key;
 loaded.saveManifest.chunks.news.generation='different';
 loaded.saveManifest.chunks.news.key='generation:'+JSON.stringify(['game-a','different','news']);
 expect((await saveGame(state(2,'game-b'),{skipBackupRotation:true})).ok).toBe(true);
 expect((await chunks()).has(key)).toBe(true);
 rows.set(primary,'corrupt');expect((await loadGame()).news).toEqual([{day:1}]);
});
it('an optional metadata cache clone error cannot undo a committed save',async()=>{
 await save(state(1));
 const loaded=await loadGame();
 // JSON persistence omits extra functions, but a metadata structuredClone rejects them.
 loaded.saveManifest.chunks.news.extra=()=>{};
 const result=await save(state(2),{dirtyScopes:['mailbox']});
 expect(result).toMatchObject({ok:true,warnings:['root_cache_failed']});
 expect(parsed().gameDay).toBe(2);
 expect((await loadGame()).news).toEqual([{day:1}]);
});
