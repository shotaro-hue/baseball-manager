import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { qualifiedPostingWorld, marketResult } from '../src/engine/__tests__/fixtures/postingMarketResults';
import { postingWinter } from '../src/engine/__tests__/fixtures/postingDepartures';
import { envelope } from '../src/engine/__tests__/fixtures/faDeclarations';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { createPostingQualificationProducer } from '../src/data/postingQualificationFacts';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { rootBodyReference } from '../src/engine/saveRootBodies';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
import { isIkuseiPlayer } from '../src/engine/rosterCapacity';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
const candidate = (c, world = current.world) => { const r = reduceEconomyCommand(world, c); expect(r.ok, r.error).toBe(true); return r.world; };
const context = () => { expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
  baseRevision: current.world.contractEconomy.revision, sessionToken: 7, progressToken: 3 }; };
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: qualifiedPostingWorld(), sessionToken: 7, progressToken: 3 }; context();
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false;
    current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }) }; return true;
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true].flatMap(large => ['signed', 'no-offer', 'declined'].map(outcome => [large, outcome])))(
  'publishes and cold-loads one outcome with its complete effects (external=%s, %s)', async (large, outcome) => {
    if (large) current.world.padding = 'large'.repeat(20000);
    const old = current.world, command = marketResult(old, outcome), next = candidate(command), options = { skipCompression: large };
    expect((await saves.saveGame(old, options)).ok).toBe(true);
    const durableBefore = await saves.loadGame();
    expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
    expect(Boolean(rootBodyReference(rows.get(primary)))).toBe(large);
    const cold = await saves.loadGame(); expect(validateEconomySave(cold)).toBe('annual');
    expect(cold.contractEconomy).toEqual(next.contractEconomy);
    expect(cold.contractEconomy.engine.postingMarketResults).toHaveLength(1);
    expect(cold.contractEconomy.incomeReceipts).toHaveLength(outcome === 'signed' ? 1 : 0);
    if (outcome !== 'signed') expect(cold.teams).toEqual(durableBefore.teams);
    expect(reduceEconomyCommand(cold, command)).toMatchObject({ ok: true, replayed: true, world: cold });
  });

it.each([false, true])('keeps roots and memory unchanged on failure and reconstructs one identical result (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large };
  expect((await saves.saveGame(current.world, options)).ok).toBe(true);
  // Use a real loaded baseline so career materialization is identical on retry.
  const old = await saves.loadGame(); current.world = old; context();
  const command = marketResult(old), next = candidate(command), before = roots(), set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw new Error('disk unavailable'); set(k, v); };
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  const cold = await saves.loadGame(), rebuilt = candidate(command, cold);
  expect(rebuilt.contractEconomy).toEqual(next.contractEconomy);
  localStorage.setItem = set; expect((await saves.commitEconomyCandidate(rebuilt, expected, bindings, options)).ok).toBe(true);
  expect((await saves.loadGame()).contractEconomy.incomeReceipts).toHaveLength(1);
});

