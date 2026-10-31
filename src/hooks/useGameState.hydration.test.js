import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { saveGame, loadGame } from '../engine/saveload';
import { economyFixture, renewalEnvelope } from '../engine/__tests__/fixtures/economyWorld';
import { prepareEconomyMigration } from '../engine/economyMigration';
import { economyPolicy } from '../engine/__tests__/fixtures/economyWorld';
import { fromAnnualState, toAnnualState } from '../engine/contractEconomy';
import { reduceEconomyCommand } from '../engine/contractEconomy';

let gs, view, rows, renders;
const primary = 'baseball_manager_v1';
const freshStorage = () => vi.stubGlobal('localStorage', {
  getItem: k => rows.get(k) ?? null, setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k),
});
beforeEach(() => { rows = new Map(); renders = []; freshStorage(); vi.stubGlobal('indexedDB', new IDBFactory()); });
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function setup() {
  function Harness() { gs = useGameState(); renders.push({ teams: gs.teams, saveId: gs.saveId, economy: gs.contractEconomy, mailbox: gs.mailbox }); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  expect(gs.hydrateSavedWorld).toBeTypeOf('function');
}
const tokens = () => ({ sessionToken: gs.getProgressSessionToken(), progressToken: gs.getProgressToken() });
const hydrate = world => { let result; act(() => { result = gs.hydrateSavedWorld(world, tokens()); }); return result; };

it.each(['inline', 'large', 'backup'])('hydrates a %s root atomically and resaves the exact annual engine', async route => {
  const before = economyFixture();
  const offered = reduceEconomyCommand(before, renewalEnvelope(before)).world;
  offered.mailbox = [{ id: 'pending', type: 'contract_decision_pending', read: false }];
  offered.seasonHistory = { transfers: [{ id: 'kept' }] };
  if (route === 'large') offered.padding = 'large'.repeat(20000);
  expect((await saveGame(offered, { skipCompression: true })).ok).toBe(true);
  if (route === 'backup') { rows.set(primary + '_bk1', rows.get(primary)); rows.set(primary, 'broken'); }
  freshStorage();
  const loaded = await loadGame();
  await setup();
  const start = renders.length;
  expect(hydrate(loaded)).toBe(true);
  for (const state of renders.slice(start)) {
    expect(state.saveId).toBe('test-save'); expect(state.economy).toEqual(offered.contractEconomy);
    expect(state.teams[0].players[0].contractId).toBe(offered.teams[0].players[0].contractId);
    expect(state.mailbox).toEqual(offered.mailbox);
  }
  expect(gs.seasonHistory.transfers).toEqual([{ id: 'kept' }]);
  expect(gs.saveDirty).toBe(false);
  loaded.contractEconomy.randomRoot.seed = 'caller mutation';
  loaded.teams[0].players[0].salary = 999;
  expect(gs.contractEconomy.randomRoot.seed).toBe('test-seed');
  let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result.ok, result.reason).toBe(true);
  freshStorage(); const resaved = await loadGame();
  expect(resaved.contractEconomy).toEqual(offered.contractEconomy);
  expect(resaved.mailbox).toEqual(offered.mailbox);
});

it('rejects stale, incomplete and malformed hydration without clearing dirty state or changing session', async () => {
  await setup(); act(() => gs.setMyId(0));
  const stale = tokens(); act(() => gs.setGameDay(2));
  expect(gs.saveDirty).toBe(true);
  const session = gs.getProgressSessionToken();
  act(() => expect(gs.hydrateSavedWorld(economyFixture(), stale)).toBe(false));
  for (const mutate of [w => { w.contractEconomy.randomRoot = null; }, w => { w.teams[0].budget++; },
    w => { w.farmCompetitionVersion = 1; }, w => { w.battedBallReceipt = {}; }, w => { delete w.mailbox; }]) {
    const world = economyFixture(); mutate(world);
    expect(hydrate(world)).toBe(false);
  }
  expect(gs.contractEconomy).toBeUndefined(); expect(gs.gameDay).toBe(2);
  expect(gs.saveDirty).toBe(true); expect(gs.getProgressSessionToken()).toBe(session);
});

