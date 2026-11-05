import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import * as saves from '../src/engine/saveload';
import { approvedPostingWorld, qualificationCommand, qualificationFacts } from '../src/engine/__tests__/fixtures/postingQualifications';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { rootBodyReference } from '../src/engine/saveRootBodies';
import { gameStateReducer, G } from '../src/hooks/gameStateReducer';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { createPostingQualificationProducer } from '../src/data/postingQualificationFacts';
import { postingWinter } from '../src/engine/__tests__/fixtures/postingDepartures';
import { envelope } from '../src/engine/__tests__/fixtures/faDeclarations';

const primary = 'baseball_manager_v1'; let rows, current, expected, bindings;
const roots = () => [primary, primary + '_bk1', primary + '_bk2'].map(k => rows.get(k));
const candidate = c => { const r = reduceEconomyCommand(current.world, c); expect(r.ok, r.error).toBe(true); return r.world; };
beforeEach(() => {
  rows = new Map(); vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  vi.stubGlobal('indexedDB', new IDBFactory()); vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  for (const level of ['log', 'warn', 'error', 'table']) vi.spyOn(console, level).mockImplementation(() => {});
  current = { world: approvedPostingWorld(), sessionToken: 7, progressToken: 3 };
  expected = { saveId: current.world.saveId, epoch: current.world.contractEconomy.epoch,
    baseRevision: current.world.contractEconomy.revision, sessionToken: 7, progressToken: 3 };
  bindings = { readCurrent: () => current, adopt: async (world, ack, canAdopt) => {
    if (!canAdopt()) return false;
    current = { ...current, world: gameStateReducer(current.world, { type: G.APPLY_ECONOMY_WORLD, world, expected }) }; return true;
  } };
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each([false, true])('cold-loads one immutable qualification snapshot and replays without a second record (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large }, old = current.world, command = qualificationCommand(old), next = candidate(command);
  expect((await saves.saveGame(old, options)).ok).toBe(true);
  // Existing load materializes career summaries; compare both sides through
  // that real boundary to isolate effects of the new command.
  const durableBefore = await saves.loadGame();
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
  expect(Boolean(rootBodyReference(rows.get(primary)))).toBe(large);
  const loaded = await saves.loadGame(); expect(validateEconomySave(loaded)).toBe('annual');
  expect(loaded.contractEconomy).toEqual(next.contractEconomy);
  expect(loaded.contractEconomy.engine.postingQualifications[0].assessment).toMatchObject({ exemption: 'exempt', knownRecognizedSeasons: 6 });
  expect(loaded.teams).toEqual(durableBefore.teams); expect(loaded.contractEconomy.engine.spending).toEqual(old.contractEconomy.engine.spending);
  expect(loaded.contractEconomy.incomeReceipts).toEqual(old.contractEconomy.incomeReceipts);
  expect(reduceEconomyCommand(loaded, command)).toMatchObject({ ok: true, replayed: true, world: loaded });
});

it.each([false, true])('keeps memory and durable roots on failure, then rebuilds identical facts after cold load (external=%s)', async large => {
  if (large) current.world.padding = 'large'.repeat(20000);
  const options = { skipCompression: large }, old = current.world, command = qualificationCommand(old), next = candidate(command);
  expect((await saves.saveGame(old, options)).ok).toBe(true); const before = roots(), set = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) throw new Error('disk unavailable'); set(k, v); };
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  const cold = await saves.loadGame(), rebuilt = reduceEconomyCommand(cold, command);
  expect(rebuilt.ok, rebuilt.error).toBe(true); expect(rebuilt.world.contractEconomy).toEqual(next.contractEconomy);
  localStorage.setItem = set; expect((await saves.commitEconomyCandidate(rebuilt.world, expected, bindings, options)).ok).toBe(true);
});

