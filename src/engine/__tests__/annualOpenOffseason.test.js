import { beforeAll, expect, it, vi } from 'vitest';
import { closedPostseasonWorld, completedPlayoff, closeNativePostseason } from './fixtures/openOffseason';
import { budgetForecastWorld, observedFinance } from './fixtures/budgetForecast';
import { freezeEconomy } from './fixtures/economyWorld';
import { createInitialTeams } from '../bootstrapTeams';
import { economyClockFor, validateEconomyClock } from '../economyCalendar';
import { contractEconomyMode, toAnnualState, reduceEconomyCommand, ANNUAL_ECONOMY_RELEASE_ENABLED } from '../contractEconomy';
import { reserve, wrap } from './fixtures/annualRetirements';
import { retirementIncomeCommand } from './fixtures/retirementIncome';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { forecastNextAnnualBudget } from '../annualBudgetForecast';
import { initPlayoff } from '../playoff';
const json = v => JSON.parse(JSON.stringify(v));
let requestFor, reduce;
beforeAll(async () => {
  ({ openOffseasonRequest: requestFor, reduceOpenOffseasonRequest: reduce } = await import('../annualOpenOffseason').catch(() => ({})));
});
const request = w => { expect(requestFor).toBeTypeOf('function'); return requestFor(w); };
const run = (w, r = request(w)) => { expect(reduce).toBeTypeOf('function'); return reduce(w, r); };
const opened = w => { const r = run(w); expect(r.ok, r.error).toBe(true); return r.world; };

it('accepts only the exact saved closing date while the official clock still rejects 144/145', () => {
  const w = closedPostseasonWorld();
  expect(validateEconomyClock(w)).toBe(true); expect(contractEconomyMode(w)).toBe('annual');
  for (const gameDay of [144, 145]) expect(() => economyClockFor({ season: w.year, phase: 'season', schedule: w.schedule, gameDay })).toThrow();
  const before = json(w), q = opened(freezeEconomy(w));
  expect(validateEconomyClock(q, w)).toBe(true); expect(w).toEqual(before);
});

it('builds one revision with all future approvals from real bootstrap finance and retains the complete closed year', () => {
  const w = closedPostseasonWorld(createInitialTeams()), before = json(w);
  const forecast = forecastNextAnnualBudget(w), q = opened(freezeEconomy(w)), e = q.contractEconomy;
  expect(q).toMatchObject({ year: 2026, gameDay: 144, saveId: w.saveId, myId: 0 });
  expect(e).toMatchObject({ schemaVersion: 1, mode: 'annual', epoch: w.contractEconomy.epoch, revision: 1,
    clock: { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 }, cycle: { season: 2026, stage: 'offseason-open' } });
  expect(e.cycle.transitionReceipts).toHaveLength(1);
  expect(e.cycle.transitionReceipts[0]).toMatchObject({ id: JSON.stringify([w.saveId, e.epoch, 2026, 'open-offseason']),
    kind: 'open-offseason', version: 1, season: 2026, closingDate: w.contractEconomy.clock.date,
    baseRevision: 0, revision: 1, budgetSeason: 2027, endSeason: 2034 });
  for (const [actual, quoted, old] of [[e.budgetPolicies, forecast.quote.budgetPolicies, w.contractEconomy.budgetPolicies],
    [e.engine.rosterRequirements, forecast.quote.rosterRequirements, w.contractEconomy.engine.rosterRequirements]]) {
    expect(actual.filter(p => p.season <= 2026)).toEqual(old.filter(p => p.season <= 2026));
    expect(actual.filter(p => p.season >= 2027)).toEqual(quoted); expect(actual).toHaveLength(108);
  }
  const approvals = rows => rows.map(({ teamId, season, approvedManYen }) => ({ teamId, season, approvedManYen }));
  expect(approvals(e.engine.spending.authorizations.filter(p => p.season >= 2027))).toEqual(approvals(forecast.quote.authorizations));
  expect(e.engine.spending.authorizations.filter(p => p.season === 2026)).toEqual(w.contractEconomy.engine.spending.authorizations.filter(p => p.season === 2026));
  // Existing projectAnnualState derives the unfunded minimum roster floor.
  // By 2034 every initial contract has expired: 65 controlled slots * 420.
  expect(e.engine.spending.authorizations.filter(p => p.season === 2034).map(p => p.minimumRosterReserveManYen)).toEqual(Array(12).fill(27300));
  expect(e.engine.spending.budgetSeason).toBe(2027);
  expect(e.engine.spending.ledger).toEqual(w.contractEconomy.engine.spending.ledger);
  expect(e.engine.transactions).toEqual(w.contractEconomy.engine.transactions);
  expect(e.incomeReceipts).toEqual(w.contractEconomy.incomeReceipts);
  expect(q.offseasonPlan).toEqual(w.offseasonPlan); expect(q.schedule).toEqual(w.schedule);
  const rows = quoteAnnualSpendingPlan(toAnnualState(q).spending);
  for (const t of q.teams) {
    const old = w.teams.find(x => x.id === t.id);
    expect(t.players).toEqual(old.players); expect(t.farm).toEqual(old.farm); expect(t.clubFinance).toEqual(old.clubFinance);
    expect(t.budget).toBe(rows.find(r => r.teamId === t.id && r.season === 2027).remainingManYen);
    expect(t.wins + t.losses + t.draws).toBe(143);
  }
  expect(q).not.toHaveProperty('budgetForecast'); expect(e).not.toHaveProperty('forecast');
  expect(ANNUAL_ECONOMY_RELEASE_ENABLED).toBe(false); expect(validateEconomySave(q)).toBe('annual');
  expect(w).toEqual(before);
});

