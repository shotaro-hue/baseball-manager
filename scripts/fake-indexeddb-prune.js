// Test-adapter housekeeping only; never import from application source.
import {IDBFactory} from 'fake-indexeddb';

export function releaseCompletedTransactions(factory) {
 if(!(factory instanceof IDBFactory))throw Error('Unsupported fake-indexeddb adapter');
 // Compatibility entry point for long-run reports. Since 6.2.6 the adapter
 // releases transactions itself in a queued task. Editing its private list
 // races that cleanup and breaks commit/abort processing. Never mutate it.
 return 0;
}
