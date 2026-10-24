export const BASEBALL_MANAGER_DB_NAME = 'baseball_manager_storage';
// v5 requires live archive pins before GC. Older explicit-version writers
// cannot reopen after activation; existing stores and rows are unchanged.
export const BASEBALL_MANAGER_DB_VERSION = 5;
export const STORAGE_UPGRADE_BLOCKED_ERROR = 'StorageUpgradeBlockedError';
export const STORAGE_OPEN_TIMEOUT_MS = 10_000;

export function storageAccessFailureReason(error, fallback) {
  if (error?.name === STORAGE_UPGRADE_BLOCKED_ERROR) return 'storage_upgrade_blocked';
  if (error?.name === 'StorageOpenTimeoutError') return 'storage_open_timeout';
  if (error?.name === 'VersionError') return 'storage_version_outdated';
  return fallback;
}

export const BASEBALL_MANAGER_DB_STORES = {
  chunks: 'save_chunks',
  careerLogs: 'career_logs',
  battedBallBatches: 'batted_ball_batches',
  battedBallAggregates: 'batted_ball_aggregates',
  battedBallMeta: 'batted_ball_meta',
};

// Only one native open request per JS realm is in flight at a time. A blocked
// request cannot be cancelled until the old connection closes; later requests
// must share its failure rather than queue invisibly behind it.
const openingByFactory = new WeakMap();

function ensureStores(db) {
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
}

export async function openBaseballManagerDb() {
  const factory = globalThis.indexedDB;
  if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
  const opening = openingByFactory.get(factory);
  if (opening) return opening.promise.then(() => openBaseballManagerDb());
  const current = { promise: null };
  openingByFactory.set(factory, current);
  current.promise = new Promise((resolve, reject) => {
    let abandoned = false, request, timer;
    const clearOpening = () => {
      if (openingByFactory.get(factory) === current) openingByFactory.delete(factory);
    };
    const fail = error => { abandoned = true; clearTimeout(timer); reject(error); };
    try { request = factory.open(BASEBALL_MANAGER_DB_NAME, BASEBALL_MANAGER_DB_VERSION); }
    catch (error) { clearOpening(); fail(error); return; }
    // Another realm's blocked native open can keep this request queued without
    // firing onblocked here. Bound that wait and never report a late success.
    timer = setTimeout(() => {
      const error = new Error('IndexedDB open did not complete');
      error.name = 'StorageOpenTimeoutError';
      try { request.transaction?.abort(); } catch { /* May already have completed. */ }
      fail(error);
    }, STORAGE_OPEN_TIMEOUT_MS);
    request.onupgradeneeded = () => {
      if (abandoned) { request.transaction.abort(); return; }
      try { ensureStores(request.result); }
      catch (error) {
        try { request.transaction.abort(); } catch { /* Preserve the original error. */ }
        clearOpening(); // This upgrade was actively aborted, unlike onblocked.
        fail(error);
      }
    };
    request.onsuccess = () => {
      clearTimeout(timer); clearOpening();
      const db = request.result;
      if (abandoned) { db.close(); return; }
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => {
      clearOpening(); fail(request.error || new Error('IndexedDB open failed'));
    };
    request.onblocked = () => {
      const error = new Error('IndexedDB upgrade is blocked by another connection');
      error.name = STORAGE_UPGRADE_BLOCKED_ERROR;
      // Keep current until the native request settles; new callers immediately
      // inherit this rejection instead of starting a permanently queued request.
      fail(error);
    };
  });
  return current.promise;
}
