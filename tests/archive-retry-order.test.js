import { beforeEach, expect, it, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import { batch, rows } from './helpers/save-01b0-storage.js';

beforeEach(() => vi.resetModules());

function holdNextWrite({ fail = false } = {}) {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const request = vi.fn(async (_name, options, task) => {
    await gate;
    if (fail) throw new Error('injected active write failure');
    return (task || options)();
  });
  vi.stubGlobal('navigator', { locks: { request } });
  return { request, release };
}

async function drain(archive) {
  await archive.flushBattedBallQueue();
  while (archive.getBattedBallQueueStatus().isWriting || archive.getBattedBallQueueStatus().queuedRecords) {
    await archive.flushBattedBallQueue();
  }
}

it('keeps the newer batch and aggregate when legacy retry overlaps its active replacement write', async () => {
  const archive = await import('../src/engine/battedBallArchive');
  vi.stubGlobal('navigator', { locks: { request: async () => { throw new Error('injected old failure'); } } });
  archive.enqueueBattedBallBatches([batch(140)]);
  expect(await archive.flushBattedBallQueue()).toMatchObject({ ok: false });
  const held = holdNextWrite();
  archive.enqueueBattedBallBatches([batch(180)]);
  await vi.waitFor(() => expect(held.request).toHaveBeenCalledOnce());
  const retry = archive.retryFailedBattedBallWrites();
  held.release(); await retry; await drain(archive);
  expect((await rows('batted_ball_batches'))[0][1].events[0].evKmh).toBe(180);
  const aggregate = (await rows('batted_ball_aggregates'))[0][1];
  expect(aggregate.totalEvents).toBe(1);
  expect(aggregate.profilesByResult.all.evSum).toBe(180);
  expect(archive.getBattedBallQueueStatus()).toMatchObject({ failedRecords: 0, queuedRecords: 0 });
});

it('does not resurrect an older active failure after a newer batch was already queued', async () => {
  const archive = await import('../src/engine/battedBallArchive');
  const old = holdNextWrite({ fail: true });
  archive.enqueueBattedBallBatches([batch(140)]);
  await vi.waitFor(() => expect(old.request).toHaveBeenCalledOnce());
  archive.enqueueBattedBallBatches([batch(180)]);
  const newer = holdNextWrite();
  old.release();
  await vi.waitFor(() => expect(newer.request).toHaveBeenCalledOnce());
  const retry = archive.retryFailedBattedBallWrites();
  newer.release(); await retry; await drain(archive);
  expect((await rows('batted_ball_batches'))[0][1].events[0].evKmh).toBe(180);
  expect(archive.getBattedBallQueueStatus().failedRecords).toBe(0);
});

it('aborts aggregate changes if a synchronous batch write fails, then retries without double counting', async () => {
  const archive = await import('../src/engine/battedBallArchive');
  const put = IDBObjectStore.prototype.put;
  const fail = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(row, ...args) {
    if (this.name === 'batted_ball_batches') throw new DOMException('injected synchronous failure', 'DataCloneError');
    return put.call(this, row, ...args);
  });
  archive.enqueueBattedBallBatches([batch(180)]);
  expect(await archive.flushBattedBallQueue()).toMatchObject({ ok: false });
  expect(await rows('batted_ball_batches')).toEqual([]);
  expect(await rows('batted_ball_aggregates')).toEqual([]);
  fail.mockRestore();
  expect(await archive.retryFailedBattedBallWrites()).toMatchObject({ ok: true });
  expect((await rows('batted_ball_aggregates'))[0][1].profilesByResult.all).toMatchObject({ bip: 1, evSum: 180 });
});
