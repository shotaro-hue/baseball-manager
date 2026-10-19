import { describe, it, expect } from 'vitest';
import * as finance from '../finance';
import { TEAM_DEFS, TEAM_STADIUM_CAPACITY } from '../../constants';

const base = (id = 0) => ({ ...TEAM_DEFS[id], wins: 0, losses: 0, draws: 0, popularity: 50,
  stadiumLevel: 0, players: [{ id: 0, salary: 1000 }], farm: [], coaches: [], revenueThisSeason: 0 });
function start(id = 0) {
  expect(typeof finance.startClubFinance).toBe('function');
  return finance.startClubFinance(base(id), 2026);
}
const add = (t, round, home = round % 2 === 1) => finance.applyClubGameFinance(t, { year: 2026, gameDay: round, isHomeTeam: home });
const schedule = () => [null, ...Array.from({ length: 143 }, (_, i) => ({ matchups: [
  i % 2 === 0 ? { homeId: 0, awayId: 1 } : { homeId: 1, awayId: 0 },
] }))];
const sum = values => Object.values(values).reduce((a, b) => a + b, 0);

describe('club finance receipts and allocation', () => {
  it('starts a fresh annual ledger without changing the spending envelope or roster', () => {
    const t = base(), copy = structuredClone(t), next = start();
    expect(t).toEqual(copy);
    expect(next.budget).toBe(t.budget);
    expect(next.clubFinance).toMatchObject({ version: 1, year: 2026, homeGames: 0, awayGames: 0, operatingSurplus: 0 });
    expect(next.clubFinance.postedRounds).toEqual([]);
  });
  it('credits tickets/food/merch only to the actual host, including team ID 0', () => {
    const t = start(), h = finance.calcClubGameFinance(t, true, 1), a = finance.calcClubGameFinance(t, false, 1);
    expect(h.income.ticket).toBe(Math.round(h.attendance * h.avgTicketPrice / 10000));
    expect(h.avgTicketPrice).toBeGreaterThanOrEqual(3000);
    expect(h.income.food).toBeGreaterThan(0);
    expect(a.income).toMatchObject({ ticket: 0, food: 0, merch: 0 });
    expect(a.income.sponsor).toBeGreaterThan(0);
    expect(a.costs.matchday).toBe(0);
  });
  it('adds only receipts less operating costs to the existing budget', () => {
    const t = start(), quote = finance.calcClubGameFinance(t, true, 1), after = add(t, 1);
    expect(after.budget - t.budget).toBe(quote.revenue - quote.operatingCosts);
    expect(after.revenueThisSeason).toBe(quote.revenue);
    expect(sum(after.clubFinance.income)).toBe(after.revenueThisSeason);
    expect(after.clubFinance.operatingSurplus).toBe(sum(after.clubFinance.income) - sum(after.clubFinance.costs));
    expect(t.clubFinance.postedRounds).toEqual([]);
  });
  it('reconciles exact annual fixed receipts and costs without roundoff drift after save/reload', () => {
    let t = start();
    for (let i = 143; i >= 1; i--) t = add(JSON.parse(JSON.stringify(t)), i);
    const f = t.clubFinance;
    for (const key of ['sponsor', 'broadcast', 'membership']) expect(f.income[key]).toBe(f.annual[key]);
    expect(f.costs.fixed).toBe(f.annual.fixedCost);
    expect(f.homeGames + f.awayGames).toBe(143);
    expect(t.budget - base().budget).toBe(f.operatingSurplus);
    expect(finance.forecastClubFinance(t, schedule()).revenue).toEqual({ min: t.revenueThisSeason, max: t.revenueThisSeason });
  });
  it('does not post a repeated round twice or mutate a frozen input', () => {
    const t = add(start(), 1), before = JSON.stringify(t);
    Object.freeze(t.clubFinance.postedRounds); Object.freeze(t.clubFinance); Object.freeze(t);
    expect(add(t, 1)).toBe(t);
    expect(JSON.stringify(t)).toBe(before);
  });
  it.each([0, 144, NaN, 1.5])('rejects invalid scheduled round %s', round => {
    expect(() => add(start(), round)).toThrow(/収支/);
  });
  it('rejects mismatched years and incomplete home/away context', () => {
    const t = start();
    expect(() => finance.applyClubGameFinance(t, { year: 2027, gameDay: 1, isHomeTeam: true })).toThrow(/収支/);
    expect(() => finance.applyClubGameFinance(t, { year: 2026, gameDay: 1 })).toThrow(/収支/);
  });
  it('does not tie attendance to the budget left after a transfer', () => {
    const t = start();
    expect(finance.calcClubGameFinance({ ...t, budget: 0 }, true, 1))
      .toEqual(finance.calcClubGameFinance({ ...t, budget: 10000000 }, true, 1));
  });
  it.each(TEAM_DEFS.map(t => [t.short, t.id]))('%s observes attendance capacity, price tradeoffs and finite sums', (_, id) => {
    const t = start(id), low = finance.calcClubGameFinance({ ...t, customAvgTicketPrice: 500 }, true, 1);
    const high = finance.calcClubGameFinance({ ...t, customAvgTicketPrice: 5000 }, true, 1);
    expect(low.attendance).toBeLessThanOrEqual(TEAM_STADIUM_CAPACITY[id]);
    expect(high.attendance).toBeLessThan(low.attendance);
    expect(high.revenue).toBe(sum(high.income));
    expect(high.operatingCosts).toBe(sum(high.costs));
  });
  it('uses actual remaining hosts and annual contracts, then closes at the exact observed total', () => {
    let t = start();
    for (let i = 1; i <= 10; i++) t = add(t, i);
    const f = finance.forecastClubFinance(t, schedule());
    expect(f.completeSchedule).toBe(true);
    expect(f.homeGames).toEqual({ min: 72, max: 72 });
    for (let i = 11; i <= 143; i++) t = add(t, i);
    expect(f.revenue).toEqual({ min: t.revenueThisSeason, max: t.revenueThisSeason });
    expect(finance.forecastClubFinance(t, schedule()).operatingSurplus).toEqual({ min: t.clubFinance.operatingSurplus, max: t.clubFinance.operatingSurplus });
  });
  it('labels an incomplete schedule as a range, never a fabricated exact count', () => {
    const t = start(), s = schedule(); delete s[70];
    const f = finance.forecastClubFinance(t, s);
    expect(f.completeSchedule).toBe(false);
    expect(f.homeGames).toEqual({ min: 71, max: 72 });
    expect(f.revenue.max).toBeGreaterThan(f.revenue.min);
  });
  it.each([
    ['missing opponent', [{ homeId: 0 }]],
    ['missing host', [{ awayId: 0 }]],
    ['null matchup', [null]],
    ['non-array matchups', { homeId: 0, awayId: 1 }],
    ['unknown opponent', [{ homeId: 0, awayId: 99 }]],
    ['identical participants', [{ homeId: 0, awayId: 0 }]],
  ])('treats %s as unconfirmed schedule data without crashing', (_, matchups) => {
    const s = schedule(); s[70] = { matchups };
    const f = finance.forecastClubFinance(start(), s);
    expect(f.completeSchedule).toBe(false);
    expect(f.homeGames).toEqual({ min: 71, max: 72 });
  });
  it('preserves legacy teams as unknown new-model receipts, then starts an empty next-year ledger', () => {
    const old = { ...base(), revenueThisSeason: 123456 };
    expect(finance.forecastClubFinance(old, schedule())).toBeNull();
    expect(finance.startClubFinance(old, 2027)).toMatchObject({ revenueThisSeason: 0, clubFinance: { year: 2027, operatingSurplus: 0 } });
    expect(old.revenueThisSeason).toBe(123456);
  });
  it('allocates from operating surplus rather than gross sales and deduplicates contract salaries', () => {
    const t = add(start(), 1), p = { id: 0, salary: 1000 }, roster = { ...t, players: [p], farm: [p] };
    expect(finance.nextClubBudget(t, roster, null)).toBe(Math.max(250000,
      500000 + Math.round(t.clubFinance.operatingSurplus * .6) - 1000));
    expect(() => finance.nextClubBudget(t, { ...roster, players: [{ id: 0 }] }, null)).toThrow(/年俸/);
  });
  it('validates and deduplicates payroll at the first legacy rollover while retaining its revenue basis', () => {
    const t = { ...base(), revenueThisSeason: 100000 }, p = { id: 0, salary: 100000 };
    const roster = { players: [p], farm: [p] };
    expect(finance.nextClubBudget(t, roster, null)).toBe(460000);
    for (const salary of [undefined, null, -1, NaN]) {
      expect(() => finance.nextClubBudget(t, { players: [{ id: 0, salary }], farm: [] }, null)).toThrow(/年俸/);
    }
  });
  it('rejects a corrupt introduced ledger instead of repairing it into zero', () => {
    const t = start();
    expect(finance.validateClubFinance(t.clubFinance)).toBe(true);
    expect(finance.validateClubFinance(undefined)).toBe(true);
    for (const f of [{ ...t.clubFinance, version: 99 }, { ...t.clubFinance, income: { ...t.clubFinance.income, ticket: NaN } },
      { ...t.clubFinance, postedRounds: [1, 1] }, { ...t.clubFinance, homeGames: 5 }]) {
      expect(() => finance.validateClubFinance(f)).toThrow(/収支/);
    }
  });
});
