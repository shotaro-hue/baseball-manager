import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { postingWinter, postingCommand } from '../src/engine/__tests__/fixtures/postingDepartures';
import { completion } from '../src/engine/__tests__/fixtures/postingIncome';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../src/engine/economyPersistence';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
import { rootBodyReference } from '../src/engine/saveRootBodies';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
const candidate = c => { const r = reduceEconomyCommand(current.world, c); expect(r.ok, r.error).toBe(true); return r.world; };
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
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

it.each([[false, 'retain'], [false, 'waive'], [true, 'retain'], [true, 'waive']])(
  'cold-loads one completed posting and next-season allowance (external=%s, settlement=%s)', async (large, settlement) => {
    if (large) current.world.padding = 'large'.repeat(20000);
    const options = { skipCompression: large }, c = completion(current.world, { settlement,
      ...(settlement === 'waive' ? { terminationAgreementId: 0 } : {}) });
    const next = candidate(c); expect((await saves.saveGame(current.world, options)).ok).toBe(true);
    expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
    expect(Boolean(rootBodyReference(rows.get(primary)))).toBe(large);
    const loaded = await saves.loadGame(); expect(validateEconomySave(loaded)).toBe('annual');
    expect(loaded.contractEconomy).toEqual(next.contractEconomy); expect(loaded.contractEconomy.incomeReceipts).toHaveLength(1);
    expect(loaded.contractEconomy.engine.postingDepartures).toHaveLength(1);
    expect(loaded.contractEconomy.engine.spending.authorizations.find(r => r.teamId === 0 && r.season === 2027).approvedManYen).toBe(1253125);
    expect(reduceEconomyCommand(loaded, c)).toMatchObject({ ok: true, replayed: true });
  });

it.each([false, true])('keeps source/root on publication failure and rebuilds the exact result after cold load (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large }, original = current.world, c = completion(original), next = candidate(c);
  expect((await saves.saveGame(original, options)).ok).toBe(true);
  const before = roots(), set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw new Error('disk unavailable'); set(k, v); };
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(false);
  expect(current.world).toBe(original); expect(roots()).toEqual(before);
  const cold = await saves.loadGame(); expect(cold.contractEconomy.incomeReceipts).toEqual([]);
  // Load normalizes player career/stat presentation fields. Those snapshots may
  // gain empty fields; the recorded contract, money and permission must match.
  const rebuilt = reduceEconomyCommand(cold, c); expect(rebuilt.ok, rebuilt.error).toBe(true);
  expect(rebuilt.world.contractEconomy.incomeReceipts).toEqual(next.contractEconomy.incomeReceipts);
  expect(rebuilt.world.contractEconomy.engine.spending).toEqual(next.contractEconomy.engine.spending);
  expect(rebuilt.world.teams[0].players.some(p => p.id === 0)).toBe(false);
  localStorage.setItem = set;
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
  expect((await saves.loadGame()).contractEconomy.incomeReceipts).toHaveLength(1);
});

it('recovers published income and allowance without publishing or settling a second time', async () => {
  const c = completion(current.world), next = candidate(c), old = current.world;
  expect((await saves.saveGame(old)).ok).toBe(true);
  const adopt = bindings.adopt; bindings.adopt = async () => { throw new Error('render interrupted'); };
  expect(await saves.commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(current.world).toBe(old); const published = roots(); bindings.adopt = adopt;
  expect((await saves.recoverEconomyCommit(expected, bindings)).ok).toBe(true); expect(roots()).toEqual(published);
  expect(current.world.contractEconomy.incomeReceipts).toHaveLength(1);
  expect(reduceEconomyCommand(current.world, c)).toMatchObject({ ok: true, replayed: true });
});

it('rejects a coordinated money/command/allowance rewrite against published history', async () => {
  const c = completion(current.world), next = candidate(c);
  expect((await saves.saveGame(current.world)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(next, expected, bindings)).ok).toBe(true);
  const before = roots(), bad = structuredClone(current.world), income = bad.contractEconomy.incomeReceipts[0];
  // USD200m has USD31.875m fee, JPY150 => 478125 man-yen.
  income.overseasContract.guaranteedUsdCents = 20000000000; income.feeUsdCents = 3187500000;
  income.amountManYen = income.budgetAllocation.amountManYen = 478125;
  bad.contractEconomy.engine.spending.authorizations.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = 1478125;
  bad.teams[0].budget += 225000;
  const receipt = bad.contractEconomy.engine.transactions.at(-1), command = JSON.parse(receipt.signature);
  command.overseasContract.guaranteedUsdCents = 20000000000;
  const canonical = value => JSON.stringify(value, (_, v) => v && !Array.isArray(v) && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  receipt.signature = canonical(command); bad.contractEconomy.revision++;
  expect(validateEconomySave(bad)).toBe('annual');
  expect(await saves.saveGame(bad)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
});

it('rejects income appended later to an already published standalone departure', async () => {
  const base = current.world, c = completion(base);
  const old = reduceEconomyCommand(base, postingCommand(base, { id: JSON.stringify([c.transaction.id, 'posting-departure']) })).world;
  const backfilled = candidate(c); backfilled.contractEconomy.revision = 2;
  // The complete endpoint refuses the old source, but a structurally consistent
  // later save must also be rejected by the actual publication barrier.
  expect(reduceEconomyCommand(old, { ...c, baseRevision: 1 }).ok).toBe(false);
  expect(validateEconomySave(backfilled)).toBe('annual');
  expect(economyOverwriteIssue(old, backfilled)).toBe('economy_history_conflict');
  current.world = old; expected.baseRevision = 1;
  expect((await saves.saveGame(old)).ok).toBe(true); const before = roots();
  expect((await saves.commitEconomyCandidate(backfilled, expected, bindings)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  expect((await saves.loadGame()).contractEconomy.incomeReceipts).toEqual([]);
});