it('replays the original or cold-load request without another receipt or revision', () => {
  const w = closedPostseasonWorld(), r = request(w), q = opened(w);
  for (const next of [q, json(q)]) for (const confirmation of [r, request(next)]) {
    const result = run(next, confirmation); expect(result).toMatchObject({ ok: true, replayed: true }); expect(result.world).toBe(next);
  }
  const changed = { ...r, closingDate: '2026-11-30' };
  expect(run(q, changed)).toMatchObject({ ok: false, replayed: false });
});

it('is deterministic across retry, JSON, team order and RNG, retaining lower forecasts even when existing obligations exceed them', () => {
  const w = closedPostseasonWorld(), r = request(w), q = opened(w), input = json(w);
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('unexpected random'); });
  try {
    expect(run(freezeEconomy(json(w)), r).world).toEqual(q);
    const reversed = json(w); reversed.teams.reverse();
    const result = run(reversed, r); expect(result.ok, result.error).toBe(true);
    expect(result.world.contractEconomy).toEqual(q.contractEconomy);
    expect(run(w, r).world).toEqual(q); expect(w).toEqual(input);
  } finally { random.mockRestore(); }
  expect(q.contractEconomy.budgetPolicies.find(p => p.teamId === 0 && p.season === 2027).approvedManYen).toBeLessThan(1000000);
});

it('accepts an extended dated Japan Series through its fourteenth deciding game', () => {
  const w = closedPostseasonWorld(undefined, { extended: true });
  expect(w.offseasonPlan.playoff.jpSeries.games).toHaveLength(14);
  expect(opened(w).contractEconomy.cycle.transitionReceipts[0].closingDate).toBe(w.offseasonPlan.playoff.jpSeries.games[13].date);
});

it('projects a zero approval and deficit without erasing existing contracts or their guarantees', () => {
  const w = closedPostseasonWorld();
  w.teams = w.teams.map(t => ({ ...t, clubFinance: observedFinance(t, w.year, -100) }));
  const q = opened(w), e = q.contractEconomy;
  expect(e.budgetPolicies.filter(p => p.season === 2027).map(p => p.approvedManYen)).toEqual(Array(12).fill(0));
  expect(q.teams.every(t => t.budget < 0)).toBe(true);
  expect(e.engine.spending.ledger).toEqual(w.contractEconomy.engine.spending.ledger);
  expect(e.engine.spending.ledger.records.every(r => r.contract.guaranteed)).toBe(true);
  expect(validateEconomySave(q)).toBe('annual');
});

it.each(['retirement', 'release', 'both'])('carries actual in-season %s receipts through the closing snapshot', mode => {
  let w = budgetForecastWorld(createInitialTeams());
  w.gameDay = 90; w.contractEconomy.clock = economyClockFor({ season: w.year, phase: 'season', schedule: w.schedule, gameDay: w.gameDay });
  w.contractEconomy.cycle.stage = 'playing';
  const p = w.teams[0].farm[0], release = w.teams[0].farm[1];
  const commands = mode === 'release' ? [] : [world => reserve(world, p.id), world => retirementIncomeCommand(world)];
  if (mode !== 'retirement') commands.push(world => wrap(world, { id: 'midseason-release', type: 'enter-market', teamId: 0, playerId: release.id, contractId: release.contractId, reason: 'release' }));
  for (const command of commands) {
    const result = reduceEconomyCommand(w, command(w)); expect(result.ok, result.error).toBe(true); w = result.world;
  }
  w = closeNativePostseason(w);
  expect(validateEconomySave(w)).toBe('annual');
  const before = json(w), q = opened(freezeEconomy(w));
  expect(q.contractEconomy.revision).toBe(commands.length + 1);
  expect(q.contractEconomy.engine.retirementReservations).toEqual(before.contractEconomy.engine.retirementReservations);
  expect(q.contractEconomy.engine.offseasonDepartures).toEqual(before.contractEconomy.engine.offseasonDepartures);
  expect(q.contractEconomy.incomeReceipts).toEqual(before.contractEconomy.incomeReceipts);
  if (mode !== 'release') expect(q.contractEconomy.incomeReceipts[0].amountManYen).toBe(12345);
  expect(q.teams[0].players).toEqual(before.teams[0].players); expect(q.teams[0].farm).toEqual(before.teams[0].farm);
});

