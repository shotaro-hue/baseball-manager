import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { saveGame, loadGame } from '../engine/saveload';
import { economyFixture } from '../engine/__tests__/fixtures/economyWorld';

let gs, view, rows;
beforeEach(() => {
  rows = new Map();
  vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
});
afterEach(() => {
  if (view) act(() => view.unmount()); view = null;
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
async function setup(mode, records = 'present') {
  const w = economyFixture();
  if (mode === 'legacy') delete w.contractEconomy;
  const t = w.teams[0];
  t.players[0]._scoutRegionFactor = 0.8;
  t.players[0].stats = { AB: 42, H: 12, HR: 3 };
  t.players[0].injury = '肩の張り'; t.players[0].injuryDaysLeft = 4;
  t.scoutResults = [{ ...structuredClone(t.players[0]), id: 'old-report', name: '旧報告', salary: 500 }];
  t.scoutMissions = [{ id: 'pending', name: '国内独立リーグ', weeksLeft: 2, cost: 3000, qMin: 40, qMax: 60 }];
  if (records === 'empty') { t.scoutResults = []; t.scoutMissions = []; }
  if (records === 'missing') { delete t.scoutResults; delete t.scoutMissions; }
  expect((await saveGame(w, { skipCompression: true })).ok).toBe(true);
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  const saved = await loadGame();
  act(() => expect(gs.hydrateSavedWorld(saved, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() })).toBe(true));
  return saved;
}
const state = () => ({ teams: gs.teams, faPool: gs.faPool, draftPool: gs.draftPool,
  offseasonPlan: gs.offseasonPlan, economy: gs.contractEconomy, dirty: gs.saveDirty,
  token: gs.getProgressToken(), mailbox: gs.mailbox, news: gs.news });

it.each(['legacy', 'annual'])('%s rejects dispatch and signing, including retained callbacks, with no state, timer or save effects', async mode => {
  await setup(mode);
  const send = gs.sendScout, sign = gs.signPlayer;
  const before = structuredClone(state()), stored = [...rows];
  vi.useFakeTimers();
  const timers = vi.getTimerCount();
  let results;
  act(() => { results = [send({ name: '関東', cost: 100, weeks: 1, qMin: 40, qMax: 60 }), sign(0)]; });
  expect(results).toEqual([false, false]);
  act(() => { expect(send(null)).toBe(false); expect(sign(-1)).toBe(false); });
  expect(vi.getTimerCount()).toBe(timers);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(state()).toEqual(before); expect([...rows]).toEqual(stored);
  expect(gs.notif).toBeNull();
  vi.useRealTimers();
  // A callback retained from a previous render must remain inert after a new world is loaded.
  const saved = await loadGame();
  act(() => gs.hydrateSavedWorld(saved, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() }));
  const afterLoad = structuredClone(state());
  act(() => { expect(send({ cost: 1 })).toBe(false); expect(sign(0)).toBe(false); });
  expect(state()).toEqual(afterLoad);
});

it.each(['legacy', 'annual'])('%s preserves reports, pending missions and acquired players through repeated normal save/reload', async mode => {
  await setup(mode);
  const before = structuredClone({ teams: gs.teams, economy: gs.contractEconomy, faPool: gs.faPool });
  for (let i = 0; i < 2; i++) {
    let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
    expect(result.ok).toBe(true);
    const loaded = await loadGame();
    act(() => gs.hydrateSavedWorld(loaded, { progressToken: gs.getProgressToken(), sessionToken: gs.getProgressSessionToken() }));
    expect({ teams: gs.teams, economy: gs.contractEconomy, faPool: gs.faPool }).toEqual(before);
    expect(gs.saveDirty).toBe(false); expect(gs.notif).toBeNull();
  }
});

it.each(['missing', 'empty'])('loads and saves %s old scouting data without filling it', async records => {
  await setup('legacy', records);
  const before = structuredClone(gs.teams);
  await act(async () => { expect((await gs.handleSave({ silent: true })).ok).toBe(true); });
  expect((await loadGame()).teams).toEqual(before);
});

it('failed normal save preserves the prior primary and backup with old records', async () => {
  await setup('legacy');
  await act(async () => { expect((await gs.handleSave({ silent: true })).ok).toBe(true); });
  const before = [...rows], setter = localStorage.setItem;
  const teams = structuredClone(gs.teams);
  act(() => gs.setGameDay(gs.gameDay + 1));
  const dirty = gs.saveDirty;
  act(() => { expect(gs.sendScout({ cost: 1 })).toBe(false); expect(gs.signPlayer(0)).toBe(false); });
  expect(gs.saveDirty).toBe(dirty);
  localStorage.setItem = (key, value) => {
    if (key === 'baseball_manager_v1') throw Error('blocked save');
    setter(key, value);
  };
  let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result.ok).toBe(false); expect([...rows]).toEqual(before);
  expect(gs.teams).toEqual(teams); expect(gs.saveDirty).toBe(true);
});
