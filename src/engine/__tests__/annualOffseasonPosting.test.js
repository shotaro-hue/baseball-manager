import { expect, it } from 'vitest';
import { offseasonPostingWorld } from './fixtures/offseasonPosting';
import { wrap, finish } from './fixtures/annualRetirements';
import { freezeEconomy } from './fixtures/economyWorld';
import { reduceEconomyCommand, reduceEconomyCommandAsync, toAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { postingApplicationViews } from '../annualPostingApplications';
import { contractLiabilityRows } from '../contractLedger';
import { requestGenerationWorld } from './fixtures/postingRequestGeneration';
import { cpuPostingBudgetWorld } from './fixtures/cpuPostingBudget';
import { postingGenerationRequest, reducePostingGenerationRequest, offseasonPostingRequest, reduceOffseasonPostingRequest } from '../humanPosting';
import { quoteAnnualSpendingPlan } from '../annualSpending';

const command = w => wrap(w, { id: JSON.stringify(['offseason-posting', w.year]), type: 'prepare-offseason-posting', humanTeamId: w.myId });

it('finalizes saved active/farm/CPU retirements before posting with current stats, retained guarantees and one revision', () => {
  const w = freezeEconomy(offseasonPostingWorld()), before = structuredClone(w);
  const r = reduceEconomyCommand(w, command(w));
  expect(r.ok, r.error).toBe(true);
  const n = r.world, e = n.contractEconomy.engine;
  expect(n.contractEconomy.revision).toBe(w.contractEconomy.revision + 1);
  expect(e.retirementReservations.every(r => r.finalization)).toBe(true);
  for (const old of w.contractEconomy.engine.retirementReservations) {
    const history = n.teams.find(t => t.id === old.teamId).history.filter(p => p.retirementReservationId === old.id);
    expect(history).toHaveLength(1);
    expect(history[0].recentCareerLog[0]).toMatchObject({ year: 2026, stats: { HR: 27 } });
    expect(history[0].playoffStats).toEqual({ G: 8, HR: 3 });
    expect(e.postingApplications.some(r => r.playerId === old.playerId)).toBe(false);
    const liabilities = contractLiabilityRows(e.spending.ledger).filter(r => r.playerId === old.playerId && r.season > 2026);
    expect(liabilities.length).toBeGreaterThan(0); expect(liabilities.every(r => r.kind === 'guarantee')).toBe(true);
  }
  for (const t of n.teams) for (const p of [...t.players, ...t.farm]) {
    const old = w.teams.flatMap(t => [...t.players, ...t.farm]).find(x => x.id === p.id);
    expect(p.stats).toEqual(old.stats); expect(p.age).toBe(old.age); expect(p.batting).toEqual(old.batting);
  }
  expect(postingApplicationViews(toAnnualState(n)).filter(r => r.teamId === w.myId).every(r => r.status === 'pending')).toBe(true);
  expect(e.transactions.at(-1).annualOffseasonPosting).toBeDefined();
  expect(validateEconomySave(JSON.parse(JSON.stringify(n)))).toBe('annual');
  expect(reduceEconomyCommand(n, command(w))).toMatchObject({ ok: true, world: n, replayed: true });
  expect(reduceEconomyCommand(w, command(w))).toEqual(r); expect(w).toEqual(before);
});

it('keeps retirement deficits while CPU refuses additional unaffordable departures', () => {
  const w = offseasonPostingWorld({ baseWorld: cpuPostingBudgetWorld({ headroom: 0 }) });
  const r = reduceEconomyCommand(w, command(w)); expect(r.ok, r.error).toBe(true);
  const e = r.world.contractEconomy.engine, phase = e.transactions.find(t => t.annualPostingPhase).annualPostingPhase;
  expect(e.retirementReservations.every(r => r.finalization)).toBe(true);
  expect(phase.decisions.map(d => [d.decision, d.reason])).toEqual([['reject', 'future-budget']]);
  expect(phase.marketIds).toEqual([]);
  expect(quoteAnnualSpendingPlan(toAnnualState(r.world).spending).find(r => r.teamId === 1 && r.season === 2028))
    .toMatchObject({ remainingManYen: -420, minimumRosterReserveManYen: 420, guaranteeManYen: 1000 });
});

it('reuses a published old posting phase without modifying decisions or re-running markets', () => {
  const w = requestGenerationWorld(), old = reducePostingGenerationRequest(w, postingGenerationRequest(w));
  expect(old.ok, old.error).toBe(true);
  const r = reduceEconomyCommand(old.world, command(old.world)); expect(r.ok, r.error).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.slice(0, -1)).toEqual(old.world.contractEconomy.engine.transactions);
  expect(r.world.contractEconomy.engine.transactions.at(-1).annualOffseasonPosting).toMatchObject({
    createdPostingPhase: false, finalizationIds: [] });
  expect(economyOverwriteIssue(old.world, r.world)).toBeNull();
});
it('saves an empty retirement and wish year once without inventing decisions or changing budgets', () => {
  const w = requestGenerationWorld({ interested: false }), r = reduceEconomyCommand(w, command(w));
  expect(r.ok, r.error).toBe(true);
  const e = r.world.contractEconomy.engine;
  expect(e.transactions.at(-1).annualOffseasonPosting.finalizationIds).toEqual([]);
  expect(e.transactions.find(t => t.annualPostingPhase).annualPostingPhase.decisions).toEqual([]);
  expect(e.spending).toEqual(w.contractEconomy.engine.spending); expect(r.world.teams).toEqual(w.teams);
  expect(reduceEconomyCommand(r.world, command(w))).toMatchObject({ ok: true, replayed: true, world: r.world });
});

