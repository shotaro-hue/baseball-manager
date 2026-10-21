import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { saveGame, loadGame, deleteSave, getLastLoadResult, hasSave } from '../src/engine/saveload';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb';
import { deferNextSaveRead, holdSaveLock, releaseDeferredSaveOperations } from './helpers/deferredSaveRead';

const primary = 'baseball_manager_v1';
const keys = [primary, `${primary}_meta`, `${primary}_bk1`, `${primary}_bk2`];
const state = (day = 1, saveId = 'old') => ({ saveId, teams: [{ id: 0, name: '保存球団', players: [], farm: [] }],
  myId: 0, year: 2026, gameDay: day, news: [{ day }], mailbox: [], seasonHistory: {} });
const save = (s, options = {}) => saveGame(s, { skipCompression: true, ...options });
let rows;
const storage = () => ({ getItem: key => rows.get(key) ?? null,
  setItem: (key, value) => rows.set(key, String(value)), removeItem: key => rows.delete(key) });
beforeEach(() => {
  rows = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('localStorage', storage());
  vi.stubGlobal('navigator', { locks: { request: (_name, operation) => Promise.resolve().then(operation) } });
});
afterEach(async () => { await releaseDeferredSaveOperations(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['during', 'after'])('does not publish an old successful read %s actual deletion', async timing => {
  await save(state());
  const read = deferNextSaveRead(), loading = loadGame(); await read.ready;
  const lock = holdSaveLock(), deleting = deleteSave(); await lock.ready;
  if (timing === 'during') { read.release(); expect(await loading).toBeNull(); }
  await lock.release(); expect(await deleting).toEqual({ ok: true });
  if (timing === 'after') { read.release(); expect(await loading).toBeNull(); }
  expect(getLastLoadResult().status).toBe('none'); expect(hasSave()).toBe(false);
  expect((await save(state(1, 'fresh'))).ok).toBe(true);
  expect((await loadGame()).saveId).toBe('fresh');
});

it.each(['missing', 'error'])('does not resurrect an unrecoverable status from a late %s read', async outcome => {
  await save(state());
  if (outcome === 'missing') {
    const key = JSON.parse(rows.get(primary)).saveManifest.chunks.news.key;
    const db = await openBaseballManagerDb();
    await new Promise(resolve => { const tx = db.transaction('save_chunks', 'readwrite'); tx.objectStore('save_chunks').delete(key); tx.oncomplete = resolve; });
    db.close();
  }
  const read = deferNextSaveRead({ abort: outcome === 'error' }), loading = loadGame(); await read.ready;
  expect(await deleteSave()).toEqual({ ok: true });
  read.release(); expect(await loading).toBeNull();
  expect(getLastLoadResult().status).toBe('none');
  expect((await save(state(1, 'fresh'))).ok).toBe(true);
  expect((await loadGame()).saveId).toBe('fresh');
});

it('does not overwrite a newer successful load or its cache with an older completion', async () => {
  await save(state());
  const read = deferNextSaveRead(), oldLoad = loadGame(); await read.ready;
  await save(state(2)); const latest = await loadGame(), latestResult = getLastLoadResult();
  read.release(); await oldLoad;
  expect(getLastLoadResult()).toEqual(latestResult);
  expect((await save({ ...latest, gameDay: 3 }, { dirtyScopes: [] })).ok).toBe(true);
  expect((await loadGame()).news).toEqual([{ day: 2 }]);
});

it('does not return a stale state authorized by a newer successful load', async () => {
  await save(state());
  const read = deferNextSaveRead(), oldLoad = loadGame(); await read.ready;
  await save(state(2)); await loadGame();
  read.release(); const stale = await oldLoad;
  expect(stale).toBeNull();
  expect((await save(stale)).ok).toBe(false);
  expect((await loadGame()).gameDay).toBe(2);
});

it('rejects a stale cold read when an initial storage error prevented observation', async () => {
  await save(state()); vi.stubGlobal('localStorage', storage());
  vi.spyOn(localStorage, 'getItem').mockImplementationOnce(() => { throw new Error('temporary read failure'); });
  const read = deferNextSaveRead(), loading = loadGame(); await read.ready;
  rows.set(primary, JSON.stringify({ ...JSON.parse(rows.get(primary)), gameDay: 99 }));
  read.release(); const stale = await loading;
  expect(stale).toBeNull();
  expect((await save(stale)).ok).toBe(false);
  expect(JSON.parse(rows.get(primary)).gameDay).toBe(99);
});

it.each(['primary', 'backup'])('preserves cross-tab conflict protection for a cold %s read', async candidate => {
  await save(state());
  if (candidate === 'backup') { rows.set(keys[2], rows.get(primary)); rows.delete(primary); }
  vi.stubGlobal('localStorage', storage()); // A new tab has no cached observation yet.
  const read = deferNextSaveRead(), loading = loadGame(); await read.ready;
  const changedKey = candidate === 'primary' ? primary : keys[2];
  const changed = JSON.stringify({ ...JSON.parse(rows.get(changedKey)), gameDay: 99 });
  rows.set(changedKey, changed);
  read.release(); const loaded = await loading;
  expect(loaded.gameDay).toBe(1);
  expect(await save(loaded)).toMatchObject({ ok: false, reason: 'save_conflict' });
  expect(rows.get(changedKey)).toBe(changed);
});

it.each(keys)('retains roots and metadata after deletion of %s fails, and permits retry', async failingKey => {
  await save(state()); await save(state(2)); rows.set(keys[3], rows.get(keys[2]));
  const before = keys.map(key => rows.get(key));
  const remove = localStorage.removeItem;
  vi.spyOn(localStorage, 'removeItem').mockImplementation(key => {
    if (key === failingKey) throw new Error('remove failed');
    return remove(key);
  });
  expect(await deleteSave()).toMatchObject({ ok: false, reason: 'delete_failed' });
  expect(keys.map(key => rows.get(key))).toEqual(before);
  expect((await save(state(3))).ok).toBe(true);
  vi.restoreAllMocks();
  expect(await deleteSave()).toEqual({ ok: true });
  expect((await save(state(1, 'fresh'))).ok).toBe(true);
  expect((await loadGame()).saveId).toBe('fresh');
});
