import { expect, it, vi } from 'vitest';
import { closedPostseasonWorld } from './fixtures/openOffseason';
import { openOffseasonRequest, reduceOpenOffseasonRequest } from '../annualOpenOffseason';
import { reduceEconomyCommand, reduceEconomyCommandAsync, toAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { contractLiabilityRows } from '../contractLedger';
import { wrap } from './fixtures/annualRetirements';
import { freezeEconomy } from './fixtures/economyWorld';
import { reduceOffseasonPostingRequest, offseasonPostingRequest } from '../humanPosting';
import { createInitialTeams } from '../bootstrapTeams';
import { yearEndReviewWorld } from './fixtures/yearEndRetirements';
import { yearEndRetirementCandidates } from '../annualYearEndRetirements';
import { budgetForecastWorld } from './fixtures/budgetForecast';
import { closeNativePostseason } from './fixtures/openOffseason';
import { economyClockFor } from '../economyCalendar';
import { retirementCareerEntries } from '../annualRetirements';

function winter() {
  const w = closedPostseasonWorld();
  w.teams.forEach(t => t.players.forEach(p => { p.age = t.id < 2 ? 42 : 20; p.retireStyle = 100; }));
  return reduceOpenOffseasonRequest(w, openOffseasonRequest(w)).world;
}
const command = (w, decisions = [{ playerId: w.teams[0].players[0].id, choice: 'accept' }]) => wrap(w, {
  id: JSON.stringify(['year-end-retirements', w.year]), type: 'prepare-year-end-retirements', humanTeamId: w.myId, decisions,
});

it('saves human and CPU year-end retirements from the PR-C boundary with retained guarantees and final career', () => {
  const w = freezeEconomy(winter()), before = structuredClone(w), c = command(w), r = reduceEconomyCommand(w, c);
  expect(r.ok, r.error).toBe(true);
  const n = r.world, e = n.contractEconomy.engine;
  expect(n.contractEconomy.revision).toBe(w.contractEconomy.revision + 1);
  expect(n.year).toBe(w.year); expect(n.gameDay).toBe(w.gameDay);
  expect(n.offseasonPlan.playoff).toEqual(w.offseasonPlan.playoff);
  expect(e.retirementReservations).toHaveLength(2);
  for (const t of w.teams.slice(0, 2)) {
    const p = t.players[0], reservation = e.retirementReservations.find(r => r.playerId === p.id);
    expect(reservation).toMatchObject({ origin: 'year-end', notifiedDate: '2026-12-01', effectiveDate: '2026-12-01', gameDay: 144 });
    expect(reservation.finalization.careerEntry).toMatchObject({ year: 2026, stats: p.stats });
    expect(n.teams.find(a => a.id === t.id).players).toEqual([]);
    expect(n.teams.find(a => a.id === t.id).history[0]).toMatchObject({ retirementReservationId: reservation.id });
    expect(contractLiabilityRows(e.spending.ledger).filter(row => row.playerId === p.id && row.season > 2026)
      .every(row => row.kind === 'guarantee')).toBe(true);
  }
  expect(n.teams.slice(2).map(t => t.players)).toEqual(w.teams.slice(2).map(t => t.players));
  expect(e.transactions.at(-1).yearEndRetirements.candidates.map(c => c.outcome)).toEqual(['accepted', 'accepted']);
  expect(validateEconomySave(JSON.parse(JSON.stringify(n)))).toBe('annual');
  expect(economyOverwriteIssue(w, n)).toBeNull();
  expect(reduceEconomyCommand(n, c)).toMatchObject({ ok: true, replayed: true, world: n });
  expect(reduceEconomyCommand(w, c)).toEqual(r); expect(w).toEqual(before);
});

it.each([[0, 'retained'], [100, 'retain_failed']])('resolves retain intent in the domain with style %s', (retireStyle, outcome) => {
  const w = winter(), p = w.teams[0].players[0]; p.retireStyle = retireStyle;
  const c = command(w, [{ playerId: p.id, choice: 'retain' }]);
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('global RNG'); });
  let r; try { r = reduceEconomyCommand(w, c); } finally { random.mockRestore(); }
  expect(r.ok, r.error).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements.candidates[0].outcome).toBe(outcome);
  expect(r.world.teams[0].players.some(a => a.id === p.id)).toBe(outcome === 'retained');
});

it('records a zero-candidate year and hands its unchanged players to separate posting', async () => {
  const w = winter(); w.teams.forEach(t => t.players.forEach(p => { p.age = 20; }));
  const c = command(w, []), r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true);
  expect(r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements.candidates).toEqual([]);
  expect(r.world.teams).toEqual(w.teams);
  expect(await reduceEconomyCommandAsync(w, c)).toEqual(r);
  const posting = reduceOffseasonPostingRequest(r.world, offseasonPostingRequest(r.world));
  expect(posting.ok, posting.error).toBe(true);
});

