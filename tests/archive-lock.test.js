import { beforeEach, it, expect, vi } from 'vitest';
import { batch, rows } from './helpers/save-01b0-storage.js';
import { openBaseballManagerDb } from '../src/engine/baseballManagerDb.js';

const LOCK = 'baseball-manager-archive';
beforeEach(() => vi.resetModules());

async function seedLegacy() {
  const db = await openBaseballManagerDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(['batted_ball_batches', 'batted_ball_meta'], 'readwrite');
      tx.objectStore('batted_ball_batches').put({ ...batch(), eventCount: 1 });
      tx.objectStore('batted_ball_meta').put({ saveId: 'source', estimatedEventCount: 1 });
      tx.oncomplete = resolve; tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

function delayedLock() {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const request = vi.fn(async (name, options, task) => {
    await gate;
    return (task || options)();
  });
  vi.stubGlobal('navigator', { locks: { request } });
  return { request, release };
}

for (const operation of ['write', 'retry', 'backfill', 'delete']) {
  it(`${operation} waits for the common archive lock before changing any store`, async () => {
    const archive = await import('../src/engine/battedBallArchive.js');
    await seedLegacy();
    if (operation === 'retry') {
      vi.stubGlobal('navigator', { locks: { request: vi.fn().mockRejectedValue(new Error('denied')) } });
      archive.enqueueBattedBallBatches([batch(180)]);
      expect((await archive.flushBattedBallQueue()).ok).toBe(false);
      expect(archive.getBattedBallQueueStatus().failedRecords).toBe(1);
    }
    const stores = ['batted_ball_batches', 'batted_ball_meta', 'batted_ball_aggregates'];
    const before = await Promise.all(stores.map(rows));
    const lock = delayedLock();
    let pending;
    if (operation === 'write') {
      archive.enqueueBattedBallBatches([batch(180)]);
      pending = archive.flushBattedBallQueue();
    } else if (operation === 'retry') pending = archive.retryFailedBattedBallWrites();
    else if (operation === 'delete') pending = archive.deleteBattedBallArchiveBySaveId('source');
    else pending = archive.loadBattedBallComparisonProfiles({ saveId: 'source', year: 2026, playerIds: ['0'] });
    let finished = false;
    pending.then(() => { finished = true; }, () => { finished = true; });
    try {
      await vi.waitFor(() => expect(lock.request).toHaveBeenCalled(), { timeout: 300 });
      expect(lock.request.mock.calls[0][0]).toBe(LOCK);
      expect(finished).toBe(false);
      expect(await Promise.all(stores.map(rows))).toEqual(before);
    } finally { lock.release(); await pending; }
    expect(lock.request).toHaveBeenCalledTimes(1);
    if (operation === 'write' || operation === 'retry') {
      expect((await rows('batted_ball_batches'))[0][1].events[0].evKmh).toBe(180);
      expect(archive.getBattedBallQueueStatus().failedRecords).toBe(0);
    } else if (operation === 'delete') expect(await rows('batted_ball_batches')).toEqual([]);
    else expect((await rows('batted_ball_aggregates'))[0][1].totalEvents).toBe(1);
  });
}

it.each(['sync', 'async'])('%s lock failure keeps the failed batch retryable and the mutation queue progresses', async kind => {
  const archive = await import('../src/engine/battedBallArchive.js');
  const failure = () => { throw new Error('lock failure'); };
  const request = vi.fn(kind === 'sync' ? failure : async () => failure());
  vi.stubGlobal('navigator', { locks: { request } });
  archive.enqueueBattedBallBatches([batch()]);
  expect(await archive.flushBattedBallQueue()).toMatchObject({ ok: false, written: 0 });
  expect(await rows('batted_ball_batches')).toEqual([]);
  request.mockImplementation(async (_name, options, task) => (task || options)());
  expect(await archive.retryFailedBattedBallWrites()).toMatchObject({ ok: true, written: 1 });
  expect(await archive.deleteBattedBallArchiveBySaveId('source')).toMatchObject({ ok: true, deleted: 1 });
  expect(request.mock.calls.map(call => call[0])).toEqual([LOCK, LOCK, LOCK]);
});

it('browser without Web Locks fails closed without opening IndexedDB and can retry after support returns', async () => {
  const archive = await import('../src/engine/battedBallArchive.js');
  vi.stubGlobal('window', {}); vi.stubGlobal('navigator', {});
  const open = vi.spyOn(indexedDB, 'open');
  archive.enqueueBattedBallBatches([batch()]);
  expect(await archive.flushBattedBallQueue()).toMatchObject({ ok: false, error: 'archive_lock_unavailable' });
  await expect(archive.deleteBattedBallArchiveBySaveId('source')).rejects.toThrow('archive_lock_unavailable');
  expect(open).not.toHaveBeenCalled();
  vi.stubGlobal('navigator', { locks: { request: async (_name, options, task) => (task || options)() } });
  expect(await archive.retryFailedBattedBallWrites()).toMatchObject({ ok: true, written: 1 });
});
