import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { gameStateReducer, G } from './gameStateReducer';
import { useGameState } from './useGameState';
import { reduceEconomyCommand } from '../engine/contractEconomy';
import { economyFixture, renewalEnvelope, freezeEconomy } from '../engine/__tests__/fixtures/economyWorld';

it('adopts teams, market, plan, mail and engine in exactly one guarded reducer action', () => {
  const before = economyFixture(), result = reduceEconomyCommand(before, renewalEnvelope(before));
  expect(result.ok, result.error).toBe(true);
  const world = { ...result.world, faPool: [], mailbox: [{ id: 'mail', text: '確定' }], news: [{ id: 'news' }], faYears: { free: 2026 } };
  const action = { type: G.APPLY_ECONOMY_WORLD, world, expected: { saveId: before.saveId, epoch: before.contractEconomy.epoch, baseRevision: 0 } };
  const next = gameStateReducer(freezeEconomy(before), action);
  expect(next.contractEconomy.revision).toBe(1); expect(next.faPool).toEqual([]); expect(next.mailbox).toEqual(world.mailbox);
  expect(next.news).toEqual(world.news); expect(next.faYears).toEqual({ free: 2026 }); expect(next.teams).toBe(world.teams);
  expect(gameStateReducer(next, action)).toBe(next);
  for (const expected of [{ ...action.expected, saveId: 'other' }, { ...action.expected, epoch: 'old' }, { ...action.expected, baseRevision: 1 }]) {
    expect(gameStateReducer(before, { ...action, expected })).toBe(before);
  }
});
it('refuses legacy partial writes and annual downgrades on an annual world', () => {
  const world = freezeEconomy(economyFixture());
  for (const action of [{ type: G.SET_TEAMS, teams: [] }, { type: G.UPD_TEAM, id: 0, fn: () => ({}) },
    { type: G.SET_YEAR, year: 2027 }, { type: G.SET_GAME_DAY, day: 2 },
    { type: G.SET_FA_POOL, value: [] }, { type: G.SET_OFFSEASON_PLAN, value: {} },
    { type: G.APPLY_PROGRESS, candidate: { teams: [], contractEconomy: { schemaVersion: 1, mode: 'legacy' } } }]) {
    expect(gameStateReducer(world, action)).toBe(world);
  }
});

let gs, view;
beforeEach(() => {
  const rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, v), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory());
});
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.unstubAllGlobals(); });
it('keeps legacy setters and one progress snapshot coherent across reducer-owned fields', async () => {
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => gs.setIsAutoSaveSuspended(true));
  const team = { id: 0, name: '球団', players: [], farm: [] };
  act(() => {
    gs.setTeams([team]); gs.setFaPool([{ id: 'a' }]); gs.setFaPool(p => [...p, { id: 'b' }]);
    gs.setFaYears({ a: 2026 }); gs.setOffseasonPlan({ year: 2026, marker: 'old' });
  });
  expect(gs.faPool).toEqual([{ id: 'a' }, { id: 'b' }]); expect(gs.faYears).toEqual({ a: 2026 });
  act(() => gs.applyProgressCandidate({ teams: [team], year: 2026, gameDay: 1, faPool: [{ id: 'new' }],
    faYears: { new: 2026 }, offseasonPlan: { year: 2026, marker: 'new' }, mailbox: [{ id: 'mail' }], news: [{ id: 'notice' }] }));
  expect(gs.faPool).toEqual([{ id: 'new' }]); expect(gs.faYears).toEqual({ new: 2026 });
  expect(gs.offseasonPlan.marker).toBe('new'); expect(gs.mailbox).toEqual([{ id: 'mail' }]); expect(gs.news).toEqual([{ id: 'notice' }]);
  const token = gs.getProgressToken();
  act(() => { expect(gs.applyProgressCandidate(economyFixture())).toBe(false); });
  expect(gs.getProgressToken()).toBe(token); expect(gs.contractEconomy).toBeUndefined();
});
