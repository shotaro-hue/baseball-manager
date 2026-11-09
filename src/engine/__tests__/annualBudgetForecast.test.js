import { beforeAll, expect, it, vi } from 'vitest';
import { createInitialTeams } from '../bootstrapTeams';
import { forecastClubFinance, applyClubGameFinance, startClubFinance } from '../clubFinance';
import { reduceEconomyCommand, fromAnnualState, toAnnualState } from '../contractEconomy';
import { generateSeasonSchedule } from '../scheduleGen';
import { economyPolicy, freezeEconomy } from './fixtures/economyWorld';
import { completion } from './fixtures/postingIncome';
import { reserve, wrap } from './fixtures/annualRetirements';
import { atDate } from './fixtures/inSeasonDepartures';
import { budgetForecastWorld, forecastSettings, closeFinance, observedFinance } from './fixtures/budgetForecast';
const json = value => JSON.parse(JSON.stringify(value));
let forecast, nextQuote;
beforeAll(async () => {
  ({ forecastNextAnnualBudget: forecast } = await import('../annualBudgetForecast').catch(() => ({})));
  ({ quoteNextAnnualBudgetPolicy: nextQuote } = await import('../annualBudgetPolicy'));
});
const build = (w, options) => { expect(forecast).toBeTypeOf('function'); return forecast(w, options); };
const first = result => result.policy.forecasts.find(r => r.teamId === 0 && r.season === 2027);
const evidence = result => result.evidence.find(r => r.teamId === 0 && r.season === 2027);
const denied = (w, options) => {
  expect(forecast).toBeTypeOf('function');
  const before = json(w); expect(() => build(freezeEconomy(w), options)).toThrow(); expect(w).toEqual(before);
};

it('quotes the entire next-season horizon without changing the current season or budget', () => {
  const w = budgetForecastWorld(), before = json(w);
  const p = { ...forecastSettings(), forecasts: w.teams.flatMap(t => Array.from({ length: 8 }, (_, i) => ({
    teamId: t.id, season: 2027 + i, source: 'observed', operatingSurplusesManYen: [10000],
    supportManYen: 7, previousApprovedManYen: i === 0 ? 1000000 : null,
  }))) };
  expect(nextQuote).toBeTypeOf('function');
  const q = nextQuote(freezeEconomy(w), p);
  expect(q.authorizations).toHaveLength(96);
  expect(q.authorizations[0]).toMatchObject({ teamId: 0, season: 2027, approvedManYen: 5007 });
  expect(q.authorizations.at(-1)).toMatchObject({ teamId: 11, season: 2034 });
  expect(w).toEqual(before);
});

it('generates all 12 clubs and eight needed years from actual bootstrap rosters and game receipts', () => {
  const w = budgetForecastWorld(createInitialTeams());
  w.teams = w.teams.map(t => ({ ...t, clubFinance: closeFinance(t, 2026, w.teams) }));
  const before = json(w), r = build(freezeEconomy(w));
  expect(r).toMatchObject({ budgetSeason: 2027, endSeason: 2034 });
  expect(r.policy.forecasts).toHaveLength(96); expect(r.quote.budgetPolicies).toHaveLength(96);
  for (const t of w.teams) {
    const f = r.policy.forecasts.find(f => f.teamId === t.id && f.season === 2027);
    expect(f.source).toBe('observed'); expect(f.operatingSurplusesManYen).toEqual([t.clubFinance.operatingSurplus]);
    expect(r.policy.forecasts.find(f => f.teamId === t.id && f.season === 2028).source).toBe('profile');
  }
  expect(w).toEqual(before);
});

it.each([0, -10000, 10000])('keeps an actual %s surplus as observed, including zero and deficit', surplus => {
  const w = budgetForecastWorld(); w.teams[0].clubFinance = observedFinance(w.teams[0], 2026, surplus);
  const r = build(w);
  expect(first(r)).toMatchObject({ source: 'observed', operatingSurplusesManYen: [surplus], previousApprovedManYen: 1000000 });
  expect(r.quote.budgetPolicies[0].approvedManYen).toBe(surplus > 0 ? 5000 : 0);
  expect(evidence(r).samples[0]).toMatchObject({ season: 2026, source: 'observed', basis: 'club-finance', operatingSurplusManYen: surplus });
});

