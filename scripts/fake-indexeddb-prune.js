// Test-adapter housekeeping only; never import from application source.
import {IDBFactory} from 'fake-indexeddb';

export function releaseCompletedTransactions(factory) {
 if(!(factory instanceof IDBFactory)||!(factory._databases instanceof Map))throw Error('Unsupported fake-indexeddb adapter');
 let released=0;
 for(const database of factory._databases.values()) {
  if(!Array.isArray(database.transactions))throw Error('Unsupported fake-indexeddb transactions');
  // fake-indexeddb6.2.5 keeps finished transactions (and rollback snapshots)
  // reachable forever. Keep versionchange transactions: abort cleanup still
  // consults the list after their state becomes finished. Never touch stored
  // rows, requests in flight, active rollback state or save roots.
  database.transactions=database.transactions.filter(tx=>{
   if(tx._state!=='finished'||tx.mode==='versionchange')return true;
   released++;return false;
  });
 }
 return released;
}
