import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { saveGame, loadGame, getSaveQueueSnapshot } from '../engine/saveload';
import { quoteAnnualSpendingPlan } from '../engine/annualSpending';
import { toAnnualState } from '../engine/contractEconomy';
import { developmentFixture } from '../engine/__tests__/fixtures/developmentWorld';

let gs, view, storage;
const primary = 'baseball_manager_v1';
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: k => storage.get(k) ?? null,
    setItem: (k, v) => storage.set(k, String(v)), removeItem: k => storage.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(async () => {
  if (view) act(() => view.unmount()); view = null;
  for (let i = 0; i < 150 && getSaveQueueSnapshot().isSaving; i++) await new Promise(r => setTimeout(r, 10));
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function setup(world = developmentFixture()) {
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => expect(gs.hydrateSavedWorld(world, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  act(() => gs.setScreen('hub'));
}
async function run(operation) {
  let result, done = false, task;
  act(() => { task = Promise.resolve(operation()).then(r => { done = true; result = r; }); });
  for (let i = 0; i < 150 && !done; i++) await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  await task; await act(async () => {}); return result;
}

it('converts ID zero, preserves the term, saves once and replays a retained callback after adoption', async () => {
  await setup(); const callback = gs.convertIkusei; let duplicate;
  expect(await run(() => { const r = callback(0); duplicate = callback(0); return r; })).toMatchObject({ ok: true });
  expect(await duplicate).toMatchObject({ ok: false, reason: 'economy_commit_pending' });
  expect(await run(() => callback(0))).toMatchObject({ ok: true, replayed: true });
  const saved = await loadGame();
  expect(saved.teams[0].farm[0]).toMatchObject({ salary: 420, isIkusei: false, 育成: false, contractYearsLeft: 3 });
  expect(saved.teams[0].players).toHaveLength(1);
  expect(saved.contractEconomy.engine.transactions).toHaveLength(1);
  const rows = quoteAnnualSpendingPlan(toAnnualState(saved).spending).filter(r => r.teamId === 0);
  expect(rows.slice(0, 3).map(r => r.salaryManYen)).toEqual([1322, 420, 420]);
  act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(saved, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => callback(0))).toMatchObject({ ok: false, reason: 'economy_session_conflict' });
});

it('keeps root and world on failed conversion and retries with one ledger change', async () => {
  await setup(); const root = storage.get(primary), before = structuredClone(gs.teams), economy = structuredClone(gs.contractEconomy);
  const write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('quota'); write(k, v); };
  expect(await run(() => gs.convertIkusei(0))).toMatchObject({ ok: false });
  expect(storage.get(primary)).toBe(root); expect(gs.teams).toEqual(before); expect(gs.contractEconomy).toEqual(economy);
  localStorage.setItem = write;
  expect(await run(() => gs.convertIkusei(0))).toMatchObject({ ok: true });
  expect((await loadGame()).contractEconomy.engine.transactions).toHaveLength(1);
});

it('recovers published conversion without a duplicate payroll change', async () => {
  await setup(); const read = localStorage.getItem; let interrupted = false;
  localStorage.getItem = key => {
    if (key === primary && gs.contractEconomy?.revision === 1 && !interrupted) { interrupted = true; throw Error('ack'); }
    return read(key);
  };
  expect(await run(() => gs.convertIkusei(0))).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  localStorage.getItem = read; const root = storage.get(primary);
  expect(await run(() => gs.recoverEconomyCommand())).toMatchObject({ ok: true });
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy.engine.transactions).toHaveLength(1);
});

it('rejects a retained legacy callback after annual hydration', async () => {
  const legacy = developmentFixture(); delete legacy.contractEconomy;
  await setup(legacy); const callback = gs.convertIkusei;
  const annual = developmentFixture(); act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(annual, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  expect(await run(() => callback(0))).toMatchObject({ ok: false });
  expect(gs.myTeam.farm[0].isIkusei).toBe(true);
});

it.each([{ count: 70 }, { date: '2026-08-01' }])('rejects a blocked annual conversion without changing root/world: %j', async options => {
  await setup(developmentFixture(options)); const root = storage.get(primary), before = structuredClone(gs.teams);
  expect(await run(() => gs.convertIkusei(0))).toMatchObject({ ok: false });
  expect(storage.get(primary)).toBe(root); expect(gs.teams).toEqual(before);
});
