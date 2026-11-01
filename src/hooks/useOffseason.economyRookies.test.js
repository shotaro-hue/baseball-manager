import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';
import { saveGame, loadGame } from '../engine/saveload';
import { quoteAnnualSpendingPlan } from '../engine/annualSpending';
import { toAnnualState } from '../engine/contractEconomy';
import { rookieFixture } from '../engine/__tests__/fixtures/rookieWorld';

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
function oldRookieFixture() {
  const w = rookieFixture(); w.offseasonPlan.draftResult.pool[0].salary = 240; return w;
}
async function setup(world = oldRookieFixture()) {
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  function Harness() { gs = useGameState(); os = useOffseason(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => expect(gs.hydrateSavedWorld(world, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  act(() => gs.setScreen('draft_review'));
}
async function run(operation) {
  let result, done = false, task;
  act(() => { task = Promise.resolve(operation()).then(r => { done = true; result = r; }); });
  for (let i = 0; i < 150 && !done; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await task; await act(async () => {}); return result;
}

it('reserves, declines and reloads through real hooks without stale local draft results', async () => {
  await setup();
  // Reproduce the transient result which the existing draft screen writes.
  act(() => os.setDraftResult(gs.offseasonPlan.draftResult));
  await act(async () => {});
  const callback = os.handleReserveRookie; let duplicate;
  expect(await run(() => { const r = callback('rookie'); duplicate = callback('rookie'); return r; })).toMatchObject({ ok: true });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(await run(() => callback('rookie'))).toMatchObject({ ok: true, replayed: true });
  expect(await run(() => os.handleReserveRookie('development'))).toMatchObject({ ok: true });
  expect(await run(() => os.handleDeclineRookie('rookie'))).toMatchObject({ ok: true });
  expect(os.draftResult.drafted.rookie).toBe('refused');
  expect(gs.myTeam.farm).toEqual([]);
  const saved = await loadGame();
  expect(saved.offseasonPlan.draftResult.drafted.rookie).toBe('refused');
  expect(saved.contractEconomy.engine.spending.reservations).toHaveLength(1);
  act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(saved, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => callback('rookie'))).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
});

it.each(['reserve', 'decline'])('keeps old root/world after failed %s and retries once', async type => {
  await setup(); if (type === 'decline') expect(await run(() => os.handleReserveRookie('rookie'))).toMatchObject({ ok: true });
  const root = storage.get(primary), before = structuredClone(gs.contractEconomy), plan = structuredClone(gs.offseasonPlan);
  const write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('quota'); write(k, v); };
  const op = () => type === 'reserve' ? os.handleReserveRookie('rookie') : os.handleDeclineRookie('rookie');
  expect(await run(op)).toMatchObject({ ok: false });
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(before); expect(gs.offseasonPlan).toEqual(plan);
  localStorage.setItem = write;
  expect(await run(op)).toMatchObject({ ok: true });
  expect(gs.contractEconomy.engine.transactions).toHaveLength(type === 'reserve' ? 1 : 2);
});

it('recovers a published rookie acknowledgement with no duplicate reservation', async () => {
  await setup(); const read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = key => {
    if (key === primary && gs.contractEconomy?.revision === 1 && !interrupted) { interrupted = true; throw Error('ack'); }
    return read(key);
  };
  expect(await run(() => os.handleReserveRookie('rookie'))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  localStorage.getItem = read; const root = storage.get(primary);
  expect(await run(() => gs.recoverEconomyCommand())).toMatchObject({ ok: true });
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy.engine.transactions).toHaveLength(1);
});

it('blocks annual immediate draft joining and manual spring/year advance', async () => {
  await setup(); const before = structuredClone(gs.teams);
  expect(await run(() => os.handleDraftComplete(gs.offseasonPlan.draftResult.pool, gs.offseasonPlan.draftResult.drafted))).toBe(false);
  expect(await run(() => os.handleSpringTrainingComplete())).toBe(false);
  expect(await run(() => os.handleNextYear())).toBe(false);
  expect(gs.teams).toEqual(before); expect(gs.year).toBe(2026); expect(gs.offseasonPlan.draftApplied).not.toBe(true);
});

it('rejects a retained legacy draft callback after annual hydration', async () => {
  const legacy = rookieFixture(); delete legacy.contractEconomy;
  await setup(legacy); const callback = os.handleDraftComplete;
  const annual = rookieFixture();
  act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(annual, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  act(() => gs.setScreen('draft_review'));
  expect(await run(() => callback(annual.offseasonPlan.draftResult.pool, annual.offseasonPlan.draftResult.drafted))).toBe(false);
  expect(gs.myTeam.farm).toEqual([]); expect(gs.offseasonPlan.draftApplied).not.toBe(true);
});


it.each([['rookie', 240, 420], ['rookie', 600, 600], ['development', 240, 240]])(
  'persists and reloads the exact reviewed %s salary %s through real hooks', async (id, rawSalary, salary) => {
    const w = rookieFixture(); w.offseasonPlan.draftResult.pool.find(p => p.id === id).salary = rawSalary;
    await setup(w);
    expect((await loadGame()).offseasonPlan.draftResult.pool.find(p => p.id === id).salary).toBe(rawSalary);
    const row = world => quoteAnnualSpendingPlan(toAnnualState(world).spending).find(r => r.teamId === 0 && r.season === 2027);
    const beforeReserved = row(w).reservedManYen;
    expect(await run(() => os.handleReserveRookie(id))).toMatchObject({ ok: true });
    const saved = await loadGame(), contract = saved.contractEconomy.engine.spending.reservations[0].proposal.contract;
    expect(contract).toMatchObject({ annualSalaryManYen: salary, termYears: 1, guaranteed: true });
    expect(saved.offseasonPlan.draftResult.pool.find(p => p.id === id).salary).toBe(salary);
    expect(JSON.parse(saved.contractEconomy.engine.transactions[0].signature).proposal.contract).toEqual(contract);
    expect(row(saved).reservedManYen - beforeReserved).toBe(salary);
    act(() => gs.setScreen('title'));
    act(() => expect(gs.hydrateSavedWorld(saved, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
    expect(gs.contractEconomy.engine.spending.reservations[0].proposal.contract).toEqual(contract);
  });
