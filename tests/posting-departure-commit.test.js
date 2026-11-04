import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { postingWinter, postingCommand } from '../src/engine/__tests__/fixtures/postingDepartures';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
import { rootBodyReference, readRootBody, MAX_INLINE_ROOT_BYTES } from '../src/engine/saveRootBodies';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const surface = () => vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
  setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
beforeEach(() => {
  rows = new Map(); surface(); vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: postingWinter(), sessionToken: 7, progressToken: 3 };
  expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
    baseRevision: 0, sessionToken: 7, progressToken: 3 };
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false;
    current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }), progressToken: 4 };
    return true;
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const candidate = c => { const r = reduceEconomyCommand(current.world, c); expect(r.ok, r.error).toBe(true); return r.world; };

it.each([[false, 'retain'], [false, 'waive'], [true, 'retain'], [true, 'waive']])(
  'publishes and cold-loads a posting exactly once (external=%s, settlement=%s)', async (large, settlement) => {
    if (large) current.world.padding = 'large'.repeat(20000);
    const options = { skipCompression: large }, c = postingCommand(current.world,
      { settlement, ...(settlement === 'waive' ? { terminationAgreementId: 0 } : {}) }), next = candidate(c);
    expect((await saves.saveGame(current.world, options)).ok).toBe(true);
    expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
    const raw = rows.get(primary), body = await readRootBody(raw);
    expect(Boolean(rootBodyReference(raw))).toBe(large); expect(body.length * 2 > MAX_INLINE_ROOT_BYTES).toBe(large);
    surface(); const loaded = await saves.loadGame(); expect(validateEconomySave(loaded)).toBe('annual');
    expect(loaded.contractEconomy).toEqual(next.contractEconomy); expect(loaded.faPool).toEqual([]);
    expect(loaded.teams[0].players.some(p => p.id === 0)).toBe(false);
    expect(loaded.contractEconomy.engine.postingDepartures).toHaveLength(1);
    expect(reduceEconomyCommand(loaded, c)).toMatchObject({ ok: true, replayed: true });
  },
);
it.each([false, true])('keeps the original employment, liability and roots on failed publication, then retries (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large }, old = current.world, c = postingCommand(old, { settlement: 'waive', terminationAgreementId: 'new' }), next = candidate(c);
  expect((await saves.saveGame(old, options)).ok).toBe(true);
  const before = roots(), set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw new Error('disk unavailable'); set(k, v); };
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  const original = await saves.loadGame(); expect(original.teams[0].players.some(p => p.id === 0)).toBe(true);
  expect(original.contractEconomy.engine.spending.ledger).toEqual(old.contractEconomy.engine.spending.ledger);
  localStorage.setItem = set;
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
  surface(); expect(validateEconomySave(await saves.loadGame())).toBe('annual');
});
it('rejects coordinated edits of agreement dates across all evidence without changing committed roots', async () => {
  const c = postingCommand(current.world, { settlement: 'waive', terminationAgreementId: 'new' });
  expect((await saves.saveGame(current.world)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(candidate(c), expected, bindings)).ok).toBe(true);
  const before = roots(), bad = structuredClone(current.world), e = bad.contractEconomy.engine;
  for (const d of [e.postingDepartures[0], e.transactions.at(-1).postingDeparture]) {
    d.terminationAgreement.agreedDate = '2026-11-30'; d.endAction.terminationAgreement.agreedDate = '2026-11-30';
  }
  e.spending.ledger.records[0].changes[0].terminationAgreement.agreedDate = '2026-11-30'; bad.contractEconomy.revision++;
  expect((await saves.saveGame(bad)).ok).toBe(false); expect(roots()).toEqual(before);
  surface(); expect((await saves.loadGame()).contractEconomy.engine.postingDepartures[0].terminationAgreement.agreedDate).toBe('2026-12-01');
});
it('protects a natural-expiry posting history even when rolling back to an otherwise valid original roster', async () => {
  current.world = postingWinter({ years: 1 }); const old = structuredClone(current.world);
  expect((await saves.saveGame(old)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(candidate(postingCommand(old)), expected, bindings)).ok).toBe(true);
  const before = roots(), bad = structuredClone(old); bad.contractEconomy.revision = 2;
  expect(validateEconomySave(bad)).toBe('annual');
  expect(await saves.saveGame(bad)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
});
