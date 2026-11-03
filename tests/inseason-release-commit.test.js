import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { inSeasonWorld, playableClub, releaseCommand } from '../src/engine/__tests__/fixtures/inSeasonDepartures';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';

const key = 'baseball_manager_v1', options = { skipCompression: true };
let rows, current, expected, bindings;
const roots = () => [key, key + '_bk1', key + '_bk2'].map(k => rows.get(k));
beforeEach(async () => {
  rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  // One playable club keeps the unpadded root below the real 64 KiB boundary.
  current = { world: inSeasonWorld({ teams: [playableClub()] }), sessionToken: 7, progressToken: 3 };
  expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
    baseRevision: 0, sessionToken: 7, progressToken: 3 };
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false;
    current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }), progressToken: 4 };
    return true;
  } };
  expect((await saves.saveGame(current.world, options)).ok).toBe(true);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])('publishes and reloads the complete release exactly once (large=%s)', async large => {
  const command = releaseCommand(current.world), result = reduceEconomyCommand(current.world, command);
  expect(result.ok, result.error).toBe(true);
  if (large) result.world.padding = 'large'.repeat(20000);
  const committed = await saves.commitEconomyCandidate(result.world, expected, bindings, options);
  expect(committed.ok, committed.reason).toBe(true);
  expect(JSON.parse(rows.get(key)).rootBodyVersion === 1).toBe(large);
  const loaded = await saves.loadGame(); expect(validateEconomySave(loaded)).toBe('annual');
  expect(loaded.teams[0].players.some(p => p.id === 0)).toBe(false);
  expect(loaded.faPool.map(p => p.id)).toEqual([0]);
  expect(loaded.contractEconomy.engine.offseasonDepartures).toHaveLength(1);
  expect(loaded.contractEconomy.engine.spending.ledger.records[0].changes).toHaveLength(1);
  expect(reduceEconomyCommand(loaded, command).world).toBe(loaded);
});

it.each([false, true])('does not adopt or lose debt/history on failed publication, then retries (large=%s)', async large => {
  const old = current.world, result = reduceEconomyCommand(old, releaseCommand(old)); expect(result.ok, result.error).toBe(true);
  if (large) result.world.padding = 'large'.repeat(20000);
  const before = roots(), set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === key) throw new Error('disk unavailable'); return set(k, v); };
  expect((await saves.commitEconomyCandidate(result.world, expected, bindings, options)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  expect((await saves.loadGame()).contractEconomy.engine.offseasonDepartures).toEqual([]);
  localStorage.setItem = set;
  expect((await saves.commitEconomyCandidate(result.world, expected, bindings, options)).ok).toBe(true);
  expect(current.world.contractEconomy.engine.offseasonDepartures).toHaveLength(1);
});
