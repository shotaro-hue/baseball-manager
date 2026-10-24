import { openBaseballManagerDb, BASEBALL_MANAGER_DB_STORES } from './baseballManagerDb';
import { withBattedBallArchiveLock } from './archiveLock';
import { BATTED_BALL_RETENTION_LOCK_PREFIX } from './battedBallRetention';
import { BATTED_BALL_VERSION_PREFIX, validateBattedBallVersionRef, validateBattedBallReceipt } from './battedBallRun';
import { collectBattedBallReceiptKeys } from './battedBallReceipts';

const lastCollection = new WeakMap();
const INTERVAL_MS = 5 * 60 * 1000;
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 300;
function identity(key) {
  try {
    const parts = JSON.parse(key.slice(BATTED_BALL_VERSION_PREFIX.length));
    validateBattedBallVersionRef({ key, digest: '0'.repeat(64) }, parts[0], parts[2]);
    if (!['run', 'chunk'].includes(parts[2]) || !id(parts[0])) return null;
    return parts;
  } catch { return null; } // Unknown namespaces/keys are never a deletion candidate.
}

// Caller owns the save lock: publication cannot change the roots during marking.
export async function collectUnusedBattedBallVersions(roots, { force = false, ownsSnapshot = () => true } = {}) {
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request !== 'function' || typeof locks?.query !== 'function') return { deleted: 0, skipped: 'lock_inventory_unavailable' };
  const factory = globalThis.indexedDB;
  const elapsed = Date.now() - (lastCollection.get(factory) ?? -Infinity);
  if (!force && elapsed >= 0 && elapsed < INTERVAL_MS) return { deleted: 0, skipped: 'cadence' };
  return withBattedBallArchiveLock(async () => {
    const inventory = await locks.query();
    if (!Array.isArray(inventory.held)) throw new Error('archive_gc_invalid_lock_inventory');
    const pins = [];
    for (const lock of inventory.held) {
      if (!lock.name?.startsWith(BATTED_BALL_RETENTION_LOCK_PREFIX)) continue;
      const pin = JSON.parse(lock.name.slice(BATTED_BALL_RETENTION_LOCK_PREFIX.length));
      if (!id(pin.saveId) || !id(pin.runId) || !id(pin.token)) throw new Error('archive_gc_invalid_pin');
      pins.push(pin);
    }
    if (roots.some(root => !id(root.saveId))) return { deleted: 0, skipped: 'unknown_root_identity' };
    const protectedRefs = new Map(), legacySaves = new Set();
    for (const root of roots) {
      validateBattedBallReceipt(root.battedBallReceipt, root.saveId);
      if (root.battedBallReceipt == null) legacySaves.add(root.saveId);
      else await collectBattedBallReceiptKeys(root.battedBallReceipt, protectedRefs);
    }
    const liveRuns = new Set();
    for (const pin of pins) {
      liveRuns.add(JSON.stringify([pin.saveId, pin.runId]));
      await collectBattedBallReceiptKeys(pin.anchor, protectedRefs);
    }
    if (!ownsSnapshot()) throw new Error('archive_gc_roots_changed');
    const db = await openBaseballManagerDb();
    try {
      const result = await new Promise((resolve, reject) => {
        const tx = db.transaction(BASEBALL_MANAGER_DB_STORES.chunks, 'readwrite');
        const store = tx.objectStore(BASEBALL_MANAGER_DB_STORES.chunks);
        let deleted = 0, retained = 0, failure;
        const req = store.openKeyCursor();
        req.onsuccess = () => {
          try {
            if (!ownsSnapshot()) throw new Error('archive_gc_roots_changed');
            const cursor = req.result;
            if (!cursor) return;
            if (typeof cursor.key === 'string' && cursor.key.startsWith(BATTED_BALL_VERSION_PREFIX)) {
              const parts = identity(cursor.key);
              if (parts && !protectedRefs.has(cursor.key) && !legacySaves.has(parts[0])
                && !liveRuns.has(JSON.stringify(parts.slice(0, 2)))) { store.delete(cursor.key); deleted++; }
              else retained++;
            }
            cursor.continue();
          } catch (error) { failure = error; tx.abort(); }
        };
        tx.oncomplete = () => resolve({ deleted, retained });
        tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('archive_gc_failed'));
      });
      lastCollection.set(factory, Date.now());
      return result;
    } finally { db.close(); }
  });
}
