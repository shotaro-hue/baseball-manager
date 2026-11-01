import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import { saveGame, loadGame } from '../engine/saveload';
import { renewalFixture } from '../engine/__tests__/fixtures/renewalWorld';
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
async function setup(world = renewalFixture()) {
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

it('publishes formal human offers and replacement/cancellation through the real hook and storage', async () => {
  await setup();
  const offered = await run(() => os.handleContractOffer(0, 12000, 3));
  expect(offered).toMatchObject({ ok: true, committed: { revision: 1 } });
  const first = gs.contractEconomy.decisions[0].proposalId;
  expect(gs.myTeam.players[0].salary).toBe(10000);
  expect((await loadGame()).contractEconomy).toEqual(gs.contractEconomy);
  expect(await run(() => os.handleContractOffer(0, 13000, 3, { replaceProposalId: first }))).toMatchObject({ ok: true });
  expect(gs.contractEconomy.decisions.map(d => d.status)).toEqual(['replaced', 'pending']);
  const second = gs.contractEconomy.decisions[1].proposalId;
  expect(await run(() => os.handleCancelRenewal(second))).toMatchObject({ ok: true });
  expect((await loadGame()).contractEconomy.engine.spending.reservations).toHaveLength(0);
  expect(gs.myTeam.players[0].salary).toBe(10000);
});

it('keeps the root and world unchanged on write failure and retries one stable offer', async () => {
  await setup(); const oldRoot = storage.get(primary), before = structuredClone(gs.contractEconomy);
  const write = localStorage.setItem;
  localStorage.setItem = (key, value) => { if (key === primary) throw new Error('quota'); write(key, value); };
  expect(await run(() => os.handleContractOffer(0, 12000, 3))).toMatchObject({ ok: false });
  expect(gs.contractEconomy).toEqual(before); expect(storage.get(primary)).toBe(oldRoot);
  localStorage.setItem = write;
  expect(await run(() => os.handleContractOffer(0, 12000, 3))).toMatchObject({ ok: true });
  expect(gs.contractEconomy.engine.transactions).toHaveLength(1);
  expect((await loadGame()).contractEconomy.engine.spending.reservations).toHaveLength(1);
});

it('rejects duplicate in-flight clicks and replays a successful older callback without another reservation', async () => {
  await setup(); const callback = os.handleContractOffer; let duplicate;
  const result = await run(() => { const first = callback(0, 12000, 3); duplicate = callback(0, 12000, 3); return first; });
  expect(result.ok).toBe(true); expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(await run(() => callback(0, 12000, 3))).toMatchObject({ ok: true, replayed: true });
  expect(gs.contractEconomy.engine.spending.reservations).toHaveLength(1);
});

it('rejects a callback captured before rehydrating the same save into a new session', async () => {
  await setup(); const callback = os.handleContractOffer;
  const world = await loadGame();
  act(() => expect(gs.hydrateSavedWorld(world, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => callback(0, 12000, 3))).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
  expect(gs.contractEconomy.revision).toBe(0);
});

it('recovers an interrupted adoption acknowledgement without writing or offering twice', async () => {
  await setup();
  const read = localStorage.getItem;
  let interrupted = false;
  localStorage.getItem = key => {
    if (key === primary && gs.contractEconomy?.revision === 1 && !interrupted) {
      interrupted = true; throw new Error('acknowledgement interrupted');
    }
    return read(key);
  };
  expect(await run(() => os.handleContractOffer(0, 12000, 3))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  localStorage.getItem = read;
  const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => storage.get(k));
  const published = roots();
  expect(await run(() => gs.recoverEconomyCommand())).toMatchObject({ ok: true });
  expect(roots()).toEqual(published);
  expect(gs.contractEconomy.decisions).toHaveLength(1);
  expect(gs.contractEconomy.engine.transactions).toHaveLength(1);
  expect((await loadGame()).contractEconomy).toEqual(gs.contractEconomy);
});

it('resolves a due saved decision without a mail, persists next-year salary, and never uses the legacy reply effect', async () => {
  const w = renewalFixture();
  const held = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 12000, years: 3 })).world;
  held.contractEconomy.clock.date = '2026-07-18'; held.schedule[1].date.day = 18; held.mailbox = [];
  await setup(held);
  expect(await run(() => os.handleResolveRenewals())).toMatchObject({ ok: true });
  expect(gs.myTeam.players[0].salary).toBe(10000);
  expect(gs.contractEconomy.decisions[0].status).toBe('accepted');
  expect((await loadGame()).contractEconomy.engine.spending.ledger.records).toHaveLength(3);
  expect(await run(() => os.handleResolveRenewals())).toMatchObject({ ok: true, replayed: true });
});

it('blocks old direct agreement and phase completion in annual mode', async () => {
  await setup(); const before = structuredClone(gs.teams);
  act(() => { expect(os.handleContractRenewalSign(0, 12000, 3, 0, 0)).toBe(false);
    expect(os.handleContractRenewalPhaseNext([])).toBe(false); });
  expect(gs.teams).toEqual(before); expect(gs.screen).toBe('title');
});

it.each([
  ['season', 420, 'rejected'], ['season', 12000, 'accepted'],
  ['offseason', 420, 'rejected'], ['offseason', 12000, 'accepted'],
])('cannot evade a saved %s %s reply through write failure, cancellation or replacement', async (phase, salary, status) => {
  const w = renewalFixture({ phase, date: phase === 'season' ? '2026-07-16' : '2026-12-01' });
  w.teams[0].players[0].personality = { money: 0, winning: 100, playing: 0, hometown: 0, loyalty: 0, stability: 0, future: 0 };
  const offered = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary, years: 3 }));
  expect(offered.ok).toBe(true);
  const held = offered.world;
  if (phase === 'season') { held.contractEconomy.clock.date = '2026-07-18'; held.schedule[1].date.day = 18; }
  else held.contractEconomy.clock.offseasonTurn = 2;
  await setup(held);
  const oldRoot = storage.get(primary), before = structuredClone(gs.contractEconomy), proposalId = before.decisions[0].proposalId;
  const write = localStorage.setItem;
  localStorage.setItem = (key, value) => { if (key === primary) throw new Error('quota'); write(key, value); };
  expect(await run(() => os.handleResolveRenewals())).toMatchObject({ ok: false });
  expect(gs.contractEconomy).toEqual(before); expect(storage.get(primary)).toBe(oldRoot);
  localStorage.setItem = write;
  expect(await run(() => os.handleCancelRenewal(proposalId))).toMatchObject({ ok: false, reason: 'economy_command_invalid' });
  expect(await run(() => os.handleContractOffer(0, 14000, 3, { replaceProposalId: proposalId }))).toMatchObject({ ok: false, reason: 'economy_command_invalid' });
  expect(storage.get(primary)).toBe(oldRoot);
  const reloaded = await loadGame();
  act(() => expect(gs.hydrateSavedWorld(reloaded, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => os.handleResolveRenewals())).toMatchObject({ ok: true });
  expect(await run(() => os.handleResolveRenewals())).toMatchObject({ ok: true, replayed: true });
  const saved = await loadGame();
  expect(saved.contractEconomy.decisions[0].status).toBe(status);
  expect(saved.contractEconomy.engine.transactions).toHaveLength(2);
  expect(saved.contractEconomy.engine.spending.reservations).toHaveLength(0);
  expect(saved.teams[0].players[0].salary).toBe(10000);
});
