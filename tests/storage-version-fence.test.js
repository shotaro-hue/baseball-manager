import { it, expect, vi } from 'vitest';
import { IDBDatabase } from 'fake-indexeddb';
import { openBaseballManagerDb, BASEBALL_MANAGER_DB_VERSION } from '../src/engine/baseballManagerDb.js';
import { saveGame, loadGame } from '../src/engine/saveload.js';
import { saveFeedback } from '../src/engine/saveFeedback.js';
import { collectSaveDiagnostics } from '../src/engine/saveDiagnostics.js';
import { game, PRIMARY } from './helpers/save-01b0-storage.js';
import { LEGACY_DB_NAME, seedLegacyDb, openLegacyDb, readDbSnapshot } from './helpers/storage-version-fence.js';

const roots = () => [PRIMARY, PRIMARY + '_bk1', PRIMARY + '_bk2'].map(key => localStorage.getItem(key));

it('storage access denial remains a rejected Promise even when the indexedDB getter throws', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw new DOMException('PRIVATE', 'SecurityError'); } });
  try {
    const promise = openBaseballManagerDb();
    expect(promise).toBeInstanceOf(Promise);
    await expect(promise).rejects.toMatchObject({ name: 'SecurityError' });
  } finally { Object.defineProperty(globalThis, 'indexedDB', descriptor); }
});
function rawOpen(version) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(LEGACY_DB_NAME, version);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
}

it('a native open queued without any events times out instead of hanging later saves forever', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('indexedDB', { open: () => ({}) });
  let result;
  const pending = openBaseballManagerDb().then(() => { result = 'unexpected-success'; }, error => { result = error.name; });
  try {
    await vi.advanceTimersByTimeAsync(10_000);
    expect(result).toBe('StorageOpenTimeoutError');
    await pending;
  } finally { vi.useRealTimers(); }
});

it('upgrades v3 to v4 without changing any store, mixed key, index or payload', async () => {
  const old = await seedLegacyDb(); const before = await readDbSnapshot(old); old.close();
  localStorage.setItem(PRIMARY, 'root sentinel'); localStorage.setItem(PRIMARY + '_bk1', 'backup sentinel');
  const beforeRoots = roots(), db = await openBaseballManagerDb();
  try {
    expect(BASEBALL_MANAGER_DB_VERSION).toBe(4); expect(db.version).toBe(4);
    expect(await readDbSnapshot(db)).toEqual(before); expect(roots()).toEqual(beforeRoots);
    await expect(openLegacyDb()).rejects.toMatchObject({ name: 'VersionError' });
  } finally { db.close(); }
});

it('concurrent callers receive separate connections and closing one does not break its peer', async () => {
  const [first, second] = await Promise.all([openBaseballManagerDb(), openBaseballManagerDb()]);
  try {
    expect(first).not.toBe(second); first.close();
    expect(await readDbSnapshot(second)).toHaveLength(5);
  } finally { first.close(); second.close(); }
});

it('rejects a blocked upgrade, aborts its later activation and permits an explicit fresh retry', async () => {
  const old = await seedLegacyDb({ hold: true }); const before = await readDbSnapshot(old);
  const opens = [], open = indexedDB.open.bind(indexedDB);
  vi.spyOn(indexedDB, 'open').mockImplementation((...args) => { const req = open(...args); opens.push(req); return req; });
  const pending = openBaseballManagerDb();
  try {
    await expect(pending).rejects.toMatchObject({ name: 'StorageUpgradeBlockedError' });
    expect(old.version).toBe(3); expect(await readDbSnapshot(old)).toEqual(before);
  } finally { old.close(); }
  // The failed request must not silently upgrade after its blocker disappears.
  const abandoned = opens[0];
  await vi.waitFor(() => expect(abandoned.readyState).toBe('done'));
  expect(abandoned.error?.name).toBe('AbortError');
  const stillOld = await rawOpen(3); expect(stillOld.version).toBe(3); stillOld.close();
  const db = await openBaseballManagerDb();
  try { expect(db.version).toBe(4); expect(await readDbSnapshot(db)).toEqual(before); }
  finally { db.close(); }
});

it('closes helper-owned connections on versionchange so newer code can upgrade', async () => {
  const db = await openBaseballManagerDb();
  expect(typeof db.onversionchange).toBe('function');
  const newer = await rawOpen(5);
  try {
    expect(() => db.transaction('save_chunks')).toThrow();
    await expect(openBaseballManagerDb()).rejects.toMatchObject({ name: 'VersionError' });
  } finally { db.close(); newer.close(); }
});

it('a synchronous schema exception aborts creation and leaves a fresh retry possible', async () => {
  const create = IDBDatabase.prototype.createObjectStore;
  vi.spyOn(IDBDatabase.prototype, 'createObjectStore').mockImplementation(function(name, options) {
    if (name === 'career_logs') throw new Error('injected schema error');
    return create.call(this, name, options);
  });
  await expect(openBaseballManagerDb()).rejects.toThrow('injected schema error');
  vi.restoreAllMocks();
  const db = await openBaseballManagerDb();
  try { expect(Array.from(db.objectStoreNames)).toHaveLength(5); expect(db.version).toBe(4); }
  finally { db.close(); }
});

it('blocked save preserves existing roots and safely reports a conditional retry', async () => {
  const old = await seedLegacyDb({ hold: true });
  for (const key of [PRIMARY, PRIMARY + '_bk1', PRIMARY + '_bk2']) localStorage.setItem(key, JSON.stringify(game()));
  const requests = [], open = indexedDB.open.bind(indexedDB);
  vi.spyOn(indexedDB, 'open').mockImplementation((...args) => { const req = open(...args); requests.push(req); return req; });
  const before = roots();
  let result;
  try {
    result = await saveGame(game());
    expect(result).toMatchObject({ ok: false, reason: 'storage_upgrade_blocked', diagnostics: { exceptionName: 'StorageUpgradeBlockedError' } });
    expect(roots()).toEqual(before);
    const feedback = saveFeedback(result);
    expect(feedback).toMatchObject({ reason: 'storage_upgrade_blocked', retryable: true });
    expect(feedback.recovery).toContain('別タブ'); expect(feedback.recovery).toContain('未保存');
    expect(feedback.recovery).not.toMatch(/サイトデータ.*消去|初期化/);
    expect((await collectSaveDiagnostics(result)).reason).toBe('storage_upgrade_blocked');
  } finally { old.close(); }
  await vi.waitFor(() => expect(requests[0].readyState).toBe('done'));
  expect((await saveGame(game())).ok).toBe(true);
  expect((await loadGame()).saveId).toBe('source');
});

it('outdated save refuses a newer DB and preserves committed roots and all rows', async () => {
  expect((await saveGame(game())).ok).toBe(true);
  const before = roots(), db = await rawOpen(5), beforeRows = await readDbSnapshot(db); db.close();
  const result = await saveGame({ ...game(), gameDay: 2 });
  expect(result).toMatchObject({ ok: false, reason: 'storage_version_outdated', diagnostics: { exceptionName: 'VersionError' } });
  expect(roots()).toEqual(before);
  const after = await rawOpen(5);
  try { expect(await readDbSnapshot(after)).toEqual(beforeRows); } finally { after.close(); }
  const feedback = saveFeedback(result);
  expect(feedback.retryable).toBe(false); expect(feedback.recovery).toContain('未保存');
  expect(feedback.recovery).toContain('最新'); expect(feedback.recovery).not.toContain('保存ボタンで再試行');
  expect((await collectSaveDiagnostics(result)).reason).toBe('storage_version_outdated');
});
