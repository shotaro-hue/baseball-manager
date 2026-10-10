import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {IDBFactory,IDBObjectStore} from 'fake-indexeddb';
import {saveGame,loadGame,loadPlayerCareerLogById,enqueueSaveGame} from '../src/engine/saveload';
import {openBaseballManagerDb} from '../src/engine/baseballManagerDb';
import version5 from './fixtures/f3-version5.json';
const primary='baseball_manager_v1'; let rows;
const entry=(year,HR=1)=>({year,teamId:0,teamName:'球団',stats:{HR}});
const state=(year=2026,saveId='a')=>({saveId,year,gameDay:1,myId:0,teams:[{id:0,name:'球団',players:[{id:'same',recentCareerLog:[entry(2025)]}],farm:[]}],seasonHistory:{},news:[],mailbox:[],gameResultsMap:{}});
const save=(s,options={})=>saveGame(s,{skipCompression:true,...options});
beforeEach(()=>{rows=new Map();vi.stubGlobal('indexedDB',new IDBFactory());vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,String(v)),removeItem:k=>rows.delete(k)});});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
it('B01: failed new-year commit exposes no future career and retry commits once',async()=>{
 await save(state());const set=localStorage.setItem;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw new Error('body');set(k,v);});
 const options={careerEntries:[{playerId:'same',careerEntry:entry(2026,4)}]};
 expect((await save(state(2027),options)).ok).toBe(false);
 expect((await loadGame()).year).toBe(2026);
 expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2025)]);
 vi.restoreAllMocks();expect((await save(state(2027),options)).ok).toBe(true);
 expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2025),entry(2026,4)]);
});
it('B02: aborted career chunk transaction cannot commit a partial new year',async()=>{
 await save(state());const add=IDBObjectStore.prototype.add;
 vi.spyOn(IDBObjectStore.prototype,'add').mockImplementation(function(row,key){const req=add.call(this,row,key);if(row.scope==='careerLogs')this.transaction.abort();return req;});
 expect((await save(state(2027),{careerEntries:[{playerId:'same',careerEntry:entry(2026)}]})).ok).toBe(false);
 expect((await loadGame()).year).toBe(2026);expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2025)]);
});
it('B03: colliding player IDs and failed first game preserve old-game history',async()=>{
 await save(state(),{initialCareerLogs:[{playerId:'same',careerEntries:[entry(2024,7)]}]});
 const set=localStorage.setItem;vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw new Error('body');set(k,v);});
 const next=state(2026,'b'),options={initialCareerLogs:[{playerId:'same',careerEntries:[entry(2023,9)]}]};
 expect((await save(next,options)).ok).toBe(false);expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2024,7)]);
 vi.restoreAllMocks();expect((await save(next,options)).ok).toBe(true);
 expect(await loadPlayerCareerLogById('same','b')).toEqual([entry(2023,9)]);
 rows.set(primary,'corrupt');expect((await loadGame()).saveId).toBe('a');expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2024,7)]);
});
it('B04: repeated years, retries and reopen have no missing or duplicate seasons',async()=>{
 await save(state());
 for(let year=2026;year<2030;year++){
  const s=state(year+1),options={careerEntries:[{playerId:'same',careerEntry:entry(year,year-2025)}]};
  expect((await save(s,options)).ok).toBe(true);expect((await save(s,options)).ok).toBe(true);
  expect((await loadGame()).year).toBe(year+1);
 }
 expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2025),...Array.from({length:4},(_,i)=>entry(2026+i,i+1))]);
});
it('ordinary partial saves reuse career reference and missing career rejects generation',async()=>{
 await save(state());const ref=JSON.parse(rows.get(primary)).saveManifest.chunks.careerLogs;
 expect(ref).toBeDefined();await save({...state(),gameDay:2},{dirtyScopes:['news']});
 expect(JSON.parse(rows.get(primary)).saveManifest.chunks.careerLogs).toEqual(ref);
 const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('save_chunks','readwrite');tx.objectStore('save_chunks').delete(ref.key);tx.oncomplete=res;});db.close();
 expect(await loadGame()).toBeNull();
});
it('queued requests preserve career entries from a failed in-flight save',async()=>{
 await save(state());const set=localStorage.setItem;let fail=true;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary && fail){fail=false;throw new Error('body');}set(k,v);});
 const first=enqueueSaveGame(state(2027),{skipCompression:true,careerEntries:[{playerId:'same',careerEntry:entry(2026,4)}]});
 const next=enqueueSaveGame(state(2028),{skipCompression:true,careerEntries:[{playerId:'same',careerEntry:entry(2027,5)}]});
 expect((await first).ok).toBe(false);expect((await next).ok).toBe(true);
 expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2025),entry(2026,4),entry(2027,5)]);
});
it('read-only legacy migration failure preserves fixed career rows and old root',async()=>{
 const legacy={...state(),saveDataVersion:4};rows.set(primary,JSON.stringify(legacy));const original=rows.get(primary);
 const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('career_logs','readwrite');tx.objectStore('career_logs').put([entry(2020,8)],'same');tx.oncomplete=res;});db.close();
 const loaded=await loadGame();const set=localStorage.setItem;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary)throw new Error('body');set(k,v);});
 expect((await save(loaded)).ok).toBe(false);expect(rows.get(primary)).toBe(original);
 expect(await loadPlayerCareerLogById('same')).toEqual([entry(2020,8)]);
 expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2020,8),entry(2025)]);
 vi.restoreAllMocks();expect((await save(loaded)).ok).toBe(true);
 expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2020,8),entry(2025)]);
});
it('legacy inline full career survives read-only load and migration beyond the recent three years',async()=>{
 const legacy=state();const full=Array.from({length:8},(_,i)=>entry(2018+i));
 legacy.teams[0].players[0].careerLog=full;delete legacy.teams[0].players[0].recentCareerLog;
 legacy.saveDataVersion=4;rows.set(primary,JSON.stringify(legacy));
 const loaded=await loadGame();expect((await save(loaded)).ok).toBe(true);
 expect(await loadPlayerCareerLogById('same','a')).toEqual(full);
});
it('a queued rollback to the old year cannot inherit a failed future-year career patch',async()=>{
 await save(state());const set=localStorage.setItem;let fail=true;
 vi.spyOn(localStorage,'setItem').mockImplementation((k,v)=>{if(k===primary && fail){fail=false;throw new Error('body');}set(k,v);});
 const nextYear=enqueueSaveGame(state(2027),{skipCompression:true,careerEntries:[{playerId:'same',careerEntry:entry(2026,4)}]});
 const rollback=enqueueSaveGame(state(2026),{skipCompression:true});
 expect((await nextYear).ok).toBe(false);expect((await rollback).ok).toBe(true);
 expect((await loadGame()).year).toBe(2026);expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2025)]);
});
it('real F3-A version 5 fixture migrates with all history and retains backup references',async()=>{
 const db=await openBaseballManagerDb();await new Promise(res=>{
  const tx=db.transaction(['save_chunks','career_logs'],'readwrite');
  for(const [key,row] of version5.chunks) tx.objectStore('save_chunks').put(row,key);
  for(const [key,row] of version5.careerRows) tx.objectStore('career_logs').put(row,key);
  tx.oncomplete=res;
 });db.close();rows.set(primary,JSON.stringify(version5.body));
 const loaded=await loadGame();expect(loaded.saveDataVersion).toBe(5);expect(loaded.news).toEqual([{day:1}]);
 expect((await save(loaded,{dirtyScopes:[]})).ok).toBe(true);expect((await loadGame()).saveDataVersion).toBe(6);
 expect(await loadPlayerCareerLogById('same','legacy-five')).toEqual([entry(2020,7),entry(2025,2)]);
 rows.set(primary,'corrupt');const backup=await loadGame();expect(backup.saveDataVersion).toBe(5);expect(backup.news).toEqual([{day:1}]);
});
it('unversioned old inline career migrates read-only without losing older seasons',async()=>{
 const legacy=state(),full=Array.from({length:8},(_,i)=>entry(2018+i));
 legacy.teams[0].players[0].careerLog=full;delete legacy.teams[0].players[0].recentCareerLog;
 rows.set(primary,JSON.stringify(legacy));const loaded=await loadGame();
 expect((await save(loaded)).ok).toBe(true);expect(await loadPlayerCareerLogById('same','a')).toEqual(full);
});
it('first save preserves full supplied inline career before sanitizing the main body',async()=>{
 const s=state(),full=Array.from({length:8},(_,i)=>entry(2018+i));
 s.teams[0].players[0].careerLog=full;delete s.teams[0].players[0].recentCareerLog;
 expect((await save(s)).ok).toBe(true);expect(await loadPlayerCareerLogById('same','a')).toEqual(full);
});
it('a legacy save without saveId keeps fixed history through scoped read and first migration',async()=>{
 const legacy={...state(),saveDataVersion:4};delete legacy.saveId;
 const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('career_logs','readwrite');tx.objectStore('career_logs').put([entry(2020,7)],'same');tx.oncomplete=res;});db.close();
 rows.set(primary,JSON.stringify(legacy));const loaded=await loadGame();expect(loaded.saveId).toBeTruthy();
 expect(await loadPlayerCareerLogById('same',loaded.saveId)).toEqual([entry(2020,7),entry(2025)]);
 expect((await save(loaded)).ok).toBe(true);expect((await loadGame()).saveId).toBe(loaded.saveId);
 expect(await loadPlayerCareerLogById('same',loaded.saveId)).toEqual([entry(2020,7),entry(2025)]);
});
it('numeric legacy playerId zero keeps its fixed history during migration',async()=>{
 const legacy={...state(),saveDataVersion:4};legacy.teams[0].players[0].id=0;
 const db=await openBaseballManagerDb();await new Promise(res=>{const tx=db.transaction('career_logs','readwrite');tx.objectStore('career_logs').put([entry(2020,7)],0);tx.oncomplete=res;});db.close();
 rows.set(primary,JSON.stringify(legacy));const loaded=await loadGame();expect((await save(loaded)).ok).toBe(true);
 expect(await loadPlayerCareerLogById('0','a')).toEqual([entry(2020,7),entry(2025)]);
});
it('successful next-year commit rejects a queued stale old-year body',async()=>{
 await save(state());
 const nextYear=enqueueSaveGame(state(2027),{skipCompression:true,careerEntries:[{playerId:'same',careerEntry:entry(2026,4)}]});
 const stale=enqueueSaveGame(state(2026),{skipCompression:true});
 expect((await nextYear).ok).toBe(true);expect(await stale).toMatchObject({ok:false,reason:'stale_save'});
 expect((await loadGame()).year).toBe(2027);expect(await loadPlayerCareerLogById('same','a')).toEqual([entry(2025),entry(2026,4)]);
});
it('full history roundtrips within a compact immutable-row storage budget',async()=>{
 const entries=Array.from({length:100},(_,i)=>({...entry(1900+i,i),stats:{G:143,PA:600,AB:550,H:150,HR:i,BB:50,K:100},playoffStats:{G:0,PA:0,HR:0}}));
 expect((await save(state(),{initialCareerLogs:[{playerId:'same',careerEntries:entries}]})).ok).toBe(true);
 const ref=JSON.parse(rows.get(primary)).saveManifest.chunks.careerLogs;
 const db=await openBaseballManagerDb();const stored=await new Promise((resolve,reject)=>{const req=db.transaction('save_chunks','readonly').objectStore('save_chunks').get(ref.key);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});db.close();
 expect(new TextEncoder().encode(JSON.stringify(stored)).length).toBeLessThan(new TextEncoder().encode(JSON.stringify(entries)).length/2);
 expect(await loadPlayerCareerLogById('same','a')).toEqual(entries);
});
it('full history remains readable and writable without native compression streams',async()=>{
 vi.stubGlobal('CompressionStream',undefined);vi.stubGlobal('DecompressionStream',undefined);
 const entries=Array.from({length:100},(_,i)=>({...entry(1900+i),stats:{G:143,PA:600,AB:550,H:150,HR:i,BB:50,K:100}}));
 expect((await save(state(),{initialCareerLogs:[{playerId:'same',careerEntries:entries}]})).ok).toBe(true);
 await loadGame();expect(await loadPlayerCareerLogById('same','a')).toEqual(entries);
 expect((await save(state(),{dirtyScopes:[]})).ok).toBe(true);
 expect(await loadPlayerCareerLogById('same','a')).toEqual(entries);
});