it('invalidates old load tokens and does not carry annual fields into a different legacy save', async () => {
  await setup(); const oldTokens = tokens();
  expect(hydrate(economyFixture())).toBe(true);
  act(() => expect(gs.hydrateSavedWorld(economyFixture(), oldTokens)).toBe(false));
  const legacy = { ...economyFixture(), saveId: 'legacy-other' }; delete legacy.contractEconomy;
  expect(hydrate(legacy)).toBe(true);
  expect(gs.contractEconomy).toBeUndefined(); expect(gs.saveId).toBe('legacy-other');
  let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result.ok).toBe(true);
  expect((await loadGame()).contractEconomy).toBeUndefined();
});

it('refuses load hydration during play instead of using it as transaction adoption', async () => {
  await setup(); expect(hydrate(economyFixture())).toBe(true);
  act(() => { gs.setIsAutoSaveSuspended(true); gs.setScreen('hub'); });
  const replacement = economyFixture(); replacement.saveId = 'replacement';
  expect(hydrate(replacement)).toBe(false); expect(gs.saveId).toBe('test-save');
});

it('autosaves a hydrated annual world without dropping its engine or replaying legacy contract mail', async () => {
  const world = economyFixture();
  world.mailbox = [{ id: 'legacy-reply', type: 'contract_reply', read: false, deliverOnDay: 1,
    decision: { playerId: 0, salary: 9999 }, resolved: false }];
  expect((await saveGame(world, { skipCompression: true })).ok).toBe(true);
  await setup(); expect(hydrate(await loadGame())).toBe(true);
  await act(async () => { gs.markSaveDirty(['mailbox']); gs.setScreen('hub'); });
  await act(async () => { await vi.waitFor(() => expect(gs.saveResult?.ok).toBe(true)); });
  const resaved = await loadGame();
  expect(resaved.contractEconomy).toEqual(world.contractEconomy);
  expect(resaved.mailbox).toEqual(world.mailbox); expect(gs.saveDirty).toBe(false);
});

it('keeps observed legacy opening and unknown guarantee through hook hydration and resave', async () => {
  const base = economyFixture();
  const old = { ...base, contractEconomy: undefined, phase: 'season', teams: Array.from({ length: 12 }, (_, id) => ({ id, budget: 0, farm: [],
    players: id === 0 ? [{ id: 0, name: '観測', salary: 1000, contractYearsLeft: 3, 育成: false }] : [] })) };
  const migrated = prepareEconomyMigration(old, { season: 2026, stage: 'unstarted-offseason', legacyOffseasonStarted: false });
  expect(migrated.ok).toBe(true);
  const policy = economyPolicy(old.teams, 2027);
  const world = { ...base, teams: old.teams, faPool: [], schedule: null, contractEconomy: {
    ...base.contractEconomy, clock: { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 },
    budgetPolicies: policy.budgetPolicies, legacyEvidence: { ...base.contractEconomy.legacyEvidence, contracts: migrated.candidate.ledger.records },
    engine: { ...base.contractEconomy.engine, rosterRequirements: policy.rosterRequirements,
      spending: { ...base.contractEconomy.engine.spending, budgetSeason: 2027, ledger: migrated.candidate.ledger, authorizations: policy.authorizations } },
  } };
  const projected = fromAnnualState(world, toAnnualState(world));
  expect((await saveGame(projected)).ok).toBe(true);
  await setup(); expect(hydrate(await loadGame())).toBe(true);
  let result; await act(async () => { result = await gs.handleSave({ silent: true }); });
  expect(result.ok, result.reason).toBe(true);
  const loaded = await loadGame();
  expect(loaded.contractEconomy.engine.spending.ledger).toEqual(projected.contractEconomy.engine.spending.ledger);
  expect(loaded.contractEconomy.engine.spending.ledger.records[0].contract.guaranteeStatus).toBe('unknown');
  expect(loaded.teams[0].players[0]).not.toHaveProperty('contractSignedYear');
  expect(loaded.teams[0].players[0]).not.toHaveProperty('contractYears');
  expect(loaded.schedule).toBeNull();
});