it('rejects a wish check published before pending retirement finalization without changing old receipts', () => {
  const w = offseasonPostingWorld(), old = reducePostingGenerationRequest(w, postingGenerationRequest(w));
  expect(old.ok, old.error).toBe(true);
  const before = structuredClone(old.world), r = reduceEconomyCommand(freezeEconomy(old.world), command(old.world));
  expect(r.ok).toBe(false); expect(r.world).toBe(old.world); expect(old.world).toEqual(before);
});

it('accepts already finalized reservations and uses the same native async result', async () => {
  const w = offseasonPostingWorld(), finalized = reduceEconomyCommand(w, finish(w)); expect(finalized.ok).toBe(true);
  const r = reduceEconomyCommand(finalized.world, command(finalized.world)); expect(r.ok, r.error).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.at(-1).annualOffseasonPosting.finalizationIds).toHaveLength(1);
  expect(await reduceEconomyCommandAsync(finalized.world, command(finalized.world))).toEqual(r);
});

it.each([
  ['contract ledger', w => { w.contractEconomy.engine.spending.ledger.records[0].contract.playerId = 'wrong'; }],
  ['budget evidence', w => { w.contractEconomy.budgetPolicies[0].approvedManYen++; }],
  ['human authority', (w, c) => { c.transaction.humanTeamId = 1; }],
  ['revision', (w, c) => { c.baseRevision--; }],
  ['phase', w => { w.contractEconomy.clock.phase = 'season'; }],
])('fails explicitly on invalid %s and keeps the source', (_, edit) => {
  const w = offseasonPostingWorld(), c = command(w); edit(w, c); const before = structuredClone(w);
  const r = reduceEconomyCommand(freezeEconomy(w), c);
  expect(r.ok).toBe(false); expect(r.error).toBeTruthy(); expect(r.world).toBe(w); expect(w).toEqual(before);
});

it.each(['delete child', 'alter parent', 'order'])('rejects corrupted persisted entry evidence: %s', edit => {
  const w = offseasonPostingWorld(), r = reduceEconomyCommand(w, command(w)); expect(r.ok).toBe(true);
  const n = r.world, ts = n.contractEconomy.engine.transactions, g = ts.at(-1).annualOffseasonPosting;
  if (edit === 'delete child') ts.splice(ts.findIndex(t => t.id === g.finalizationIds[0]), 1);
  if (edit === 'alter parent') g.finalizedReservationIds.pop();
  if (edit === 'order') { const i = ts.findIndex(t => t.id === g.finalizationIds[0]); ts.splice(ts.length - 1, 0, ...ts.splice(i, 1)); }
  expect(() => validateEconomySave(n)).toThrow();
});

it('rejects backfilling new-child claims onto a previously published phase', () => {
  const w = requestGenerationWorld(), old = reducePostingGenerationRequest(w, postingGenerationRequest(w)).world;
  const n = reduceEconomyCommand(old, command(old)).world;
  n.contractEconomy.engine.transactions.at(-1).annualOffseasonPosting.createdPostingPhase = true;
  expect(validateEconomySave(n)).toBe('annual');
  expect(economyOverwriteIssue(old, n)).toBe('economy_history_conflict');
});
it.each(['saveId', 'epoch', 'baseRevision', 'season', 'date', 'teamId'])('rejects stale entry request %s', field => {
  const w = offseasonPostingWorld(), request = offseasonPostingRequest(w);
  request[field] = typeof request[field] === 'number' ? request[field] + 1 : 'other';
  expect(reduceOffseasonPostingRequest(w, request)).toMatchObject({ ok: false, world: w });
});
it('prepares the real twelve-club roster with reservations and one revision', async () => {
  const w = offseasonPostingWorld({ realRoster: true, natural: true }), start = performance.now();
  const r = await reduceEconomyCommandAsync(w, command(w)); expect(r.ok, r.error).toBe(true);
  const e = r.world.contractEconomy.engine;
  expect(e.transactions.filter(t => t.generatedPostingRequests)).toHaveLength(12);
  expect(e.retirementReservations.every(r => r.finalization)).toBe(true);
  expect(r.world.contractEconomy.revision).toBe(w.contractEconomy.revision + 1);
  expect(validateEconomySave(r.world)).toBe('annual');
  console.log(`OFFSEASON_POSTING_REAL12 ${Math.round(performance.now() - start)}ms`);
}, 60000);