it.each([
  ['missing decision', (w, c) => { c.transaction.decisions = []; }],
  ['client outcome', (w, c) => { c.transaction.decisions[0].choice = 'retained'; }],
  ['CPU authority', (w, c) => { c.transaction.humanTeamId = 1; }],
  ['other player', (w, c) => { c.transaction.decisions[0].playerId = w.teams[1].players[0].id; }],
  ['duplicate decision', (w, c) => { c.transaction.decisions.push(c.transaction.decisions[0]); }],
  ['wrong day', w => { w.contractEconomy.clock.date = '2026-12-02'; }],
  ['stale revision', (w, c) => { c.baseRevision--; }],
])('rejects %s and preserves the entire source', (_, edit) => {
  const w = winter(), c = command(w); edit(w, c); const before = structuredClone(w);
  expect(reduceEconomyCommand(freezeEconomy(w), c)).toMatchObject({ ok: false, world: w }); expect(w).toEqual(before);
});

it('refuses to insert fresh retirement decisions after posting while keeping that old save readable', () => {
  const w = winter(), p = reduceOffseasonPostingRequest(w, offseasonPostingRequest(w)); expect(p.ok).toBe(true);
  expect(validateEconomySave(p.world)).toBe('annual');
  expect(reduceEconomyCommand(p.world, command(p.world))).toMatchObject({ ok: false, world: p.world });
});

it.each(['outcome', 'inputs', 'child', 'order'])('rejects corrupt year-end evidence: %s', edit => {
  const w = winter(), r = reduceEconomyCommand(w, command(w)); expect(r.ok, r.error).toBe(true);
  const n = r.world, ts = n.contractEconomy.engine.transactions, g = ts.at(-1).yearEndRetirements;
  if (edit === 'outcome') g.candidates[0].outcome = 'retained';
  if (edit === 'inputs') g.candidates[0].inputs.age = 20;
  if (edit === 'child') ts.splice(ts.findIndex(t => t.id === g.finalizationIds[0]), 1);
  if (edit === 'order') ts.unshift(ts.pop());
  expect(() => validateEconomySave(n)).toThrow();
});

it('uses the actual twelve-club bootstrap roster including farm and preserves each surviving player', async () => {
  const w = yearEndReviewWorld(createInitialTeams()), before = structuredClone(w), start = performance.now();
  const candidates = yearEndRetirementCandidates(toAnnualState(w), w.myId);
  const d = candidates.filter(r => r.teamId === w.myId).map(r => ({ playerId: r.playerId, choice: 'accept' }));
  const r = await reduceEconomyCommandAsync(freezeEconomy(w), command(w, d)); expect(r.ok, r.error).toBe(true);
  const n = r.world, g = n.contractEconomy.engine.transactions.at(-1).yearEndRetirements;
  expect(g.candidates).toHaveLength(candidates.length); expect(candidates.length).toBeGreaterThan(12);
  for (const t of n.teams) for (const p of [...t.players, ...t.farm]) {
    const old = before.teams.find(a => a.id === t.id);
    expect(p).toEqual([...old.players, ...old.farm].find(a => a.id === p.id));
  }
  expect(retirementCareerEntries(n, w)).toHaveLength(g.finalizationIds.length);
  expect(validateEconomySave(JSON.parse(JSON.stringify(n)))).toBe('annual'); expect(w).toEqual(before);
  console.log('YEAR_END_REAL12', Math.round(performance.now() - start), 'ms', g.finalizationIds.length, 'retired');
}, 60_000);

it('combines a genuine in-season reservation with farm year-end choices without duplicate finalization', () => {
  let w = budgetForecastWorld(); w.gameDay = 120;
  w.contractEconomy.clock = economyClockFor({ season: w.year, phase: 'season', gameDay: w.gameDay, schedule: w.schedule });
  const p = w.teams[0].players[0];
  const reserved = reduceEconomyCommand(w, wrap(w, { id: 'reserved-first', type: 'reserve-retirement', teamId: 0, playerId: p.id, contractId: p.contractId }));
  expect(reserved.ok, reserved.error).toBe(true); w = reserved.world;
  const t = w.teams[1], farm = t.players.pop(); farm.age = 42; farm.retireStyle = 100; t.farm.push(farm);
  closeNativePostseason(w); w = reduceOpenOffseasonRequest(w, openOffseasonRequest(w)).world;
  const r = reduceEconomyCommand(w, command(w, [])); expect(r.ok, r.error).toBe(true);
  const g = r.world.contractEconomy.engine.transactions.at(-1).yearEndRetirements;
  expect(g.candidates.map(r => r.playerId)).toEqual([farm.id]);
  expect(g.finalizedReservationIds).toContain('reserved-first'); expect(g.finalizationIds).toHaveLength(2);
  expect(r.world.teams[1].farm).toEqual([]); expect(validateEconomySave(r.world)).toBe('annual');
});

it('makes player/club order and unrelated random draws irrelevant to stored decisions', () => {
  const w = winter(), c = command(w, [{ playerId: w.teams[0].players[0].id, choice: 'retain' }]);
  const a = reduceEconomyCommand(w, c); expect(a.ok, a.error).toBe(true);
  const other = structuredClone(w); other.teams.reverse();
  for (let i = 0; i < 20; i++) Math.random();
  const b = reduceEconomyCommand(other, c); expect(b.ok, b.error).toBe(true);
  expect(b.world.contractEconomy.engine.transactions).toEqual(a.world.contractEconomy.engine.transactions);
});
