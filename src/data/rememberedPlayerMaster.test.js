import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {hasRememberedPlayerMaster,rememberPlayerMaster,loadRememberedPlayerMaster,forgetPlayerMaster} from './rememberedPlayerMaster';

function master(){return {schemaVersion:1,asOf:'2026-03-27',status:'verified',
 sources:[{id:'test',url:'https://example.org/test',redistribution:'unconfirmed'}],
 teams:Array.from({length:12},(_,teamId)=>({teamId,controlled:60,development:10,verified:true})),
 players:Array.from({length:840},(_,i)=>({playerId:`fixture:${i}`,name:`選手${i}`,teamId:i%12,registration:i<720?'controlled':'development',kind:'pitcher',birthDate:'2000-01-01',throws:'right',bats:'left',pos:'先発',foreignQuotaStatus:'domestic',salaryStatus:'game-assumption',gameSalaryManYen:500,contractStatus:'game-assumption',gameContractEndYear:2026,sourceIds:['test'],history:[]}))};}
beforeEach(()=>{vi.stubGlobal('indexedDB',new IDBFactory());const rows=new Map();vi.stubGlobal('localStorage',{getItem:k=>rows.get(k)??null,setItem:(k,v)=>rows.set(k,v),removeItem:k=>rows.delete(k)});});
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
it('round trips a private master without granting public rights and removes it on reset',async()=>{
 const m=master();expect(await loadRememberedPlayerMaster()).toBeNull();
 await rememberPlayerMaster(m);expect(hasRememberedPlayerMaster()).toBe(true);const restored=await loadRememberedPlayerMaster();
 expect(restored).toEqual(m);expect(restored).not.toBe(m);
 await forgetPlayerMaster();expect(hasRememberedPlayerMaster()).toBe(false);expect(await loadRememberedPlayerMaster()).toBeNull();
});
it('rejects invalid replacement before writing',async()=>{
 const m=master();await rememberPlayerMaster(m);
 const bad=structuredClone(m);bad.players[0].history=[{year:2026,outs:3}];
 await expect(rememberPlayerMaster(bad)).rejects.toThrow(/future/);
 expect(await loadRememberedPlayerMaster()).toEqual(m);
});
it('validates stored bytes again instead of trusting the database',async()=>{
 await rememberPlayerMaster(master());
 await new Promise((resolve,reject)=>{const r=indexedDB.open('npb-player-master-v1',1);r.onsuccess=()=>{
 const db=r.result,tx=db.transaction('selection','readwrite');tx.objectStore('selection').put('{bad','opening-2026');tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};});
 await expect(loadRememberedPlayerMaster()).rejects.toThrow(/JSON/);
});
it('leaves unrelated game databases intact',async()=>{
 await new Promise(resolve=>{const r=indexedDB.open('unrelated-game-save',1);r.onupgradeneeded=()=>r.result.createObjectStore('save');r.onsuccess=()=>{const db=r.result,tx=db.transaction('save','readwrite');tx.objectStore('save').put('existing-save','slot');tx.oncomplete=()=>{db.close();resolve();};};});
 await rememberPlayerMaster(master());await forgetPlayerMaster();
 const value=await new Promise(resolve=>{const r=indexedDB.open('unrelated-game-save',1);r.onsuccess=()=>{const db=r.result,t=db.transaction('save'),get=t.objectStore('save').get('slot');get.onsuccess=()=>resolve(get.result);t.oncomplete=()=>db.close();};});
 expect(value).toBe('existing-save');
});
it('fails unavailable and stalled storage without hanging title initialization',async()=>{
 vi.stubGlobal('indexedDB',undefined);await expect(loadRememberedPlayerMaster()).rejects.toThrow(/記憶できません/);
 vi.useFakeTimers();vi.stubGlobal('indexedDB',{open:()=>({})});
 const pending=expect(loadRememberedPlayerMaster()).rejects.toThrow(/接続/);
 await vi.advanceTimersByTimeAsync(3000);await pending;
});
it('disables automatic reuse even if clearing IndexedDB fails',async()=>{
 await rememberPlayerMaster(master());
 vi.stubGlobal('indexedDB',{open:()=>{throw Error('blocked');}});
 await expect(forgetPlayerMaster()).rejects.toThrow('blocked');
 expect(hasRememberedPlayerMaster()).toBe(false);
});
it('allows a session-only replacement after automatic reuse is disabled even if IndexedDB is blocked',async()=>{
 await rememberPlayerMaster(master());
 vi.stubGlobal('indexedDB',{open:()=>{throw Error('blocked');}});
 await expect(forgetPlayerMaster({deleteRequired:false})).resolves.toBe(false);
 expect(hasRememberedPlayerMaster()).toBe(false);
});
it('never ignores failure to clear the automatic selection marker',async()=>{
 localStorage.removeItem=()=>{throw Error('marker unavailable');};
 await expect(forgetPlayerMaster({deleteRequired:false})).rejects.toThrow('marker unavailable');
});