it('uses profile evidence for absent finance, ignoring legacy budget and revenue totals', () => {
  const w = budgetForecastWorld(); delete w.teams[0].clubFinance;
  const a = build(w); w.teams.forEach(t => { t.budget = -999999999; t.revenueThisSeason = 999999999; });
  expect(build(w)).toEqual(a);
  expect(first(a).source).toBe('profile');
  expect(evidence(a).samples[0]).toMatchObject({ source: 'estimated', basis: 'profile' });
  expect(first(a).operatingSurplusesManYen[0]).toBeGreaterThan(0);
});

it('uses real partial-year receipts plus the existing remaining forecast, without calling it observed', () => {
  const w = budgetForecastWorld(), t = w.teams[0];
  w.teams[0] = applyClubGameFinance(t, { year: 2026, gameDay: 1, isHomeTeam: w.schedule[1].matchups.some(m => m.homeId === 0) });
  const expected = forecastClubFinance(w.teams[0], w.schedule).operatingSurplus;
  const r = build(w);
  expect(first(r)).toMatchObject({ source: 'profile', operatingSurplusesManYen: [expected.min] });
  expect(evidence(r).samples[0]).toMatchObject({ source: 'estimated', basis: 'remaining-season', range: expected });
});

it('smooths three separately dated observations and retains zero in the window', () => {
  const w = budgetForecastWorld(); w.teams[0].clubFinance = observedFinance(w.teams[0], 2026, 30000);
  const financeHistory = [2024, 2025].map((season, i) => ({ teamId: 0, finance: observedFinance(w.teams[0], season, i === 0 ? 0 : 60000) }));
  const r = build(w, { policy: forecastSettings(3), financeHistory });
  expect(first(r)).toMatchObject({ source: 'observed', operatingSurplusesManYen: [0, 60000, 30000] });
  expect(r.quote.budgetPolicies[0].approvedManYen).toBe(15000);
  expect(evidence(r).samples.map(s => s.season)).toEqual([2024, 2025, 2026]);
  expect(r.policy.forecasts.find(f => f.teamId === 1 && f.season === 2027).source).toBe('profile');
});

it('reuses recorded coefficients and team support rather than adding a production default', () => {
  const w = budgetForecastWorld();
  for (const p of w.contractEconomy.budgetPolicies) p.supportManYen = 321;
  // Keep the pre-existing generated approval internally consistent.
  for (const p of w.contractEconomy.budgetPolicies) p.approvedManYen += 321;
  for (const p of w.contractEconomy.engine.spending.authorizations) p.approvedManYen += 321;
  const r = build(w);
  expect(r.policy).toMatchObject({ policyVersion: 'forecast-test', allocationPercent: 50, smoothingYears: 1, maxChangePercent: 100 });
  expect(first(r)).toMatchObject({ supportManYen: 321, previousApprovedManYen: 1000321 });
});

it('is deterministic after JSON and reordering, consumes no randomness, and leaves inputs untouched', () => {
  const w = budgetForecastWorld(), options = { policy: forecastSettings(3) }, before = json({ w, options });
  const rng = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('unexpected random draw'); });
  try {
    const a = build(freezeEconomy(w), freezeEconomy(options)), b = json(w);
    b.teams.reverse(); b.contractEconomy.budgetPolicies.reverse(); b.contractEconomy.engine.spending.authorizations.reverse();
    const o = json(options); o.policy.supports.reverse();
    expect(build(b, o)).toEqual(a); expect({ w, options }).toEqual(before);
  } finally { rng.mockRestore(); }
});

