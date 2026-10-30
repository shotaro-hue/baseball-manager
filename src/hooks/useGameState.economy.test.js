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

const notificationAction = (field, value) => field === 'mailbox'
  ? { type: G.SET_MAILBOX, value } : { type: G.SET_NEWS, news: value };
const contractNotice = field => field === 'mailbox'
  ? { id: 0, type: 'contract_decision_pending', read: false, resolved: false, decision: { salary: 1600 } }
  // `season` also carries posting, FA, release and renewal news in legacy.
  : { id: 0, type: 'season', headline: '契約更改', body: '年俸1600万円で合意' };

it.each(['mailbox', 'news'])('rejects standalone contract %s additions, changes, removals and reclassification', field => {
  const before = economyFixture(); before[field] = [contractNotice(field)];
  const world = freezeEconomy(before), snapshot = JSON.stringify(world);
  const invalid = [[], [...world[field], { ...contractNotice(field), id: 'new' }],
    [{ ...contractNotice(field), body: '別条件で合意', resolved: true }],
    [{ ...contractNotice(field), type: field === 'mailbox' ? 'championship' : 'game' }],
    [...world[field], { id: 'unknown', type: 'future-contract-event' }]];
  for (const value of invalid) for (const update of [value, () => value]) {
    expect(gameStateReducer(world, notificationAction(field, update))).toBe(world);
    expect(JSON.stringify(world)).toBe(snapshot); expect(world.contractEconomy.revision).toBe(0);
  }
});

it.each(['mailbox', 'news'])('isolates a mutating %s updater before rejecting it', field => {
  const world = economyFixture(); world[field] = [contractNotice(field)];
  const snapshot = structuredClone(world);
  const next = gameStateReducer(world, notificationAction(field, rows => {
    rows[0].body = '不正な契約確定'; rows.push({ id: 'new', type: 'trade' }); return rows;
  }));
  expect(next).toBe(world); expect(world).toEqual(snapshot);
});

it.each([
  ['news', 'game'], ['news', 'allstar'], ['news', 'record'],
  ['mailbox', 'championship'], ['mailbox', 'hof'], ['mailbox', 'morale_warning'],
])('allows independent %s/%s notifications while retaining contract events and fencing stale worlds', (field, type) => {
  const before = economyFixture(); before[field] = [contractNotice(field)];
  const candidate = reduceEconomyCommand(before, renewalEnvelope(before)).world;
  const notice = { id: 'ordinary', type, body: '試合・記録のお知らせ' };
  const next = gameStateReducer(freezeEconomy(before), notificationAction(field, rows => [notice, ...rows]));
  expect(next[field]).toEqual([notice, contractNotice(field)]);
  expect(next.teams).toBe(before.teams); expect(next.contractEconomy.engine).toBe(before.contractEconomy.engine);
  expect(next.contractEconomy.revision).toBe(1);
  expect(gameStateReducer(next, { type: G.APPLY_ECONOMY_WORLD, world: candidate,
    expected: { saveId: before.saveId, epoch: before.contractEconomy.epoch, baseRevision: 0 } })).toBe(next);
});

it('allows only read metadata to change on a contract mail, including after JSON reload', () => {
  const before = economyFixture(); before.mailbox = [contractNotice('mailbox')];
  const world = freezeEconomy(JSON.parse(JSON.stringify(before)));
  const next = gameStateReducer(world, notificationAction('mailbox', rows => rows.map(m => ({ ...m, read: true }))));
  expect(next.mailbox).toEqual([{ ...contractNotice('mailbox'), read: true }]);
  expect(next.contractEconomy.engine).toBe(world.contractEconomy.engine);
  expect(next.contractEconomy.revision).toBe(1);
  expect(gameStateReducer(next, notificationAction('mailbox', next.mailbox))).toBe(next);
  expect(gameStateReducer(next, notificationAction('mailbox', rows => rows.map(m => ({ ...m, resolved: true }))))).toBe(next);
});

it.each(['mailbox', 'news'])('rejects malformed %s writes, unknown modes and revision overflow without changing the world', field => {
  const before = economyFixture(); before[field] = [contractNotice(field)];
  const world = freezeEconomy(before);
  for (const value of [null, {}, [null], [contractNotice(field), contractNotice(field)],
    () => { throw new Error('failed updater'); }]) {
    expect(gameStateReducer(world, notificationAction(field, value))).toBe(world);
  }
  for (const contractEconomy of [{ mode: 'future' }, { ...world.contractEconomy, revision: Number.MAX_SAFE_INTEGER }]) {
    const invalid = freezeEconomy({ ...world, contractEconomy });
    expect(gameStateReducer(invalid, notificationAction(field, rows => [{ id: 'new', type: field === 'news' ? 'game' : 'hof' }, ...rows]))).toBe(invalid);
  }
});

it('adopts accepted terms and their mail/news together through the world action after reload', () => {
  const before = economyFixture(), command = renewalEnvelope(before);
  const offered = reduceEconomyCommand(before, command).world;
  const result = reduceEconomyCommand(offered, { ...command, baseRevision: 1,
    transaction: { id: 'answer', type: 'accept-renewal', proposalId: 'renewal', contractId: command.transaction.contractId } });
  expect(result.ok, result.error).toBe(true);
  const world = { ...result.world, mailbox: [{ id: 'signed', type: 'contract_reply', resolution: 'signed' }],
    news: [{ id: 'signed-news', type: 'season', headline: '契約更改' }] };
  const next = gameStateReducer(freezeEconomy(JSON.parse(JSON.stringify(offered))), {
    type: G.APPLY_ECONOMY_WORLD, world,
    expected: { saveId: before.saveId, epoch: before.contractEconomy.epoch, baseRevision: 1 },
  });
  expect(next.mailbox).toEqual(world.mailbox); expect(next.news).toEqual(world.news);
  expect(next.contractEconomy.revision).toBe(2);
  expect(next.contractEconomy.engine.spending.ledger.records).toEqual(expect.arrayContaining([
    expect.objectContaining({ contract: expect.objectContaining({ contractId: 'next-0', annualSalaryManYen: 1600 }) }),
  ]));
});

it.each(['mailbox', 'news'])('retains legacy %s setters for implicit and explicit legacy saves', field => {
  for (const contractEconomy of [undefined, { schemaVersion: 1, mode: 'legacy' }]) {
    const before = { [field]: [], contractEconomy };
    const first = gameStateReducer(before, notificationAction(field, [contractNotice(field)]));
    const next = gameStateReducer(first, notificationAction(field, rows => [...rows, { id: 'other', type: 'trade' }]));
    expect(next[field]).toEqual([contractNotice(field), { id: 'other', type: 'trade' }]);
    expect(next.contractEconomy).toBe(contractEconomy);
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
