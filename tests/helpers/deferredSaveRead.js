import { IDBDatabase } from 'fake-indexeddb';
import { vi } from 'vitest';

const pending = new Set();
export async function releaseDeferredSaveOperations() {
  await Promise.all([...pending].map(release => release()));
}

// Let the real IndexedDB request finish, but hold its completion notification.
// Production readGeneration still reads and validates the actual persisted rows.
export function deferNextSaveRead({ abort = false } = {}) {
  let finish, markReady;
  const ready = new Promise(resolve => { markReady = resolve; });
  const transaction = IDBDatabase.prototype.transaction;
  const spy = vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(function (...args) {
    const tx = transaction.apply(this, args);
    if (args[0] !== 'save_chunks' || args[1] !== 'readonly') return tx;
    spy.mockRestore();
    for (const type of ['complete', 'abort', 'error']) {
      Object.defineProperty(tx, `on${type}`, { configurable: true, set(callback) {
        tx.addEventListener(type, event => {
          finish = () => callback.call(tx, event);
          markReady();
        });
      } });
    }
    if (abort) queueMicrotask(() => tx.abort());
    return tx;
  });
  const release = () => { pending.delete(release); const callback = finish; finish = null; return callback?.(); };
  pending.add(release);
  return { ready, release };
}

export function holdSaveLock() {
  let release, markReady;
  const ready = new Promise(resolve => { markReady = resolve; });
  navigator.locks.request = (_name, operation) => new Promise((resolve, reject) => {
    release = () => Promise.resolve().then(operation).then(resolve, reject);
    markReady();
  });
  const unlock = () => {
    pending.delete(unlock);
    navigator.locks.request = (_name, operation) => Promise.resolve().then(operation);
    const callback = release; release = null; return callback?.();
  };
  pending.add(unlock);
  return { ready, release: unlock };
}