it('recovers interrupted adoption of a published outcome without a second departure or payment', async () => {
  const old = current.world, next = candidate(marketResult(old));
  expect((await saves.saveGame(old)).ok).toBe(true); const adopt = bindings.adopt;
  bindings.adopt = async () => { throw new Error('interrupted adoption'); };
  expect(await saves.commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(current.world).toBe(old); const published = roots(); bindings.adopt = adopt;
  expect((await saves.recoverEconomyCommit(expected, bindings)).ok).toBe(true); expect(roots()).toEqual(published);
  expect(current.world.contractEconomy.engine.postingDepartures).toHaveLength(1);
  expect(current.world.contractEconomy.engine.postingMarketResults).toHaveLength(1);
  expect(current.world.contractEconomy.incomeReceipts).toHaveLength(1);
});

it('rejects published result deletion and a different individually valid result even with matching receipts', async () => {
  const old = current.world, next = candidate(marketResult(old, 'no-offer'));
  expect((await saves.saveGame(old)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(next, expected, bindings)).ok).toBe(true); const before = roots();
  const deleted = structuredClone(old); deleted.contractEconomy.revision = next.contractEconomy.revision + 1;
  expect(validateEconomySave(deleted)).toBe('annual');
  expect(await saves.saveGame(deleted)).toMatchObject({ ok: false, reason: 'economy_history_conflict' });
  const replacement = candidate(marketResult(old, 'declined'), old); replacement.contractEconomy.revision++;
  expect(validateEconomySave(replacement)).toBe('annual');
  expect(await saves.saveGame(replacement)).toMatchObject({ ok: false, reason: 'economy_history_conflict' });
  expect(roots()).toEqual(before);
});

it('rejects backfilling a market result onto a previously published explicit completion', async () => {
  const signed = candidate(marketResult(current.world)), old = structuredClone(signed), e = old.contractEconomy.engine;
  for (const key of ['postingApplications', 'postingQualifications', 'postingMarketResults']) delete e[key];
  e.transactions = e.transactions.filter(t => !['request-posting', 'decide-posting', 'record-posting-qualification', 'resolve-posting'].includes(JSON.parse(t.signature).type));
  const publishedIds = new Set(e.transactions.map(t => t.id));
  signed.contractEconomy.engine.transactions = [...structuredClone(e.transactions),
    ...signed.contractEconomy.engine.transactions.filter(t => !publishedIds.has(t.id))];
  old.contractEconomy.revision--; expect(validateEconomySave(old)).toBe('annual');
  expect((await saves.saveGame(old)).ok).toBe(true); const before = roots();
  expect(validateEconomySave(signed)).toBe('annual');
  expect(await saves.saveGame(signed)).toMatchObject({ ok: false, reason: 'economy_history_conflict' });
  expect(roots()).toEqual(before);
});

it('rejects stale adoption context before publishing a result', async () => {
  const next = candidate(marketResult(current.world)); expect((await saves.saveGame(current.world)).ok).toBe(true);
  const before = roots(); current.sessionToken++;
  expect(await saves.commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_candidate_stale' });
  expect(roots()).toEqual(before);
});

it('uses actual opening-roster identities through approval, v2 qualification, explicit minor signing and cold load', async () => {
  const team = createInitialTeams()[0];
  let w = postingWinter({ teams: [team] });
  const p = w.teams[0].players.find(p => !isIkuseiPlayer(p));
  const development = [...w.teams[0].players, ...w.teams[0].farm].find(isIkuseiPlayer);
  expect(development).toBeDefined();
  expect(reduceEconomyCommand(w, envelope(w, { id: 'development', type: 'request-posting', teamId: team.id,
    playerId: development.id, contractId: development.contractId })).ok).toBe(false);
  for (const transaction of [
    { id: 'real-request', type: 'request-posting', teamId: team.id, playerId: p.id, contractId: p.contractId },
    { id: 'real-decision', type: 'decide-posting', requestId: 'real-request', decision: 'approve' },
    { id: 'real-qualification', type: 'record-posting-qualification', requestId: 'real-request', facts: createPostingQualificationProducer()(p, 2026) },
  ]) w = candidate(envelope(w, transaction), w);
  current.world = w; context(); const command = marketResult(w, 'signed', { requestId: 'real-request', qualificationId: 'real-qualification',
    overseasContract: { kind: 'minor', signingBonusUsdCents: 1000000 } });
  expect((await saves.saveGame(w)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(candidate(command), expected, bindings)).ok).toBe(true);
  const cold = await saves.loadGame(); expect(validateEconomySave(cold)).toBe('annual');
  expect(cold.contractEconomy.engine.postingMarketResults[0]).toMatchObject({ playerId: p.id, teamId: team.id, outcome: 'signed' });
  expect(cold.contractEconomy.engine.postingQualifications[0].facts.sourcePlayerId).toBe(p.realPlayerId);
  expect(cold.teams[0].players.some(row => row.id === p.id)).toBe(false);
});
