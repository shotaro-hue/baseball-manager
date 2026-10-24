import { it, expect, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb.js';
import { collectUnusedChunks } from '../src/engine/saveGenerations.js';
import { createBattedBallReceiptRun, readBattedBallReceipt } from '../src/engine/battedBallReceipts.js';
import { createBattedBallRunEmitter, emptyBattedBallReceipt } from '../src/engine/battedBallRun.js';
import { batch, rows, game } from './helpers/save-01b0-storage.js';
import { saveGame, loadGame, deleteSave } from '../src/engine/saveload.js';

// Model the browser boundary: exclusive named locks, held inventory, and a
// process exit that drops its held retention locks. Product data remains real IDB.
function locksHarness() {
  const held = new Map(), queues = new Map();
  const advance = name => {
    if (held.has(name)) return;
    const next = queues.get(name)?.shift();
    if (!next) return;
    held.set(name, next);
    Promise.resolve().then(() => next.callback({ name, mode: 'exclusive' }))
      .then(next.resolve, next.reject).finally(() => {
        if (held.get(name) === next) held.delete(name);
        advance(name);
      });
  };
  const locks = {
    request(name, options, callback) {
      if (typeof options === 'function') callback = options;
      return new Promise((resolve, reject) => {
        if (!queues.has(name)) queues.set(name, []);
        queues.get(name).push({ callback, resolve, reject }); advance(name);
      });
    },
    async query() { return { held: [...held.keys()].map(name => ({ name, mode: 'exclusive' })), pending: [] }; },
  };
  vi.stubGlobal('navigator', { locks });
  return {
    locks,
    exit() { for (const name of held.keys()) if (name.startsWith('baseball-manager-archive-retain:')) held.delete(name); },
  };
}
async function stage(runId, speed, previous = emptyBattedBallReceipt('source')) {
  const run = createBattedBallReceiptRun({ saveId: 'source', runId, previousReceipt: previous });
  const emitter = createBattedBallRunEmitter(chunk => run.append(chunk), { runId });
  emitter.add([batch(speed)]);
  return { run, receipt: await run.seal(emitter.finish()) };
}
const root = receipt => ({ saveId: 'source', battedBallReceipt: receipt });
const versions = async () => (await rows('save_chunks')).filter(([key]) => key.startsWith('batted-ball-version:'));
async function speeds(receipt) {
  const result = [];
  await readBattedBallReceipt(receipt, { onChunk: records => result.push(...records.flatMap(r => r.events.map(e => e.evKmh))) });
  return result;
}

it('reclaims exited-owner versions while preserving the exact saved receipt', async () => {
  const browser = locksHarness();
  const saved = await stage('saved', 140); await stage('orphan', 190);
  browser.exit();
  expect((await versions()).length).toBe(4);
  await collectUnusedChunks([root(saved.receipt)]);
  expect((await versions()).length).toBe(2);
  expect(await speeds(saved.receipt)).toEqual([140]);
});

it('keeps the primary and both independent backup histories', async () => {
  const browser = locksHarness();
  const primary = await stage('primary', 180), backup1 = await stage('backup1', 160), backup2 = await stage('backup2', 140);
  await stage('orphan', 200); browser.exit();
  await collectUnusedChunks([root(primary.receipt), root(backup1.receipt), root(backup2.receipt)]);
  expect((await versions()).length).toBe(6);
  expect(await speeds(primary.receipt)).toEqual([180]);
  expect(await speeds(backup1.receipt)).toEqual([160]);
  expect(await speeds(backup2.receipt)).toEqual([140]);
});

it('protects a live unpublished run and its ancestor after its saved root is gone', async () => {
  const browser = locksHarness();
  const ancestor = await stage('ancestor', 140); await stage('orphan', 200); browser.exit();
  const live = await stage('live', 180, ancestor.receipt);
  await collectUnusedChunks([]);
  expect((await versions()).length).toBe(4);
  expect(await speeds(live.receipt)).toEqual([180]);
});

it('does not sweep without a trustworthy live-lock inventory', async () => {
  await stage('unprotected', 180);
  const before = await versions();
  vi.stubGlobal('navigator', { locks: { request: async (name, options, callback) => callback() } });
  await collectUnusedChunks([]);
  expect(await versions()).toEqual(before);
});

it('aborts archive collection when a saved chain is corrupt', async () => {
  const browser = locksHarness();
  const saved = await stage('saved', 140); await stage('orphan', 200); browser.exit();
  const before = await versions();
  const broken = { ...saved.receipt, head: { ...saved.receipt.head, digest: '0'.repeat(64) } };
  await expect(collectUnusedChunks([root(broken)])).rejects.toThrow();
  expect(await versions()).toEqual(before);
});

it('aborts archive collection if lock inventory fails', async () => {
  const browser = locksHarness(); await stage('orphan', 200); browser.exit();
  const before = await versions();
  browser.locks.query = async () => { throw new Error('inventory denied'); };
  await expect(collectUnusedChunks([])).rejects.toThrow('inventory denied');
  expect(await versions()).toEqual(before);
});

it('cancellation waits for an overlapping seal and removes its run metadata too', async () => {
  const digest = crypto.subtle.digest.bind(crypto.subtle);
  let release, entered;
  const gate = new Promise(resolve => { release = resolve; });
  const hashingRun = new Promise(resolve => { entered = resolve; });
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (algorithm, bytes) => {
    if (new TextDecoder().decode(bytes).includes('"kind":"run"')) { entered(); await gate; }
    return digest(algorithm, bytes);
  });
  const run = createBattedBallReceiptRun({ saveId: 'source', runId: 'cancel-race' });
  const emitter = createBattedBallRunEmitter(chunk => run.append(chunk), { runId: 'cancel-race' });
  emitter.add([batch(180)]);
  const sealed = run.seal(emitter.finish()); await hashingRun;
  const cancelled = run.discard();
  await new Promise(resolve => setTimeout(resolve, 0)); release();
  await sealed; expect(await cancelled).toBe(true);
  expect(await versions()).toEqual([]);
});

