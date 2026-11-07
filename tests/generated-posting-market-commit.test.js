import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { saveGame, loadGame, commitEconomyCandidate, recoverEconomyCommit } from '../src/engine/saveload';
import { generatedPostingWorld } from '../src/engine/__tests__/fixtures/postingMarketResults';
import { postingMarketRequest, reducePostingMarketRequest } from '../src/engine/humanPosting';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { rootBodyReference } from '../src/engine/saveRootBodies';
import { qualificationCommand } from '../src/engine/__tests__/fixtures/postingQualifications';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
const candidate = (world = current.world, request = postingMarketRequest(world, 'request')) => {
  const r = reducePostingMarketRequest(world, request); expect(r.ok, r.error).toBe(true); return r.world;
};
function context() {
  expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
    baseRevision: current.world.contractEconomy.revision, sessionToken: 7, progressToken: 3 };
}
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: generatedPostingWorld(), sessionToken: 7, progressToken: 3 }; context();
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false; current = { ...current, world }; return true;
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true].flatMap(external => ['signed', 'no-offer', 'declined'].map(outcome => [external, outcome])))(
  'generates and restores %s-body %s with one revision and replayable evidence', async (external, outcome) => {
    current.world = generatedPostingWorld(outcome); if (external) current.world.padding = 'large'.repeat(20000);
    const options = { skipCompression: external };
    expect((await saveGame(current.world, options)).ok).toBe(true); current.world = await loadGame(); context();
    const before = structuredClone(current.world), request = postingMarketRequest(current.world, 'request'), next = candidate(current.world, request);
    expect((await commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
    expect(Boolean(rootBodyReference(rows.get(primary)))).toBe(external);
    const cold = await loadGame(); expect(validateEconomySave(cold)).toBe('annual');
    expect(cold.contractEconomy).toEqual(next.contractEconomy);
    expect(cold.contractEconomy.revision).toBe(before.contractEconomy.revision + 1);
    expect(cold.contractEconomy.engine.postingMarketResults[0].outcome).toBe(outcome);
    expect(reducePostingMarketRequest(cold, request)).toMatchObject({ ok: true, replayed: true, world: cold });
  });
it.each([false, true])('reconstructs identical generated result after publication failure and cold load (external=%s)', async external => {
  if (external) current.world.padding = 'large'.repeat(20000); const options = { skipCompression: external };
  expect((await saveGame(current.world, options)).ok).toBe(true); current.world = await loadGame(); context();
  const old = current.world, request = postingMarketRequest(old, 'request'), next = candidate(old, request), before = roots(), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('disk full'); write(k, v); };
  expect((await commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  const cold = await loadGame(), rebuilt = candidate(cold, request); expect(rebuilt.contractEconomy).toEqual(next.contractEconomy);
  localStorage.setItem = write;
  expect((await commitEconomyCandidate(rebuilt, expected, bindings, options)).ok).toBe(true);
  expect((await loadGame()).contractEconomy.incomeReceipts).toHaveLength(1);
});
it('recovers a published generated result without another draw, departure, payment or root write', async () => {
  expect((await saveGame(current.world)).ok).toBe(true); current.world = await loadGame(); context();
  const next = candidate(), adopt = bindings.adopt; bindings.adopt = async () => { throw Error('adoption interrupted'); };
  expect(await commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  const published = roots(); bindings.adopt = adopt;
  expect((await recoverEconomyCommit(expected, bindings)).ok).toBe(true); expect(roots()).toEqual(published);
  expect(current.world.contractEconomy).toEqual(next.contractEconomy);
});
it('rejects a generated parent backfilled onto a previously published explicit result', async () => {
  const next = candidate(), old = structuredClone(next);
  old.contractEconomy.engine.transactions.pop(); old.contractEconomy.revision--;
  expect(validateEconomySave(old)).toBe('annual'); expect(validateEconomySave(next)).toBe('annual');
  expect((await saveGame(old)).ok).toBe(true); const before = roots();
  expect(await saveGame(next)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
});
it('allows an unpublished explicit qualification followed by a new generated result in one save extension', async () => {
  const old = current.world; expect((await saveGame(old)).ok).toBe(true);
  const qualified = reduceEconomyCommand(old, qualificationCommand(old)); expect(qualified.ok, qualified.error).toBe(true);
  const next = candidate(qualified.world);
  expect(next.contractEconomy.revision).toBe(old.contractEconomy.revision + 2);
  expect(next.contractEconomy.engine.transactions.at(-1).generatedPostingMarket.qualificationCreated).toBe(false);
  expect((await saveGame(next)).ok).toBe(true);
  expect((await loadGame()).contractEconomy).toEqual(next.contractEconomy);
});
it('freezes the published random root even when all generated receipts are individually consistent with a replacement', async () => {
  const old = current.world; expect((await saveGame(old)).ok).toBe(true); const before = roots();
  const fork = structuredClone(old); fork.contractEconomy.randomRoot.seed = 'different-valid-seed';
  const next = candidate(fork); expect(validateEconomySave(next)).toBe('annual');
  expect(await saveGame(next)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
});
it('does not replace published legacy diagnostics with another engine\'s individually valid snapshot', async () => {
  const fixtures = JSON.parse(gunzipSync(readFileSync(new URL('../src/engine/__tests__/fixtures/postingMathV1.json.gz', import.meta.url))));
  const old = fixtures.v8, other = fixtures.jsc;
  expect(validateEconomySave(old)).toBe('annual'); expect(validateEconomySave(other)).toBe('annual');
  expect((await saveGame(old)).ok).toBe(true); const published = roots();
  other.contractEconomy.revision = old.contractEconomy.revision + 1;
  expect(await saveGame(other)).toMatchObject({ ok: false, reason: 'economy_history_conflict' });
  expect(roots()).toEqual(published); expect((await loadGame()).contractEconomy).toEqual(old.contractEconomy);
});
