import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it } from 'vitest';
import { game, PRIMARY } from '../../tests/helpers/save-01b0-storage.js';
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