it('rejects an explicit pre-retention v4 writer after activating current storage', async () => {
  locksHarness(); const db = await openBaseballManagerDb(); db.close();
  const old = new Promise((resolve, reject) => {
    const req = indexedDB.open('baseball_manager_storage', 4);
    req.onsuccess = () => { req.result.close(); resolve(true); };
    req.onerror = () => reject(req.error);
  });
  await expect(old).rejects.toMatchObject({ name: 'VersionError' });
});

it('pins the snapshot being saved before pre-publication collection', async () => {
  const browser = locksHarness();
  const candidate = await stage('candidate', 180); browser.exit();
  expect((await saveGame({ ...game(), battedBallReceipt: candidate.receipt })).ok).toBe(true);
  const loaded = await loadGame();
  expect(await speeds(loaded.battedBallReceipt)).toEqual([180]);
});

it('reclaims a deleted save after its settled current reference is released', async () => {
  locksHarness(); const candidate = await stage('deleted', 180);
  candidate.run.adopt();
  const receipts = await import('../src/engine/battedBallReceipts.js');
  await receipts.flushBattedBallReceipts(candidate.receipt);
  expect((await saveGame({ ...game(), battedBallReceipt: candidate.receipt })).ok).toBe(true);
  await loadGame();
  expect((await deleteSave()).ok).toBe(true);
  expect(await versions()).toEqual([]);
});

it('bounds routine collection frequency and permits an explicit space-pressure pass', async () => {
  const browser = locksHarness();
  await stage('first', 180); browser.exit(); await collectUnusedChunks([]);
  expect(await versions()).toEqual([]);
  await stage('second', 180); browser.exit();
  await collectUnusedChunks([]); expect((await versions()).length).toBe(2);
  await collectUnusedChunks([], { force: true }); expect(await versions()).toEqual([]);
});

it('preserves all versions of a legacy save whose receipt provenance is unknown', async () => {
  const browser = locksHarness();
  await stage('legacy-owned', 180); browser.exit();
  const before = await versions();
  await collectUnusedChunks([{ saveId: 'source', battedBallReceipt: null }]);
  expect(await versions()).toEqual(before);
});

it('refuses a receipt that belongs to another saved identity before deleting anything', async () => {
  const browser = locksHarness(); const saved = await stage('saved', 180); browser.exit();
  const before = await versions();
  await expect(collectUnusedChunks([{ saveId: 'other', battedBallReceipt: saved.receipt }])).rejects.toThrow();
  expect(await versions()).toEqual(before);
});

it('rolls back all archive deletions when the roots change during sweeping', async () => {
  const browser = locksHarness(); await stage('orphan', 180); browser.exit();
  const before = await versions(); let checks = 0;
  await expect(collectUnusedChunks([], { force: true, ownsSnapshot: () => ++checks < 3 })).rejects.toThrow('archive_gc_roots_changed');
  expect(await versions()).toEqual(before);
});

it('aborts the entire sweep after a synchronous delete error rather than partially committing', async () => {
  const browser = locksHarness(); await stage('orphan', 180); browser.exit();
  const before = await versions(), remove = IDBObjectStore.prototype.delete; let writes = 0;
  vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function(key) {
    if (typeof key === 'string' && key.startsWith('batted-ball-version:') && ++writes === 2) throw new Error('delete denied');
    return remove.call(this, key);
  });
  await expect(collectUnusedChunks([])).rejects.toThrow('delete denied');
  expect(await versions()).toEqual(before);
});

it('keeps the seal API asynchronous when a caller accidentally seals twice', async () => {
  const staged = await stage('double-seal', 180);
  let result;
  expect(() => { result = staged.run.seal({}); }).not.toThrow();
  await expect(result).rejects.toThrow('archive_run_closed');
  await staged.run.discard();
});

it('a read-only saved-state load cannot release newer unpublished progress', async () => {
  locksHarness();
  const old = await stage('saved-read', 140); old.run.adopt();
  const receipts = await import('../src/engine/battedBallReceipts.js');
  await receipts.flushBattedBallReceipts(old.receipt);
  expect((await saveGame({ ...game(), battedBallReceipt: old.receipt })).ok).toBe(true);
  const unsaved = await stage('new-progress', 180); unsaved.run.adopt();
  await receipts.flushBattedBallReceipts(unsaved.receipt);
  const loaded = await loadGame();
  await collectUnusedChunks([loaded], { force: true });
  expect(await speeds(loaded.battedBallReceipt)).toEqual([140]);
  expect(await speeds(unsaved.receipt)).toEqual([180]);
});
