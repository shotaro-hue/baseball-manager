import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { overseasMarket, overseasDeparture } from '../src/engine/__tests__/fixtures/overseasDepartures';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
import { rootBodyReference, readRootBody, MAX_INLINE_ROOT_BYTES } from '../src/engine/saveRootBodies';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
const surface = () => vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
  setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
beforeEach(() => {
  rows = new Map(); surface(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: overseasMarket(), sessionToken: 7, progressToken: 3 };
  expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
    baseRevision: current.world.contractEconomy.revision, sessionToken: 7, progressToken: 3 };
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false;
    current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }), progressToken: 4 };
    return true;
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const candidate = c => { const r = reduceEconomyCommand(current.world, c); expect(r.ok, r.error).toBe(true); return r.world; };

it.each([false, true])('publishes an overseas exit once and cold-loads it (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large }, c = overseasDeparture(current.world), next = candidate(c);
  expect((await saves.saveGame(current.world, options)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
  const raw = rows.get(primary), body = await readRootBody(raw);
  expect(Boolean(rootBodyReference(raw))).toBe(large); expect(body.length * 2 > MAX_INLINE_ROOT_BYTES).toBe(large);
  surface(); const loaded = await saves.loadGame();
  expect(validateEconomySave(loaded)).toBe('annual'); expect(loaded.contractEconomy).toEqual(next.contractEconomy);
  expect(loaded.faPool).toEqual([]); expect(loaded.teams[0].history).toHaveLength(1);
  expect(loaded.contractEconomy.engine.overseasDepartures).toHaveLength(1);
  expect(reduceEconomyCommand(loaded, c)).toMatchObject({ ok: true, replayed: true });
});

it.each([false, true])('keeps market/world/roots on publication failure, then retries (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large }, old = current.world, c = overseasDeparture(old), next = candidate(c);
  expect((await saves.saveGame(old, options)).ok).toBe(true);
  const before = roots(), set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw new Error('disk unavailable'); set(k, v); };
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  expect((await saves.loadGame()).faPool.map(p => p.id)).toEqual([0]);
  localStorage.setItem = set;
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
  surface(); const loaded = await saves.loadGame();
  expect(loaded.faPool).toEqual([]); expect(loaded.contractEconomy.engine.overseasDepartures).toHaveLength(1);
});

it('refuses a coordinated rollback to the original market without replacing committed roots', async () => {
  const old = current.world;
  expect((await saves.saveGame(old)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(candidate(overseasDeparture(old)), expected, bindings)).ok).toBe(true);
  const before = roots(), bad = structuredClone(current.world);
  bad.contractEconomy.revision++; bad.contractEconomy.engine.overseasDepartures = [];
  bad.contractEconomy.engine.transactions.pop(); bad.faPool = structuredClone(old.faPool);
  expect(validateEconomySave(bad)).toBe('annual');
  expect(await saves.saveGame(bad)).toMatchObject({ ok: false, reason: 'economy_history_conflict' });
  expect(roots()).toEqual(before); surface(); expect((await saves.loadGame()).faPool).toEqual([]);
});
