import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { saveGame, loadGame, commitEconomyCandidate, recoverEconomyCommit } from '../src/engine/saveload';
import { requestGenerationWorld } from '../src/engine/__tests__/fixtures/postingRequestGeneration';
import { postingGenerationRequest, reducePostingGenerationRequest } from '../src/engine/humanPosting';
import { validateEconomySave } from '../src/engine/economyPersistence';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
const candidate = (world, request = postingGenerationRequest(world)) => {
  const r = reducePostingGenerationRequest(world, request); expect(r.ok, r.error).toBe(true); return r.world;
};
const context = () => { expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
  baseRevision: current.world.contractEconomy.revision, sessionToken: 7, progressToken: 3 }; };
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: requestGenerationWorld(), sessionToken: 7, progressToken: 3 }; context();
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false; current = { ...current, world }; return true;
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true].flatMap(external => [false, true].map(interested => [external, interested])))(
  'restores exactly one annual wish check including empty seasons (external=%s interested=%s)', async (external, interested) => {
    current.world = requestGenerationWorld({ interested }); if (external) current.world.padding = 'large'.repeat(20000);
    const options = { skipCompression: external };
    expect((await saveGame(current.world, options)).ok).toBe(true); current.world = await loadGame(); context();
    const request = postingGenerationRequest(current.world), next = candidate(current.world, request);
    expect((await commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
    const cold = await loadGame(); expect(validateEconomySave(cold)).toBe('annual');
    expect(cold.contractEconomy).toEqual(next.contractEconomy);
    expect(cold.contractEconomy.revision).toBe(1);
    expect(cold.contractEconomy.engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(1);
    expect((cold.contractEconomy.engine.postingApplications ?? []).length > 0).toBe(interested);
    const before = roots();
    expect(reducePostingGenerationRequest(cold, request)).toMatchObject({ ok: true, replayed: true, world: cold });
    expect(roots()).toEqual(before);
  });
it('rebuilds the same wishes after failed publication and cold load', async () => {
  expect((await saveGame(current.world)).ok).toBe(true); current.world = await loadGame(); context();
  const old = current.world, request = postingGenerationRequest(old), next = candidate(old), before = roots(), write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('full'); write(k, v); };
  expect((await commitEconomyCandidate(next, expected, bindings)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  const rebuilt = candidate(await loadGame(), request); expect(rebuilt.contractEconomy).toEqual(next.contractEconomy);
  localStorage.setItem = write;
  expect((await commitEconomyCandidate(rebuilt, expected, bindings)).ok).toBe(true);
});
it('recovers published wishes without another root write or generation', async () => {
  expect((await saveGame(current.world)).ok).toBe(true); current.world = await loadGame(); context();
  const next = candidate(current.world), adopt = bindings.adopt; bindings.adopt = async () => { throw Error('interrupted'); };
  expect(await commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  const published = roots(); bindings.adopt = adopt;
  expect((await recoverEconomyCommit(expected, bindings)).ok).toBe(true); expect(roots()).toEqual(published);
  expect(current.world.contractEconomy).toEqual(next.contractEconomy);
});
it('rejects a generated parent backfilled onto already published child requests', async () => {
  const next = candidate(current.world), old = structuredClone(next);
  old.contractEconomy.engine.transactions.pop(); old.contractEconomy.revision--;
  expect(validateEconomySave(old)).toBe('annual'); expect(validateEconomySave(next)).toBe('annual');
  expect((await saveGame(old)).ok).toBe(true); const published = roots();
  expect(await saveGame(next)).toMatchObject({ ok: false, reason: 'economy_history_conflict' });
  expect(roots()).toEqual(published);
});
it.each(['saveId', 'epoch', 'teamId', 'baseRevision', 'date', 'season'])('rejects a stale/foreign %s without changing the world', field => {
  const world = current.world, request = postingGenerationRequest(world), before = structuredClone(world);
  request[field] = typeof request[field] === 'number' ? request[field] + 1 : 'other';
  expect(reducePostingGenerationRequest(world, request)).toMatchObject({ ok: false, world });
  expect(world).toEqual(before);
});
