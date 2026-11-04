import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { postingWinter } from '../src/engine/__tests__/fixtures/postingDepartures';
import { postingRequest, postingDecision } from '../src/engine/__tests__/fixtures/postingApplications';
import { reduceEconomyCommand, toAnnualState } from '../src/engine/contractEconomy';
import { postingApplicationViews } from '../src/engine/annualPostingApplications';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
import { rootBodyReference } from '../src/engine/saveRootBodies';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
const candidate = c => { const r = reduceEconomyCommand(current.world, c); expect(r.ok, r.error).toBe(true); return r.world; };
const resetExpected = () => { expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
  baseRevision: current.world.contractEconomy.revision, sessionToken: 7, progressToken: 3 }; };
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: postingWinter(), sessionToken: 7, progressToken: 3 }; current.world.teams[0].players[0].postingRequested = false;
  resetExpected();
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false;
    current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }) };
    return true;
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true].flatMap(large => ['pending', 'approve', 'reject'].map(status => [large, status])))(
  'cold-loads recorded request/GM decision (external=%s, %s)', async (large, status) => {
    if (large) current.world.padding = 'large'.repeat(20000);
    if (status !== 'pending') { current.world = candidate(postingRequest(current.world)); resetExpected(); }
    const options = { skipCompression: large }, c = status === 'pending' ? postingRequest(current.world) : postingDecision(current.world, status);
    const before = current.world, next = candidate(c);
    expect((await saves.saveGame(before, options)).ok).toBe(true);
    expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
    expect(Boolean(rootBodyReference(rows.get(primary)))).toBe(large);
    const cold = await saves.loadGame(); expect(validateEconomySave(cold)).toBe('annual');
    expect(cold.contractEconomy).toEqual(next.contractEconomy);
    expect(postingApplicationViews(toAnnualState(cold))[0].status).toBe(status === 'pending' ? 'pending' : status === 'approve' ? 'approved' : 'rejected');
    expect(cold.contractEconomy.engine.spending).toEqual(before.contractEconomy.engine.spending);
    expect(cold.contractEconomy.incomeReceipts).toEqual([]);
    expect(reduceEconomyCommand(cold, c)).toMatchObject({ ok: true, replayed: true });
  });

it.each([false, true].flatMap(large => ['request', 'approve', 'reject'].map(status => [large, status])))(
  'publication failure leaves memory/root and cold retry reproduces evidence (external=%s, %s)', async (large, status) => {
    if (large) current.world.padding = 'large'.repeat(20000);
    if (status !== 'request') { current.world = candidate(postingRequest(current.world)); resetExpected(); }
    const options = { skipCompression: large }, old = current.world;
    const c = status === 'request' ? postingRequest(old) : postingDecision(old, status), next = candidate(c);
    expect((await saves.saveGame(old, options)).ok).toBe(true);
    const before = roots(), set = localStorage.setItem;
    localStorage.setItem = (k, v) => { if (k === primary) throw new Error('disk unavailable'); set(k, v); };
    expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(false);
    expect(current.world).toBe(old); expect(roots()).toEqual(before);
    const cold = await saves.loadGame(), rebuilt = reduceEconomyCommand(cold, c);
    expect(rebuilt.ok, rebuilt.error).toBe(true);
    expect(rebuilt.world.contractEconomy).toEqual(next.contractEconomy);
    localStorage.setItem = set;
    expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
    expect((await saves.loadGame()).contractEconomy.engine.postingApplications).toEqual(next.contractEconomy.engine.postingApplications);
  });

it('recovers an already published approval without publishing or answering twice', async () => {
  current.world = candidate(postingRequest(current.world)); resetExpected();
  const c = postingDecision(current.world), next = candidate(c), old = current.world;
  expect((await saves.saveGame(old)).ok).toBe(true);
  const adopt = bindings.adopt; bindings.adopt = async () => { throw new Error('render interrupted'); };
  expect(await saves.commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(current.world).toBe(old); const published = roots(); bindings.adopt = adopt;
  expect((await saves.recoverEconomyCommit(expected, bindings)).ok).toBe(true); expect(roots()).toEqual(published);
  expect(current.world.contractEconomy.engine.postingApplications).toHaveLength(2);
  expect(reduceEconomyCommand(current.world, c)).toMatchObject({ ok: true, replayed: true });
});
it('rejects published evidence deletion and altered GM answer even with paired receipt rewrite', async () => {
  current.world = candidate(postingRequest(current.world)); resetExpected();
  const next = candidate(postingDecision(current.world));
  expect((await saves.saveGame(current.world)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(next, expected, bindings)).ok).toBe(true);
  const before = roots(), altered = structuredClone(next); altered.contractEconomy.revision++;
  const event = altered.contractEconomy.engine.postingApplications[1], receipt = altered.contractEconomy.engine.transactions.at(-1);
  event.decision = 'reject'; receipt.postingApplication.decision = 'reject';
  const command = JSON.parse(receipt.signature); command.decision = 'reject';
  receipt.signature = JSON.stringify(command, (_, value) => value && !Array.isArray(value) && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, value[k]])) : value);
  expect(validateEconomySave(altered)).toBe('annual');
  expect(await saves.saveGame(altered)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
  const bad = structuredClone(next); bad.contractEconomy.revision++;
  bad.contractEconomy.engine.postingApplications = []; bad.contractEconomy.engine.transactions = [];
  expect(validateEconomySave(bad)).toBe('annual');
  expect(await saves.saveGame(bad)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
});
it('rejects a stale Worker candidate and stale decision without changing root/world', async () => {
  const stale = candidate(postingRequest(current.world)), original = current.world;
  expect((await saves.saveGame(original)).ok).toBe(true); const before = roots();
  current.progressToken++;
  expect((await saves.commitEconomyCandidate(stale, expected, bindings)).ok).toBe(false);
  expect(current.world).toBe(original); expect(roots()).toEqual(before);
  expect(gameStateReducer(original, { type: G.APPLY_ECONOMY_WORLD, world: stale,
    expected: { ...expected, baseRevision: 1 } })).toBe(original);
});