it('recovers a published snapshot after interrupted adoption without rewriting roots or adding another snapshot', async () => {
  const next = candidate(qualificationCommand(current.world)), old = current.world;
  expect((await saves.saveGame(old)).ok).toBe(true); const adopt = bindings.adopt;
  bindings.adopt = async () => { throw new Error('render interrupted'); };
  expect(await saves.commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_adoption_required' });
  expect(current.world).toBe(old); const published = roots(); bindings.adopt = adopt;
  expect((await saves.recoverEconomyCommit(expected, bindings)).ok).toBe(true); expect(roots()).toEqual(published);
  expect(current.world.contractEconomy.engine.postingQualifications).toHaveLength(1);
});

it('rejects deletion or paired valid replacement of a published snapshot', async () => {
  const old = current.world, next = candidate(qualificationCommand(old));
  expect((await saves.saveGame(old)).ok).toBe(true); expect((await saves.commitEconomyCandidate(next, expected, bindings)).ok).toBe(true);
  const before = roots(), deleted = structuredClone(next); delete deleted.contractEconomy.engine.postingQualifications;
  deleted.contractEconomy.engine.transactions.pop(); deleted.contractEconomy.revision++;
  expect(validateEconomySave(deleted)).toBe('annual');
  expect(await saves.saveGame(deleted)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
  const facts = qualificationFacts(); facts.birthDate.date = '1990-01-01';
  const rewritten = reduceEconomyCommand(old, qualificationCommand(old, { facts })); expect(rewritten.ok, rewritten.error).toBe(true);
  rewritten.world.contractEconomy.revision++; expect(validateEconomySave(rewritten.world)).toBe('annual');
  expect(await saves.saveGame(rewritten.world)).toMatchObject({ ok: false, reason: 'economy_history_conflict' }); expect(roots()).toEqual(before);
});

it('rejects stale adoption context before publication', async () => {
  const next = candidate(qualificationCommand(current.world)); expect((await saves.saveGame(current.world)).ok).toBe(true);
  const before = roots(); current.sessionToken++;
  expect(await saves.commitEconomyCandidate(next, expected, bindings)).toMatchObject({ ok: false, reason: 'economy_candidate_stale' });
  expect(roots()).toEqual(before);
});

it('runs an actual opening-roster application, records unknown pro evidence and cold-loads its fixed source identity', async () => {
  const realPlayerId = 'npb:21325134', team = createInitialTeams().find(t => [...t.players, ...t.farm].some(p => p.realPlayerId === realPlayerId));
  let w = postingWinter({ teams: [team] });
  const p = [...w.teams[0].players, ...w.teams[0].farm].find(p => p.realPlayerId === realPlayerId);
  for (const transaction of [
    { id: 'real-request', type: 'request-posting', teamId: team.id, playerId: p.id, contractId: p.contractId },
    { id: 'real-decision', type: 'decide-posting', requestId: 'real-request', decision: 'approve' },
  ]) { const r = reduceEconomyCommand(w, envelope(w, transaction)); expect(r.ok, r.error).toBe(true); w = r.world; }
  current.world = w; expected = { ...expected, saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: w.contractEconomy.revision };
  const facts = createPostingQualificationProducer()(p), command = qualificationCommand(w, { id: 0, requestId: 'real-request', facts });
  const next = candidate(command), options = { skipCompression: true };
  expect((await saves.saveGame(w, options)).ok).toBe(true);
  expect((await saves.commitEconomyCandidate(next, expected, bindings, options)).ok).toBe(true);
  const loaded = await saves.loadGame(), snapshot = loaded.contractEconomy.engine.postingQualifications[0];
  expect(snapshot.facts).toMatchObject({ sourcePlayerId: realPlayerId, birthDate: { date: '1994-12-19' }, professionalSeasons: null });
  expect(snapshot.assessment).toMatchObject({ exemption: 'unknown', knownRecognizedSeasons: null });
  const player = [...loaded.teams[0].players, ...loaded.teams[0].farm].find(p => p.id === snapshot.playerId);
  Object.assign(player, { name: 'display changed', age: 99, serviceYears: 99, isForeign: !player.isForeign });
  expect(validateEconomySave(loaded)).toBe('annual');
  expect(reduceEconomyCommand(loaded, command)).toMatchObject({ ok: true, replayed: true, world: loaded });
  expect(snapshot.assessment.exemption).toBe('unknown');
});
