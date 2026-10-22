import {expect,it} from 'vitest';
import {IDBFactory} from 'fake-indexeddb';
import {releaseCompletedTransactions} from './fake-indexeddb-prune';
const open=async factory=>new Promise((resolve,reject)=>{const request=factory.open('prune',1);request.onupgradeneeded=()=>request.result.createObjectStore('data');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const finish=tx=>new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});
const read=db=>new Promise((resolve,reject)=>{const request=db.transaction('data').objectStore('data').get('key');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
const settled=async()=>{await new Promise(resolve=>setTimeout(resolve,0));await new Promise(resolve=>setTimeout(resolve,0));};
it('lets the adapter release completed transactions and rollback closures without changing stored values',async()=>{
 const factory=new IDBFactory(),db=await open(factory);
 for(let i=0;i<12;i++){const tx=db.transaction('data','readwrite');tx.objectStore('data').put({revision:i,payload:'x'.repeat(100000)},'key');await finish(tx);}
 const raw=factory._databases.get('prune'),transactions=raw.transactions;
 expect(releaseCompletedTransactions(factory)).toBe(0);expect(raw.transactions).toBe(transactions);
 await settled();expect(raw.transactions).toHaveLength(0);
 expect(await read(db)).toEqual({revision:11,payload:'x'.repeat(100000)});db.close();
});
it('never removes active transactions and preserves commit and rollback semantics after housekeeping',async()=>{
 const factory=new IDBFactory(),db=await open(factory);
 let tx=db.transaction('data','readwrite');tx.objectStore('data').put('committed','key');await finish(tx);
 tx=db.transaction('data','readwrite');tx.objectStore('data').put('aborted','key');
 releaseCompletedTransactions(factory);expect(factory._databases.get('prune').transactions).toContain(tx);
 const aborted=new Promise(resolve=>{tx.onabort=resolve;});tx.abort();await aborted;
 releaseCompletedTransactions(factory);expect(await read(db)).toBe('committed');
 tx=db.transaction('data','readwrite');tx.objectStore('data').put('next','key');await finish(tx);
 releaseCompletedTransactions(factory);expect(await read(db)).toBe('next');db.close();
});
it('preserves versionchange abort cleanup even before its abort notification runs',async()=>{
 const factory=new IDBFactory();let raw;
 await new Promise(resolve=>{
  const request=factory.open('aborted-upgrade',1);
  request.onupgradeneeded=()=>{
   const db=request.result;raw=db._rawDatabase;db.createObjectStore('data');
   request.transaction.abort();releaseCompletedTransactions(factory);
  };
  request.onerror=event=>{event.preventDefault();resolve();};
 });
 expect(raw.version).toBe(0);expect(raw.rawObjectStores.size).toBe(0);expect(raw.connections).toHaveLength(0);
});
