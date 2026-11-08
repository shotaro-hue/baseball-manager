import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { saveGame, loadGame, commitEconomyCandidate, recoverEconomyCommit } from '../src/engine/saveload';
import { requestGenerationWorld } from '../src/engine/__tests__/fixtures/postingRequestGeneration';
import { postingGenerationRequest, reducePostingGenerationRequest } from '../src/engine/humanPosting';
import { reduceEconomyCommand } from '../src/engine/contractEconomy';
import { envelope } from '../src/engine/__tests__/fixtures/faDeclarations';
import { postingGenerationId } from '../src/engine/generatedPostingRequests';
import { validateEconomySave } from '../src/engine/economyPersistence';
import { cpuPostingBudgetWorld } from '../src/engine/__tests__/fixtures/cpuPostingBudget';
import legacyCpuReceipts from '../src/engine/__tests__/fixtures/cpuPostingReceiptsV1.json';

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
    expect(cold.contractEconomy.engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(2);
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
it('publishes budget refusals and human wishes once after a failed save, with identical retry and cold replay', async () => {
  current.world = cpuPostingBudgetWorld();
  expect((await saveGame(current.world)).ok).toBe(true); current.world = await loadGame(); context();
  const old = current.world, request = postingGenerationRequest(old), next = candidate(old), before = roots(), write = localStorage.setItem;
  const phase = next.contractEconomy.engine.transactions.at(-1).annualPostingPhase;
  expect(phase.decisions.map(d => d.reason)).toEqual(['future-budget', 'future-budget']);
  localStorage.setItem = (k, v) => { if (k === primary) throw Error('full'); write(k, v); };
  expect((await commitEconomyCandidate(next, expected, bindings)).ok).toBe(false);
  expect(current.world).toBe(old); expect(roots()).toEqual(before);
  const rebuilt = candidate(await loadGame(), request); expect(rebuilt.contractEconomy).toEqual(next.contractEconomy);
  let publications = 0;
  localStorage.setItem = (k, v) => { if (k === primary) publications++; write(k, v); };
  expect((await commitEconomyCandidate(rebuilt, expected, bindings)).ok).toBe(true);
  expect(publications).toBe(1);
  const cold = await loadGame(); expect(validateEconomySave(cold)).toBe('annual');
  expect(cold.contractEconomy).toEqual(next.contractEconomy);
  expect(cold.contractEconomy.engine.spending).toEqual(old.contractEconomy.engine.spending);
  expect(reducePostingGenerationRequest(cold, request)).toMatchObject({ ok: true, replayed: true, world: cold });
  expect(publications).toBe(1);
});
it('saves and cold-loads v1 CPU receipts without converting decisions to the new policy', async () => {
  const old = candidate(current.world), transactions = old.contractEconomy.engine.transactions;
  for (const receipt of legacyCpuReceipts) {
    const at = transactions.findIndex(t => t.id === receipt.id);
    expect(at).toBeGreaterThanOrEqual(0); transactions[at] = structuredClone(receipt);
  }
  const before = JSON.parse(JSON.stringify(old.contractEconomy));
  expect((await saveGame(old)).ok).toBe(true);
  const cold = await loadGame(); expect(validateEconomySave(cold)).toBe('annual');
  expect(cold.contractEconomy).toEqual(before);
  expect(reducePostingGenerationRequest(cold, postingGenerationRequest(cold)))
    .toMatchObject({ ok: true, replayed: true, world: cold });
  expect(cold.contractEconomy).toEqual(before);
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
  const r = reduceEconomyCommand(current.world, envelope(current.world, { id: postingGenerationId(2026, 0), type: 'generate-posting-requests', teamId: 0 }));
  expect(r.ok, r.error).toBe(true);
  const next = r.world, old = structuredClone(next);
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

it('publishes one complete CPU phase alongside human wishes and restores terminal CPU results', async () => {
  expect((await saveGame(current.world)).ok).toBe(true); current.world = await loadGame(); context();
  const next = candidate(current.world);
  expect((await commitEconomyCandidate(next, expected, bindings)).ok).toBe(true);
  const cold = await loadGame(), engine = cold.contractEconomy.engine;
  expect(engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(2);
  expect(engine.transactions.at(-1).annualPostingPhase).toBeDefined();
  expect(engine.postingApplications.some(r => r.kind === 'decision')).toBe(true);
  expect(engine.postingMarketResults.length).toBeGreaterThan(0);
  expect(cold.contractEconomy.revision).toBe(1);
});

it('rejects phase parent backfilled over already published CPU decisions and markets', async () => {
  const next = candidate(current.world), old = structuredClone(next);
  old.contractEconomy.engine.transactions.pop(); old.contractEconomy.revision--;
  for (const t of old.contractEconomy.engine.transactions) delete t.cpuPostingDecision;
  expect(validateEconomySave(old)).toBe('annual'); expect((await saveGame(old)).ok).toBe(true);
  const before = roots();
  expect(await saveGame(next)).toMatchObject({ ok: false, reason: 'economy_history_conflict' });
  expect(roots()).toEqual(before);
});
it('runs the real twelve-club phase through one publication and preserves retirement/renewal conflicts', async () => {
  const { fromAnnualState, toAnnualState } = await import('../src/engine/contractEconomy');
  const { createSeasonContract } = await import('../src/engine/seasonContract');
  const { isIkuseiPlayer } = await import('../src/engine/rosterCapacity');
  let w = requestGenerationWorld({ realRoster: true, natural: true });
  const club = w.teams[1], controlled = [...club.players, ...club.farm].filter(p => !isIkuseiPlayer(p));
  const retiring = controlled[0], expiring = controlled.filter(p => p.contractYearsLeft === 1 && p.id !== retiring.id).slice(0, 2);
  expect(expiring).toHaveLength(2);
  // A reservation is made in the current season before the annual posting clock.
  w.contractEconomy.clock = { season: 2026, phase: 'season', date: '2026-11-30', offseasonTurn: 0 };
  w.schedule[w.gameDay] = { date: { month: 11, day: 30 } };
  w.contractEconomy.engine.spending.budgetSeason = 2026;
  w = fromAnnualState(w, toAnnualState(w));
  let r = reduceEconomyCommand(w, envelope(w, { id: 'real-retirement', type: 'reserve-retirement',
    teamId: club.id, playerId: retiring.id, contractId: retiring.contractId }));
  expect(r.ok, r.error).toBe(true); w = r.world;
  w.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
  w.contractEconomy.engine.spending.budgetSeason = 2027;
  w = fromAnnualState(w, toAnnualState(w));
  for (const [i, p] of expiring.entries()) {
    const proposal = { id: `real-renewal-${i}`, type: 'sign', teamId: club.id, effectiveDate: '2027-02-01',
      contract: createSeasonContract({ contractId: `real-future-${i}`, playerId: p.id, signedSeason: 2026,
        agreementPhase: 'offseason', purpose: 'renewal', termYears: 1, annualSalaryManYen: p.salary,
        guaranteed: true, registrationType: 'controlled' }) };
    r = reduceEconomyCommand(w, envelope(w, { id: `real-offer-${i}`, type: 'offer-renewal', contractId: p.contractId, proposal }));
    expect(r.ok, r.error).toBe(true); w = r.world;
    if (i === 1) {
      r = reduceEconomyCommand(w, envelope(w, { id: 'real-accept', type: 'accept-renewal', proposalId: proposal.id, contractId: p.contractId }));
      expect(r.ok, r.error).toBe(true); w = r.world;
    }
  }
  current.world = w;
  expect((await saveGame(w)).ok).toBe(true); current.world = await loadGame(); context();
  const start = performance.now(), next = candidate(current.world), reducedMs = performance.now() - start;
  const cpuGeneration = next.contractEconomy.engine.transactions.find(t => t.generatedPostingRequests?.teamId === club.id).generatedPostingRequests;
  const candidates = cpuGeneration.candidates.map(r => r.inputs.playerId);
  expect(candidates).not.toContain(retiring.id);
  for (const p of expiring) expect(candidates).not.toContain(p.id);
  const development = w.teams.flatMap(t => [...t.players, ...t.farm]).filter(isIkuseiPlayer).map(p => p.id);
  expect(next.contractEconomy.engine.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(12);
  expect(next.contractEconomy.engine.transactions.flatMap(t => t.generatedPostingRequests?.candidates ?? []).every(c => !development.includes(c.inputs.playerId))).toBe(true);
  let publications = 0; const write = localStorage.setItem;
  localStorage.setItem = (k, v) => { if (k === primary) publications++; write(k, v); };
  const saving = performance.now(); expect((await commitEconomyCandidate(next, expected, bindings)).ok).toBe(true);
  const commitMs = performance.now() - saving, cold = await loadGame();
  expect(publications).toBe(1); expect(cold.contractEconomy).toEqual(next.contractEconomy);
  const phase = next.contractEconomy.engine.transactions.at(-1).annualPostingPhase;
  // Report measurements without asserting machine-dependent timing.
  console.info(`REAL12_POSTING ${JSON.stringify({ reducedMs: Math.round(reducedMs), commitMs: Math.round(commitMs), publications,
    wishes: next.contractEconomy.engine.postingApplications.filter(r => r.kind === 'request').length,
    cpuDecisions: phase.decisions.length, markets: phase.marketIds.length })}`);
}, 60000);
