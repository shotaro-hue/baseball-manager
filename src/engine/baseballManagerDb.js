export const BASEBALL_MANAGER_DB_NAME = 'baseball_manager_storage';
export const BASEBALL_MANAGER_DB_VERSION = 3;

export const BASEBALL_MANAGER_DB_STORES = {
  chunks: 'save_chunks',
  careerLogs: 'career_logs',
  battedBallBatches: 'batted_ball_batches',
  battedBallAggregates: 'batted_ball_aggregates',
  battedBallMeta: 'batted_ball_meta',
};

/**
 * 既存ストアを保持したまま打球アーカイブ用ストアを追加する。
 */
export function openBaseballManagerDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(BASEBALL_MANAGER_DB_NAME, BASEBALL_MANAGER_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(BASEBALL_MANAGER_DB_STORES.chunks)) {
        db.createObjectStore(BASEBALL_MANAGER_DB_STORES.chunks);
      }
      if (!db.objectStoreNames.contains(BASEBALL_MANAGER_DB_STORES.careerLogs)) {
        db.createObjectStore(BASEBALL_MANAGER_DB_STORES.careerLogs);
      }
      if (!db.objectStoreNames.contains(BASEBALL_MANAGER_DB_STORES.battedBallBatches)) {
        const store = db.createObjectStore(
          BASEBALL_MANAGER_DB_STORES.battedBallBatches,
          { keyPath: 'id' },
        );
        store.createIndex('byPlayerSeason', ['saveId', 'playerId', 'year'], { unique: false });
        store.createIndex('byPlayer', ['saveId', 'playerId'], { unique: false });
        store.createIndex('byGame', ['saveId', 'year', 'gameId'], { unique: false });
        store.createIndex('bySaveYear', ['saveId', 'year'], { unique: false });
      }
      if (!db.objectStoreNames.contains(BASEBALL_MANAGER_DB_STORES.battedBallMeta)) {
        db.createObjectStore(BASEBALL_MANAGER_DB_STORES.battedBallMeta, { keyPath: 'saveId' });
      }
      if (!db.objectStoreNames.contains(BASEBALL_MANAGER_DB_STORES.battedBallAggregates)) {
        const store = db.createObjectStore(
          BASEBALL_MANAGER_DB_STORES.battedBallAggregates,
          { keyPath: 'id' },
        );
        store.createIndex('bySaveYear', ['saveId', 'year'], { unique: false });
        store.createIndex('bySave', 'saveId', { unique: false });
        store.createIndex('byPlayer', ['saveId', 'playerId'], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade is blocked'));
  });
}
