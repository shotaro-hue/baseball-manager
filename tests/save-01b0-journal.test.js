import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { prepareProbeRestore, publishProbeRestore, inspectProbeRestore,
  rollbackProbeRestore, discardProbeStage, PROBE_PRIMARY_KEY, PROBE_DB_NAME } from '../scripts/save-01b0/journal.js';

let storage;
beforeEach(() => {
  storage = new Map(); vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const old = 'old probe primary';
async function changeStage(value, key = 'candidate') {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(PROBE_DB_NAME); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('rows', 'readwrite'); tx.objectStore('rows').put(value, key);
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  }); db.close();
}
async function readProbeRow(key) {
  const db = await new Promise(resolve => { const req = indexedDB.open(PROBE_DB_NAME); req.onsuccess = () => resolve(req.result); });
  const value = await new Promise((resolve, reject) => {
    const tx = db.transaction('rows', 'readonly'), req = tx.objectStore('rows').get(key);
    tx.oncomplete = () => resolve(req.result); tx.onabort = () => reject(tx.error);
  }); db.close(); return value;
}

it('unpublished stage preserves primary and only its own rows can be discarded', async () => {
  localStorage.setItem(PROBE_PRIMARY_KEY, old);
  localStorage.setItem('baseball_manager_v1', 'production sentinel');
  await prepareProbeRestore({ year: 2046 });
  await changeStage('unrelated probe row', 'unrelated');
  expect(await inspectProbeRestore()).toMatchObject({ status: 'unpublished', oldPrimary: old });
  expect(localStorage.getItem(PROBE_PRIMARY_KEY)).toBe(old);
  await discardProbeStage(); expect((await inspectProbeRestore()).status).toBe('none');
  expect(await readProbeRow('unrelated')).toBe('unrelated probe row');
  expect(localStorage.getItem('baseball_manager_v1')).toBe('production sentinel');
});
it('actual primary identifies publication even when journal phase was not updated', async () => {
  localStorage.setItem(PROBE_PRIMARY_KEY, old);
  const prepared = await prepareProbeRestore({ year: 2046 });
  localStorage.setItem(PROBE_PRIMARY_KEY, prepared.newPrimary); // abrupt termination window
  expect(await inspectProbeRestore()).toMatchObject({ status: 'published', payload: { year: 2046 }, phase: 'verified' });
  await rollbackProbeRestore(); expect(localStorage.getItem(PROBE_PRIMARY_KEY)).toBe(old);
});
it('changed primary rejects both publication and stale rollback', async () => {
  localStorage.setItem(PROBE_PRIMARY_KEY, old); await prepareProbeRestore({ year: 2046 });
  localStorage.setItem(PROBE_PRIMARY_KEY, 'other-tab');
  await expect(publishProbeRestore()).rejects.toThrow('probe_conflict');
  await expect(rollbackProbeRestore()).rejects.toThrow('probe_conflict');
  expect((await inspectProbeRestore()).status).toBe('conflict');
  expect(localStorage.getItem(PROBE_PRIMARY_KEY)).toBe('other-tab');
});
it('stage corruption cannot be published or confirmed', async () => {
  await prepareProbeRestore({ year: 2046 }); await changeStage('tampered');
  await expect(publishProbeRestore()).rejects.toThrow('probe_stage_invalid');
  expect((await inspectProbeRestore()).status).toBe('invalid');
  expect(localStorage.getItem(PROBE_PRIMARY_KEY)).toBeNull();
});
it('publication failure preserves old primary and permits owned-stage cleanup', async () => {
  localStorage.setItem(PROBE_PRIMARY_KEY, old); await prepareProbeRestore({ year: 2046 });
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await expect(publishProbeRestore()).rejects.toThrow('quota');
  expect(localStorage.getItem(PROBE_PRIMARY_KEY)).toBe(old);
  await discardProbeStage(); expect((await inspectProbeRestore()).status).toBe('none');
});
it('absent old primary is restored as absent and an active journal cannot be replaced', async () => {
  await prepareProbeRestore({ year: 2046 });
  await expect(prepareProbeRestore({ year: 2047 })).rejects.toThrow('probe_pending');
  await publishProbeRestore(); await rollbackProbeRestore();
  expect(localStorage.getItem(PROBE_PRIMARY_KEY)).toBeNull();
});
it('a published candidate cannot be discarded as an orphan', async () => {
  await prepareProbeRestore({ year: 2046 }); await publishProbeRestore();
  await expect(discardProbeStage()).rejects.toThrow('probe_published');
  expect((await inspectProbeRestore()).status).toBe('published');
});
it('a synchronous staging error aborts the whole transaction without leaving an unowned row', async () => {
  const add = IDBObjectStore.prototype.add;
  vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(value, key) {
    if (this.name === 'journal') throw new Error('injected journal write failure');
    return add.call(this, value, key);
  });
  await expect(prepareProbeRestore({ year: 2046 })).rejects.toThrow('injected journal write failure');
  vi.restoreAllMocks();
  await expect(prepareProbeRestore({ year: 2047 })).resolves.toMatchObject({ phase: 'verified' });
});
