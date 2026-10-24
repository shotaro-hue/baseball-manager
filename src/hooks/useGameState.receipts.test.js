import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBObjectStore } from 'fake-indexeddb';
import { game, PRIMARY, batch, rows } from '../../tests/helpers/save-01b0-storage.js';
import { useGameState } from './useGameState';
import { emptyBattedBallReceipt } from '../engine/battedBallRun';
import { createBattedBallReceiptRun } from '../engine/battedBallReceipts';
import { saveGame, loadGame } from '../engine/saveload';
let view, gs;
afterEach(() => act(() => view?.unmount()));
it('retains adopted receipts in manual/autosave payloads and year changes, then clears them on another save identity', async () => {
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  const receipt = emptyBattedBallReceipt('source');
  act(() => gs.applyProgressCandidate({ ...game(), battedBallReceipt: receipt }));
  expect(gs.battedBallReceipt).toEqual(receipt);
  let saved;
  await act(async () => { saved = await gs.handleSave({ silent: true }); });
  expect(saved.ok).toBe(true); expect((await loadGame()).battedBallReceipt).toEqual(receipt);
  act(() => gs.setYear(2027));
  await act(async () => { saved = await gs.handleSave({ silent: true }); });
  expect(saved.ok).toBe(true); expect((await loadGame()).battedBallReceipt).toEqual(receipt);
  act(() => gs.setSaveId('other'));
  expect(gs.battedBallReceipt).toBeNull();
});
it('refuses omission of an existing same-save receipt before changing primary or backups', async () => {
  const state = { ...game(), battedBallReceipt: emptyBattedBallReceipt('source') };
  expect((await saveGame(state)).ok).toBe(true);
  const before = [PRIMARY, PRIMARY + '_bk1', PRIMARY + '_bk2'].map(k => localStorage.getItem(k));
  const next = { ...state, gameDay: 2 }; delete next.battedBallReceipt;
  expect(await saveGame(next)).toMatchObject({ ok: false, reason: 'archive_receipt_missing' });
  expect([PRIMARY, PRIMARY + '_bk1', PRIMARY + '_bk2'].map(k => localStorage.getItem(k))).toEqual(before);
});
it('keeps a successful game save distinct from a persisted incomplete archive even with no retry queue after reload', async () => {
  const run = createBattedBallReceiptRun({ saveId: 'source', runId: 'gap', previousReceipt: emptyBattedBallReceipt('source') });
  const receipt = await run.seal({ version: 1, runId: 'gap', chunkCount: 1, recordCount: 1, eventCount: 1 });
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => gs.applyProgressCandidate({ ...game(), battedBallReceipt: receipt }));
  let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result).toMatchObject({ ok: true, archive: { ok: false } });
  expect((await loadGame()).battedBallReceipt.coverage).toBe('incomplete');
});

it('saves its own archive successfully while another save retains a failed projection for retry', async () => {
  const archive = await import('../engine/battedBallArchive');
  const put = IDBObjectStore.prototype.put;
  const failForeign = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(row, ...args) {
    if (this.name === 'batted_ball_batches' && row.saveId === 'foreign') throw new DOMException('injected', 'AbortError');
    return put.call(this, row, ...args);
  });
  archive.enqueueBattedBallBatches([{ ...batch(150), id: 'foreign-batch', saveId: 'foreign' }]);
  expect(await archive.flushBattedBallQueue()).toMatchObject({ ok: false });
  const run = createBattedBallReceiptRun({ saveId: 'source', runId: 'own-run', previousReceipt: emptyBattedBallReceipt('source') });
  run.append({ runId: 'own-run', index: 0, records: [batch(180)] });
  const receipt = await run.seal({ version: 1, runId: 'own-run', chunkCount: 1, recordCount: 1, eventCount: 1 });
  run.adopt();
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => gs.applyProgressCandidate({ ...game(), battedBallReceipt: receipt }));
  let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result).toMatchObject({ ok: true, archive: { ok: true } });
  expect((await rows('batted_ball_batches')).map(([, row]) => row.saveId)).toEqual(['source']);
  expect(archive.getBattedBallQueueStatus({ saveId: 'foreign' }).failedRecords).toBe(1);
  failForeign.mockRestore();
  expect(await archive.retryFailedBattedBallWrites({ saveId: 'foreign' })).toMatchObject({ ok: true });
  expect((await rows('batted_ball_batches')).some(([, row]) => row.saveId === 'foreign')).toBe(true);
});

it('reports repaired own history after a legacy retry succeeds during the same save', async () => {
  const archive = await import('../engine/battedBallArchive');
  const { flushBattedBallReceipts } = await import('../engine/battedBallReceipts');
  const put = IDBObjectStore.prototype.put;
  let attempts = 0;
  vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function(row, ...args) {
    if (this.name === 'batted_ball_batches' && row.saveId === 'source' && ++attempts <= 2) {
      throw new DOMException('transient failure', 'AbortError');
    }
    return put.call(this, row, ...args);
  });
  const run = createBattedBallReceiptRun({ saveId: 'source', runId: 'repair-own', previousReceipt: emptyBattedBallReceipt('source') });
  run.append({ runId: 'repair-own', index: 0, records: [batch(180)] });
  const receipt = await run.seal({ version: 1, runId: 'repair-own', chunkCount: 1, recordCount: 1, eventCount: 1 });
  run.adopt();
  expect(await flushBattedBallReceipts(receipt)).toMatchObject({ ok: false });
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => gs.applyProgressCandidate({ ...game(), battedBallReceipt: receipt }));
  let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result).toMatchObject({ ok: true, archive: { ok: true } });
  expect(archive.getBattedBallQueueStatus({ saveId: 'source' }).failedRecords).toBe(0);
  expect((await rows('batted_ball_batches'))[0][1].events[0].evKmh).toBe(180);
});

it('keeps a legacy null-receipt save independent of a foreign failed receipt job', async () => {
  const { flushBattedBallReceipts } = await import('../engine/battedBallReceipts');
  const foreign = createBattedBallReceiptRun({ saveId: 'foreign', runId: 'foreign-gap' });
  const receipt = await foreign.seal({ version: 1, runId: 'foreign-gap', chunkCount: 1, recordCount: 1, eventCount: 1 });
  foreign.adopt();
  expect(await flushBattedBallReceipts(receipt)).toMatchObject({ ok: false });
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => gs.applyProgressCandidate({ ...game(), battedBallReceipt: null }));
  let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result).toMatchObject({ ok: true, archive: { ok: true } });
  expect((await loadGame()).battedBallReceipt).toBeNull();
  expect(await flushBattedBallReceipts(receipt)).toMatchObject({ ok: false });
});