it('keeps posting money out of normal forecasts and the prior base, granting only its next-year supplement', () => {
  const teams = createInitialTeams();
  // Explicit continuing native terms make the spring envelope valid. This
  // does not implement renewals or advance production legacy contracts.
  for (const t of teams) for (const p of [...t.players, ...t.farm]) p.contractYearsLeft = 3;
  let w = budgetForecastWorld(teams);
  const q = build(w).quote;
  const keep = rows => rows.filter(r => r.season === w.year);
  w.contractEconomy.budgetPolicies = [...keep(w.contractEconomy.budgetPolicies), ...q.budgetPolicies];
  w.contractEconomy.engine.spending.authorizations = [...keep(w.contractEconomy.engine.spending.authorizations), ...q.authorizations];
  w.contractEconomy.engine.rosterRequirements = [...keep(w.contractEconomy.engine.rosterRequirements), ...q.rosterRequirements];
  w.teams[0].players[0].postingRequested = true;
  w.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
  w.contractEconomy.engine.spending.budgetSeason = 2027;
  const before = build(w), c = completion(w, {}, 0, w.teams[0].players[0].id);
  const applied = reduceEconomyCommand(w, c); expect(applied.ok, applied.error).toBe(true); w = applied.world;
  const after = build(w);
  expect(after.policy).toEqual(before.policy); expect(after.evidence).toEqual(before.evidence);
  const allowance = (r, year) => r.quote.authorizations.find(a => a.teamId === 0 && a.season === year).approvedManYen;
  expect(allowance(after, 2027) - allowance(before, 2027)).toBe(253125);
  expect(allowance(after, 2028)).toBe(allowance(before, 2028));
  // A spring envelope probe, not a production rollover. The prior year's
  // posting supplement must not become the following forecast's base.
  const spring = json(w); spring.year = 2027; spring.gameDay = 1;
  spring.schedule = generateSeasonSchedule(2027, spring.teams);
  spring.teams = spring.teams.map(t => startClubFinance(t, 2027));
  spring.contractEconomy.clock = { season: 2027, phase: 'preseason', date: '2027-02-01', offseasonTurn: 0 };
  spring.contractEconomy.cycle.season = 2027;
  const nextYear = fromAnnualState(spring, toAnnualState(spring)), future = build(nextYear);
  const base = nextYear.contractEconomy.budgetPolicies.find(r => r.teamId === 0 && r.season === 2027).approvedManYen;
  expect(nextYear.contractEconomy.engine.spending.authorizations.find(r => r.teamId === 0 && r.season === 2027).approvedManYen).toBe(base + 253125);
  expect(future.policy.forecasts.find(f => f.teamId === 0 && f.season === 2028).previousApprovedManYen).toBe(base);
  expect(future.quote.authorizations.find(r => r.teamId === 0 && r.season === 2028).approvedManYen)
    .toBe(future.quote.budgetPolicies.find(r => r.teamId === 0 && r.season === 2028).approvedManYen);
});

it.each([0, 12345])('uses verified retirement-game income %s in its own sample year, never as recurring future income', amountManYen => {
  let w = atDate(budgetForecastWorld(), '2026-07-16', 100), playerId = w.teams[0].players[0].id;
  let r = reduceEconomyCommand(w, reserve(w, playerId, { id: 'reservation' })); expect(r.ok, r.error).toBe(true); w = r.world;
  const before = build(w);
  r = reduceEconomyCommand(w, wrap(w, { id: 'income', type: 'record-extraordinary-income', kind: 'retirement-game',
    reservationId: 'reservation', amountManYen })); expect(r.ok, r.error).toBe(true); w = r.world;
  const after = build(w);
  expect(first(after).operatingSurplusesManYen[0] - first(before).operatingSurplusesManYen[0]).toBe(amountManYen);
  expect(evidence(after).samples[0]).toMatchObject({ retirementIncomeManYen: amountManYen, incomeReceiptIds: [w.contractEconomy.incomeReceipts[0].id] });
  expect(after.policy.forecasts.find(f => f.teamId === 0 && f.season === 2028)).toEqual(before.policy.forecasts.find(f => f.teamId === 0 && f.season === 2028));
  if (amountManYen > 0) {
    const overflow = json(w);
    overflow.teams[0].clubFinance = observedFinance(w.teams[0], 2026, Number.MAX_SAFE_INTEGER);
    denied(overflow);
  }
  const bad = json(w); bad.contractEconomy.incomeReceipts[0].amountManYen++;
  denied(bad);
});

it.each(['legacy', 'missing-team', 'wrong-league', 'wrong-year', 'null-finance', 'bad-finance', 'missing-policy'])('rejects %s without repairing the world', kind => {
  const w = budgetForecastWorld();
  if (kind === 'legacy') delete w.contractEconomy;
  if (kind === 'missing-team') w.teams.pop();
  if (kind === 'wrong-league') w.teams[0].league = 'パ';
  if (kind === 'wrong-year') w.teams[0].clubFinance.year--;
  if (kind === 'null-finance') w.teams[0].clubFinance = null;
  if (kind === 'bad-finance') w.teams[0].clubFinance.operatingSurplus = 1;
  if (kind === 'missing-policy') {
    for (const p of w.contractEconomy.budgetPolicies) { delete p.kind; delete p.inputsRecorded; }
  }
  denied(w);
});

