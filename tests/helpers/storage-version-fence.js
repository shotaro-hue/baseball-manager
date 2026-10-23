// Historical product DB v3 fixture. Never import this versionless reader or
// legacy schema into production: only explicitly-versioned opens are fenced.
export const LEGACY_DB_NAME = 'baseball_manager_storage';

export function openLegacyDb({ hold = false } = {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, 3);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('save_chunks'); db.createObjectStore('career_logs');
      const batch = db.createObjectStore('batted_ball_batches', { keyPath: 'id' });
      for (const [name, key] of Object.entries({ byPlayerSeason: ['saveId', 'playerId', 'year'],
        byPlayer: ['saveId', 'playerId'], byGame: ['saveId', 'year', 'gameId'], bySaveYear: ['saveId', 'year'] })) batch.createIndex(name, key);
      db.createObjectStore('batted_ball_meta', { keyPath: 'saveId' });
      const aggregate = db.createObjectStore('batted_ball_aggregates', { keyPath: 'id' });
      aggregate.createIndex('bySaveYear', ['saveId', 'year']); aggregate.createIndex('bySave', 'saveId');
      aggregate.createIndex('byPlayer', ['saveId', 'playerId']);
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      if (!hold) db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}

export async function seedLegacyDb(options) {
  const db = await openLegacyDb(options);
  await new Promise((resolve, reject) => {
    const tx = db.transaction(Array.from(db.objectStoreNames), 'readwrite');
    tx.objectStore('save_chunks').put({ version: 1, payload: 'protected bytes' }, 'root-body:sentinel');
    tx.objectStore('career_logs').put([{ year: 2024, stats: { HR: 12 } }], 0);
    tx.objectStore('career_logs').put([{ year: 2025, stats: { HR: 30 } }], '0');
    tx.objectStore('batted_ball_batches').put({ id: 'legacy-batch', saveId: 'legacy', playerId: 'p', year: 2026,
      gameId: 'g', events: [{ result: 's', evKmh: 140, laDeg: 15 }] });
    tx.objectStore('batted_ball_meta').put({ saveId: 'legacy', estimatedEventCount: 1 });
    tx.objectStore('batted_ball_aggregates').put({ id: 'legacy-aggregate', saveId: 'legacy', playerId: 'p', year: 2026, totalEvents: 1 });
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  });
  return db;
}

export async function readDbSnapshot(db) {
  return new Promise((resolve, reject) => {
    const names = Array.from(db.objectStoreNames), tx = db.transaction(names, 'readonly');
    const requests = names.map(name => {
      const store = tx.objectStore(name);
      return { name, indexes: Array.from(store.indexNames), keys: store.getAllKeys(), values: store.getAll() };
    });
    tx.oncomplete = () => resolve(requests.map(r => ({ name: r.name, indexes: r.indexes,
      rows: r.keys.result.map((key, i) => [key, r.values.result[i]]) })));
    tx.onabort = tx.onerror = () => reject(tx.error);
  });
}
