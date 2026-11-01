import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import { saveGame, loadGame } from '../engine/saveload';
import { acquisitionFixture } from '../engine/__tests__/fixtures/acquisitionWorld';
import { acquisitionRequest, reduceAcquisitionRequest } from '../engine/acquisitionDecisions';
import { renewalRequest, reduceRenewalRequest } from '../engine/renewalDecisions';

let gs, os, view, storage;
const primary = 'baseball_manager_v1';
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function setup(world = acquisitionFixture()) {
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  function Harness() { gs = useGameState(); os = useOffseason(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => expect(gs.hydrateSavedWorld(world, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
}
async function run(operation) {
  let result, done = false, task;
  act(() => { task = Promise.resolve(operation()).then(r => { done = true; result = r; }); });
  for (let i = 0; i < 150 && !done; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await task; await act(async () => {}); return result;
}

it('publishes, replaces and cancels formal market offers with stable replay and stale-session protection', async () => {
  await setup(); const callback = os.handleAcquisitionOffer;
  let duplicate;
  expect(await run(() => { const first = callback('free', 10000, 3); duplicate = callback('free', 10000, 3); return first; })).toMatchObject({ ok: true });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(await run(() => callback('free', 10000, 3))).toMatchObject({ ok: true, replayed: true });
  const id = gs.contractEconomy.decisions[0].proposalId;
  expect(await run(() => os.handleAcquisitionOffer('free', 12000, 3, { replaceProposalId: id }))).toMatchObject({ ok: true });
  expect(gs.contractEconomy.decisions.map(d => d.status)).toEqual(['replaced', 'pending']);
  expect(await run(() => os.handleCancelAcquisition(gs.contractEconomy.decisions[1].proposalId))).toMatchObject({ ok: true });
  const loaded = await loadGame();
  expect(loaded.contractEconomy.engine.spending.reservations).toHaveLength(0);
  act(() => expect(gs.hydrateSavedWorld(loaded, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => callback('free', 10000, 3))).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
});

it('keeps the old root/world on failed offer writes and retries once', async () => {
  await setup(); const root = storage.get(primary), before = structuredClone(gs.contractEconomy);
  const write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('quota'); write(k, v); };
  expect(await run(() => os.handleAcquisitionOffer('free', 10000, 3))).toMatchObject({ ok: false });
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(before);
  localStorage.setItem = write;
  expect(await run(() => os.handleAcquisitionOffer('free', 10000, 3))).toMatchObject({ ok: true });
  expect(gs.contractEconomy.engine.transactions).toHaveLength(1);
});

it.each(['accepted', 'rejected', 'expired'])('persists %s replies after failed save and cold reload without deadline evasion', async status => {
  const w = acquisitionFixture();
  const h = reduceAcquisitionRequest(w, acquisitionRequest(w, { type: 'offer', playerId: 'free', salary: status === 'rejected' ? 420 : 10000, years: 3 })).world;
  h.contractEconomy.clock.date = status === 'expired' ? '2026-08-01' : '2026-07-20';
  h.schedule[1].date = status === 'expired' ? { month: 8, day: 1 } : { month: 7, day: 20 }; h.mailbox = [];
  await setup(h); const root = storage.get(primary), before = structuredClone(gs.contractEconomy), id = before.decisions[0].proposalId;
  const write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('quota'); write(k, v); };
  expect(await run(() => os.handleResolveEconomyDecisions())).toMatchObject({ ok: false });
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(before);
  localStorage.setItem = write;
  expect(await run(() => os.handleCancelAcquisition(id))).toMatchObject({ ok: false });
  expect(await run(() => os.handleAcquisitionOffer('free', 12000, 3, { replaceProposalId: id }))).toMatchObject({ ok: false });
  const loaded = await loadGame();
  act(() => expect(gs.hydrateSavedWorld(loaded, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => os.handleResolveEconomyDecisions())).toMatchObject({ ok: true });
  expect(await run(() => os.handleResolveEconomyDecisions())).toMatchObject({ ok: true, replayed: true });
  expect((await loadGame()).contractEconomy.decisions[0].status).toBe(status);
  expect(gs.contractEconomy.engine.transactions).toHaveLength(2);
});

it('recovers a published acquisition acknowledgement without a second transaction or write', async () => {
  await setup(); const read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = key => {
    if (key === primary && gs.contractEconomy?.revision === 1 && !interrupted) { interrupted = true; throw Error('ack'); }
    return read(key);
  };
  expect(await run(() => os.handleAcquisitionOffer('free', 10000, 3))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  localStorage.getItem = read; const published = storage.get(primary);
  expect(await run(() => gs.recoverEconomyCommand())).toMatchObject({ ok: true });
  expect(storage.get(primary)).toBe(published); expect(gs.contractEconomy.engine.transactions).toHaveLength(1);
});

it('blocks the unconnected annual market phase advance', async () => {
  await setup(); act(() => gs.setScreen('offseason_fa_phase'));
  act(() => expect(os.handleFaPhaseNext()).toBe(false));
  expect(gs.screen).toBe('offseason_fa_phase');
});

it.each(['handleResolveEconomyDecisions', 'handleResolveRenewals'])('publishes mixed replies through %s as one revision and preserves every receipt', async handler => {
  const w = acquisitionFixture();
  const h = reduceAcquisitionRequest(w, acquisitionRequest(w, { type: 'offer', playerId: 'free', salary: 10000, years: 3 })).world;
  const mixed = reduceRenewalRequest(h, renewalRequest(h, { type: 'offer', playerId: 0, salary: 12000, years: 3 })).world;
  mixed.contractEconomy.clock.date = '2026-07-20'; mixed.schedule[1].date.day = 20;
  await setup(mixed);
  const callback = os[handler];
  expect(await run(() => callback())).toMatchObject({ ok: true, committed: { revision: 3 } });
  expect(await run(() => callback())).toMatchObject({ ok: true, replayed: true });
  const saved = await loadGame();
  expect(saved.contractEconomy.decisions.map(d => d.status)).toEqual(['accepted', 'accepted']);
  expect(saved.contractEconomy.engine.transactions).toHaveLength(4);
  expect(gs.myTeam.players[0].salary).toBe(10000);
});