it.each(['missing-support', 'duplicate-support', 'fraction-support', 'unknown-support', 'bad-window', 'duplicate-history', 'future-history', 'partial-history'])('rejects %s explicit evidence', kind => {
  const w = budgetForecastWorld(), options = { policy: forecastSettings(), financeHistory: [] };
  if (kind === 'missing-support') options.policy.supports.pop();
  if (kind === 'duplicate-support') options.policy.supports.push({ ...options.policy.supports[0] });
  if (kind === 'fraction-support') options.policy.supports[0].supportManYen = .5;
  if (kind === 'unknown-support') options.policy.supports[0].teamId = 99;
  if (kind === 'bad-window') options.policy.smoothingYears = 4;
  if (kind.endsWith('history')) {
    const f = observedFinance(w.teams[0], kind === 'future-history' ? 2027 : 2025);
    if (kind === 'partial-history') Object.assign(f, w.teams[0].clubFinance, { year: 2025 });
    options.financeHistory.push({ teamId: 0, finance: f });
    if (kind === 'duplicate-history') options.financeHistory.push({ teamId: 0, finance: f });
  }
  denied(w, options);
});

it('refuses malformed native spending instead of covering its missing approval with a new forecast', () => {
  const w = budgetForecastWorld(); w.contractEconomy.engine.spending.authorizations.pop(); denied(w);
});

it('keeps the warned partial-schedule range and chooses its conservative lower estimate', () => {
  const w = budgetForecastWorld(); w.schedule = null;
  const r = build(w), s = evidence(r).samples[0];
  expect(s.completeSchedule).toBe(false); expect(s.range.max).toBeGreaterThan(s.range.min);
  expect(first(r).operatingSurplusesManYen).toEqual([s.range.min]);
  expect(s.source).toBe('estimated');
});

it('uses the base approval of zero as a real limit instead of treating it as missing', () => {
  const w = budgetForecastWorld();
  for (const p of w.contractEconomy.budgetPolicies) { p.operatingSurplusesManYen = [0]; p.approvedManYen = 0; }
  for (const p of w.contractEconomy.engine.spending.authorizations) p.approvedManYen = 0;
  const r = build(w);
  expect(first(r).previousApprovedManYen).toBe(0); expect(r.quote.budgetPolicies[0].approvedManYen).toBe(0);
});

it('rejects mixed recorded policy settings rather than choosing the first club policy', () => {
  const w = budgetForecastWorld();
  w.contractEconomy.budgetPolicies.find(r => r.teamId === 1 && r.season === 2026).maxChangePercent = 99;
  denied(w);
});

it('uses explicit null for a genuinely unrecorded prior approval at the first native winter', () => {
  const w = budgetForecastWorld(), q = build(w).quote;
  w.contractEconomy.budgetPolicies = q.budgetPolicies;
  w.contractEconomy.engine.spending.authorizations = q.authorizations;
  w.contractEconomy.engine.rosterRequirements = q.rosterRequirements;
  w.contractEconomy.engine.spending.budgetSeason = 2027;
  w.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
  expect(first(build(w, { policy: forecastSettings() })).previousApprovedManYen).toBeNull();
});

it('rejects an explicitly null policy instead of silently switching back to the recorded settings', () => {
  denied(budgetForecastWorld(), { policy: null });
});

it('keeps income evidence deterministic even when distinct receipt IDs collate equally', () => {
  let w = atDate(budgetForecastWorld(createInitialTeams()), '2026-07-16', 100);
  for (const [i, id] of ['é', 'e\u0301'].entries()) {
    const playerId = w.teams[0].players[i].id, reservationId = `reservation-${i}`;
    let r = reduceEconomyCommand(w, reserve(w, playerId, { id: reservationId })); expect(r.ok, r.error).toBe(true); w = r.world;
    r = reduceEconomyCommand(w, wrap(w, { id, type: 'record-extraordinary-income', kind: 'retirement-game', reservationId, amountManYen: 7 }));
    expect(r.ok, r.error).toBe(true); w = r.world;
  }
  const firstResult = build(w), reversed = json(w); reversed.contractEconomy.incomeReceipts.reverse();
  expect(build(reversed)).toEqual(firstResult);
});
