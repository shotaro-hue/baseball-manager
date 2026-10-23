// Characterization of current storage, not a claim that the portable format exists.
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb.js';
import { saveGame, loadGame } from '../src/engine/saveload.js';
import { captureInlineCareerLogs, prepareCareerData } from '../src/engine/careerGenerations.js';
import { prepareGeneration, readCareerGeneration } from '../src/engine/saveGenerations.js';

const PRIMARY = 'baseball_manager_v1';
const entry = year => ({ year, teamId: 0, stats: { HR: year - 2000 } });
const game = () => ({ saveId: 'source', year: 2026, gameDay: 1, myId: 0,
  teams: [{ id: 0, name: 'probe', players: [{ id: 0, careerLog: [entry(2025)] }], farm: [] }],
  news: [], mailbox: [], seasonHistory: {} });
const batch = (evKmh = 140) => ({ id: 'source:2026:future:0', saveId: 'source', year: 2026,
  playerId: '0', gameId: 'future', gameDay: 2, events: [{ result: 's', evKmh, laDeg: 15 }] });

async function rows(storeName) {
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

it('current archive can contain a future game after the primary commit failed', async () => {
  const archive = await import('../src/engine/battedBallArchive.js');
  expect((await saveGame(game(), { skipCompression: true })).ok).toBe(true);
  archive.enqueueBattedBallBatches([batch()]);
  expect((await archive.flushBattedBallQueue()).ok).toBe(true);
  const original = localStorage.getItem(PRIMARY), set = localStorage.setItem;
  vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
    if (k === PRIMARY) throw new Error('injected primary failure'); set(k, v);
  });
  expect((await saveGame({ ...game(), gameDay: 2 })).ok).toBe(false);
  expect(localStorage.getItem(PRIMARY)).toBe(original);
  expect((await loadGame()).gameDay).toBe(1);
  expect((await rows('batted_ball_batches'))[0][1].gameDay).toBe(2);
});

it('same-ID archive replacement changes bytes while batch count and event count stay equal', async () => {
  const archive = await import('../src/engine/battedBallArchive.js');
  archive.enqueueBattedBallBatches([batch(140)]); await archive.flushBattedBallQueue();
  const before = await rows('batted_ball_batches');
  archive.enqueueBattedBallBatches([batch(180)]); await archive.flushBattedBallQueue();
  const after = await rows('batted_ball_batches');
  expect(after.map(([key]) => key)).toEqual(before.map(([key]) => key));
  expect(after[0][1].eventCount).toBe(before[0][1].eventCount);
  expect(after[0][1].events[0].evKmh).toBe(180);
  expect(after[0][1].events).not.toEqual(before[0][1].events);
});

for (const version of [3, 4, 5]) it(`v${version} numeric-zero career capture can stage v6 without overwriting global legacy rows`, async () => {
  const source = { ...game(), saveDataVersion: version };
  const db = await openBaseballManagerDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('career_logs', 'readwrite');
    tx.objectStore('career_logs').put([entry(2010)], 0);
    tx.objectStore('career_logs').put([entry(2001)], 'unrelated');
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  }); db.close();
  const before = await rows('career_logs');
  const data = await prepareCareerData(source, source, {}, captureInlineCareerLogs(source), source);
  expect(data.players).toEqual([['0', [entry(2010), entry(2025)]]]);
  expect(await rows('career_logs')).toEqual(before); // source capture is read-only
  // The selected portable candidate has already captured source history. The
  // destination may contain BOTH colliding key types for an unrelated game.
  const destinationDb = await openBaseballManagerDb();
  await new Promise((resolve, reject) => {
    const tx = destinationDb.transaction('career_logs', 'readwrite');
    tx.objectStore('career_logs').put([entry(2088)], 0);
    tx.objectStore('career_logs').put([entry(2099)], '0');
    tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
  }); destinationDb.close();
  const destinationBefore = await rows('career_logs');
  const restored = { ...source, saveId: 'fresh-destination' };
  const { manifest } = await prepareGeneration(restored, null, undefined, data);
  const actual = await readCareerGeneration({ ...restored, saveDataVersion: 6, saveManifest: manifest });
  expect(actual).toEqual(data);
  expect(await rows('career_logs')).toEqual(destinationBefore);
});

it('legacy career read errors reject capture rather than silently producing empty history', async () => {
  vi.stubGlobal('indexedDB', { open() { throw new Error('injected read failure'); } });
  const source = { ...game(), saveDataVersion: 4 };
  await expect(prepareCareerData(source, source)).rejects.toThrow('injected read failure');
});
