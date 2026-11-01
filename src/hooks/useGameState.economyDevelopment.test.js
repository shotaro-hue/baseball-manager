import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { saveGame, loadGame, getSaveQueueSnapshot } from '../engine/saveload';
import { quoteAnnualSpendingPlan } from '../engine/annualSpending';
import { fromAnnualState, toAnnualState } from '../engine/contractEconomy';
import { developmentFixture } from '../engine/__tests__/fixtures/developmentWorld';
import { renewalEnvelope } from '../engine/__tests__/fixtures/economyWorld';
import { FarmDevelopmentPanel } from '../components/FarmDevelopmentPanel';

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
async function setup(world = developmentFixture(), panel = false) {
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  function Harness() {
    gs = useGameState();
    return panel && gs.myTeam ? React.createElement(FarmDevelopmentPanel, { team: gs.myTeam, farmState: { year: gs.year },
      annualGs: gs, onConvertIkusei: gs.convertIkusei }) : null;
  }
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

const content = n => n == null ? '' : typeof n === 'object' ? (Array.isArray(n) ? n : n.children || []).map(content).join('') : String(n);
const button = label => view.root.findAllByType('button').find(b => content(b) === label);
const dialog = () => content(view.root.findByProps({ role: 'dialog' }));

it('refreshes the open confirmation after another saved contract and rejects its retained confirm handler', async () => {
  const world = developmentFixture(); await setup(world, true);
  act(() => button('支配下登録').props.onClick());
  const oldConfirm = button('登録を確定').props.onClick, oldText = dialog();
  const command = renewalEnvelope(world); command.transaction.proposal.contract.playerId = 'active-0';
  expect(await run(() => gs.commitEconomyCommand(command))).toMatchObject({ ok: true });
  expect(dialog()).not.toBe(oldText);
  const root = storage.get(primary), economy = structuredClone(gs.contractEconomy);
  await run(oldConfirm);
  expect(dialog()).toContain('状態が変更');
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(economy);
  expect(gs.myTeam.farm[0].isIkusei).toBe(true);
  await run(() => button('登録を確定').props.onClick());
  for (let i = 0; i < 150 && view.root.findAllByProps({ role: 'dialog' }).length; i++)
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  expect(view.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
  const saved = await loadGame();
  expect(saved.teams[0].farm[0].salary).toBe(420);
  expect(saved.contractEconomy.engine.transactions).toHaveLength(2);
  expect(quoteAnnualSpendingPlan(toAnnualState(saved).spending).find(r => r.teamId === 0 && r.season === 2027))
    .toMatchObject({ salaryManYen: 420, reservedManYen: 1600, remainingManYen: 47980 });
});

it.each(['salary', 'term', 'capacity', 'deadline', 'epoch', 'session'])('refreshes %s on hydration and prevents a stale dialog from writing', async change => {
  const world = developmentFixture({ count: change === 'capacity' ? 69 : 1 });
  await setup(world, true); act(() => button('支配下登録').props.onClick());
  const oldConfirm = button('登録を確定').props.onClick;
  let changed = change === 'capacity' ? developmentFixture({ count: 70 }) : structuredClone(world);
  const record = changed.contractEconomy.engine.spending.ledger.records.find(r => r.contract.playerId === 0);
  if (change === 'salary') record.contract.annualSalaryManYen = 600;
  if (change === 'term') { record.contract.termYears = 2; record.contract.endSeason = 2027; }
  if (change === 'deadline') {
    changed.contractEconomy.clock.date = '2026-08-01'; changed.schedule[1].date = { month: 8, day: 1 };
  }
  if (change === 'epoch') changed.contractEconomy.epoch = 'next-epoch';
  changed = fromAnnualState(changed, toAnnualState(changed));
  act(() => gs.setScreen('title'));
  act(() => expect(gs.hydrateSavedWorld(changed, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  const root = storage.get(primary), economy = structuredClone(gs.contractEconomy);
  if (change === 'salary') expect(dialog()).toContain('600万円');
  if (change === 'term') expect(dialog()).toContain('2027年度（変更なし）');
  if (['capacity', 'deadline'].includes(change)) expect(button('登録を確定').props.disabled).toBe(true);
  await run(oldConfirm);
  expect(storage.get(primary)).toBe(root); expect(gs.contractEconomy).toEqual(economy);
  expect(gs.myTeam.farm[0].isIkusei).toBe(true);
  expect(view.root.findAllByProps({ role: 'dialog' })).toHaveLength(1);
});
