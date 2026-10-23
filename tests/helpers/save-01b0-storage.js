import { beforeEach, afterEach, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { openBaseballManagerDb } from '../../src/engine/baseballManagerDb.js';

export const PRIMARY = 'baseball_manager_v1';
export const entry = year => ({ year, teamId: 0, stats: { HR: year - 2000 } });
export const game = () => ({ saveId: 'source', year: 2026, gameDay: 1, myId: 0,
  teams: [{ id: 0, name: 'probe', players: [{ id: 0, careerLog: [entry(2025)] }], farm: [] }],
  news: [], mailbox: [], seasonHistory: {} });
export const batch = (evKmh = 140) => ({ id: 'source:2026:future:0', saveId: 'source', year: 2026,
  playerId: '0', gameId: 'future', gameDay: 2, events: [{ result: 's', evKmh, laDeg: 15 }] });

export async function rows(storeName) {
  const db = await openBaseballManagerDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly'), store = tx.objectStore(storeName);
      const keys = store.getAllKeys(), values = store.getAll();
      tx.oncomplete = () => resolve(keys.result.map((key, i) => [key, values.result[i]]));
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
beforeEach(() => {
  const data = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('localStorage', { getItem: k => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