it.each([
  ['different save', r => { r.saveId = 'other'; }], ['different epoch', r => { r.epoch = 'other'; }],
  ['future revision', r => { r.baseRevision++; }], ['different season', r => { r.season++; }],
  ['different team', r => { r.teamId = 1; }], ['different closing day', r => { r.closingDate = '2026-11-30'; }],
  ['caller quote', r => { r.quote = {}; }], ['external history', r => { r.financeHistory = []; }],
])('rejects %s in the request before changing the source', (_label, edit) => {
  const w = closedPostseasonWorld(), before = json(w), r = request(w); edit(r);
  const result = run(freezeEconomy(w), r); expect(result).toMatchObject({ ok: false, replayed: false }); expect(result.world).toBe(w); expect(w).toEqual(before);
});

it('rejects a stale confirmation after a newer revision even when the closing date is unchanged', () => {
  const w = closedPostseasonWorld(), r = request(w); w.contractEconomy.revision++;
  expect(run(w, r)).toMatchObject({ ok: false });
});

it.each([
  ['old undated results', w => { w.offseasonPlan.playoff = completedPlayoff(w.teams, w.year); }],
  ['unfinished results', w => { w.offseasonPlan.playoff = initPlayoff(w.teams, { year: w.year, schedule: w.schedule }); }],
  ['removed calendar', w => { delete w.offseasonPlan.playoff.calendar; }],
  ['contradictory wins', w => { w.offseasonPlan.playoff.jpSeries.wins[0]++; }],
  ['wrong champion', w => { w.offseasonPlan.playoff.champion = w.offseasonPlan.playoff.jpSeries.teams[1]; }],
  ['source schedule', w => { delete w.schedule; }],
  ['regular clock inferred from All-Star 144', w => { w.contractEconomy.clock.date = '2026-07-25'; }],
  ['non-boundary game day', w => { w.gameDay = 145; }],
  ['non-boundary stage', w => { w.contractEconomy.cycle.stage = 'playing'; }],
  ['wrong plan season', w => { w.offseasonPlan.year++; }],
  ['wrong plan team', w => { w.offseasonPlan.myId = 1; }],
  ['incomplete official record', w => { w.teams[0].wins--; }],
  ['changed frozen standings', w => { const t = w.teams.find(t => t.id === w.offseasonPlan.playoff.se1.id); t.wins--; t.losses++; }],
])('refuses %s as a native closing clock', (_label, edit) => {
  const w = closedPostseasonWorld(); edit(w); const before = json(w);
  expect(() => validateEconomyClock(freezeEconomy(w))).toThrow();
  expect(w).toEqual(before);
});

it('requires recorded budget coefficients rather than guessing them from an older native explicit approval', () => {
  const w = closedPostseasonWorld();
  w.contractEconomy.budgetPolicies = w.contractEconomy.budgetPolicies.map(p => ({ teamId: p.teamId, season: p.season, approvedManYen: p.approvedManYen }));
  const result = run(w); expect(result).toMatchObject({ ok: false }); expect(result.world).toBe(w);
});

it('leaves legacy and pre-boundary native saves unchanged', () => {
  const original = closedPostseasonWorld(), r = request(original);
  for (const w of [budgetForecastWorld(), { ...original, contractEconomy: undefined },
    { ...original, contractEconomy: { schemaVersion: 1, mode: 'legacy' } }]) {
    const before = json(w); const result = run(w, r);
    expect(result).toMatchObject({ ok: false }); expect(result.world).toBe(w); expect(json(w)).toEqual(before);
  }
});

it.each([
  ['closing date', r => { r.closingDate = '2026-11-30'; }], ['budget season', r => { r.budgetSeason--; }],
  ['missing final year', r => { r.endSeason = 2033; }], ['receipt ID', r => { r.id = 'wrong'; }],
  ['future revision', r => { r.revision++; }], ['missing kind', r => { delete r.kind; }],
])('rejects a saved transition with corrupt %s', (_label, edit) => {
  const w = opened(closedPostseasonWorld()); edit(w.contractEconomy.cycle.transitionReceipts[0]);
  expect(() => validateEconomySave(w)).toThrow();
});

it('rejects duplicated or erased published transition receipts while keeping older opaque receipts compatible', () => {
  const before = closedPostseasonWorld(); before.contractEconomy.cycle.transitionReceipts.push({ old: 'opaque receipt' });
  const w = opened(before), duplicate = json(w); duplicate.contractEconomy.cycle.transitionReceipts.push(json(w.contractEconomy.cycle.transitionReceipts[1]));
  expect(() => validateEconomySave(duplicate)).toThrow();
  const lost = json(w); lost.contractEconomy.revision++; lost.contractEconomy.cycle.transitionReceipts = [];
  expect(economyOverwriteIssue(w, lost)).toBe('economy_history_conflict');
  expect(w.contractEconomy.cycle.transitionReceipts[0]).toEqual({ old: 'opaque receipt' });
});
