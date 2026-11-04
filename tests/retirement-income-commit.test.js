import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { retirementIncomeWorld, retirementIncomeCommand } from '../src/engine/__tests__/fixtures/retirementIncome';
import { finish, winter } from '../src/engine/__tests__/fixtures/annualRetirements';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../src/engine/economyPersistence';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
import { rootBodyReference } from '../src/engine/saveRootBodies';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
const apply = (w, c) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: retirementIncomeWorld(), sessionToken: 7, progressToken: 3 };
  expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
    baseRevision: current.world.contractEconomy.revision, sessionToken: 7, progressToken: 3 };
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false;
    current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }), progressToken: 4 };
    return true;
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])('cold-loads income once with unchanged spending (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large }, c = retirementIncomeCommand(current.world), next = apply(current.world, c);
  expect((await saves.saveGame(current.world, options)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
  expect(Boolean(rootBodyReference(rows.get(primary)))).toBe(large);
  const loaded = await saves.loadGame(); expect(validateEconomySave(loaded)).toBe('annual');
  expect(loaded.contractEconomy).toEqual(next.contractEconomy);
  expect(loaded.contractEconomy.incomeReceipts).toHaveLength(1);
  expect(reduceEconomyCommand(loaded, c)).toMatchObject({ ok: true, replayed: true });
});

it.each([false, true])('keeps source/root on publication failure and permits a cold rebuild/retry (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large }, old = current.world, c = retirementIncomeCommand(old), next = apply(old, c);
  expect((await saves.saveGame(old, options)).ok).toBe(true); const before = roots(), set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw new Error('disk unavailable'); set(k, v); };
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  const cold = await saves.loadGame(); expect(cold.contractEconomy.incomeReceipts).toEqual([]);
  const rebuilt = apply(cold, c); expect(rebuilt.contractEconomy).toEqual(next.contractEconomy);
  localStorage.setItem = set;
  expect((await saves.commitEconomyCandidate(rebuilt, expected, bindings, options)).ok).toBe(true);
  expect((await saves.loadGame()).contractEconomy.incomeReceipts).toHaveLength(1);
});

it('recovers published income after adoption failure without publishing twice', async () => {
  const c = retirementIncomeCommand(current.world), next = apply(current.world, c), old = current.world;
  expect((await saves.saveGame(old)).ok).toBe(true);
  const adopt = bindings.adopt; bindings.adopt = async () => { throw new Error('render interrupted'); };
  expect(await saves.commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(current.world).toBe(old); const published = roots(); bindings.adopt = adopt;
  expect((await saves.recoverEconomyCommit(expected, bindings)).ok).toBe(true); expect(roots()).toEqual(published);
  expect(current.world.contractEconomy.incomeReceipts).toHaveLength(1);
  expect(reduceEconomyCommand(current.world, c)).toMatchObject({ ok: true, replayed: true });
});

it('rejects paired monetary receipt/command rewrite and income rollback against the published prefix', async () => {
  const c = retirementIncomeCommand(current.world), next = apply(current.world, c);
  expect((await saves.saveGame(current.world)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(next, expected, bindings)).ok).toBe(true); const before = roots();
  const bad = structuredClone(next), receipt = bad.contractEconomy.engine.transactions.at(-1);
  const command = JSON.parse(receipt.signature); command.amountManYen = 99999;
  receipt.signature = JSON.stringify(command); bad.contractEconomy.incomeReceipts[0].amountManYen = 99999;
  bad.contractEconomy.revision++;
  expect(validateEconomySave(bad)).toBe('annual');
  expect(await saves.saveGame(bad)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
  const rollback = structuredClone(next); rollback.contractEconomy.revision++;
  rollback.contractEconomy.incomeReceipts = []; rollback.contractEconomy.engine.transactions.pop();
  expect(validateEconomySave(rollback)).toBe('annual');
  expect(await saves.saveGame(rollback)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
});

it('rejects retrospective income added to an already published finalized retirement', async () => {
  const base = current.world, c = retirementIncomeCommand(base), event = apply(base, c);
  const off = winter(base), old = apply(off, finish(off));
  const backfilled = structuredClone(old);
  backfilled.contractEconomy.incomeReceipts = event.contractEconomy.incomeReceipts;
  backfilled.contractEconomy.engine.transactions.push(event.contractEconomy.engine.transactions.at(-1));
  backfilled.contractEconomy.revision++;
  expect(reduceEconomyCommand(old, { ...c, baseRevision: old.contractEconomy.revision }).ok).toBe(false);
  expect(validateEconomySave(backfilled)).toBe('annual');
  expect(economyOverwriteIssue(old, backfilled)).toBe('economy_history_conflict');
  current.world = old; expected.baseRevision = old.contractEconomy.revision;
  expect((await saves.saveGame(old)).ok).toBe(true); const before = roots();
  expect((await saves.commitEconomyCandidate(backfilled, expected, bindings)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  expect((await saves.loadGame()).contractEconomy.incomeReceipts).toEqual([]);
});
