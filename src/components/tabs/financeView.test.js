import { describe, expect, it } from 'vitest';
import { calcClubGameFinance, forecastClubFinance, startClubFinance, applyClubGameFinance } from '../../engine/clubFinance';
import { financeView, ticketPreview, stadiumPreview } from './financeView';
const club = extra => startClubFinance({ id: 0, budget: 1000000, wins: 0, losses: 0, popularity: 50, stadiumLevel: 0, players: [], farm: [], ...extra }, 2026);
const schedule = [null, ...Array.from({ length: 143 }, (_, i) => ({ matchups: [i % 2 ? { homeId: 1, awayId: 0 } : { homeId: 0, awayId: 1 }] }))];
const freeze = t => { for (const v of Object.values(t)) if (v && typeof v === 'object') freeze(v); return Object.freeze(t); };
describe('finance read models', () => {
  it('separates recorded zero from a missing ledger and presents broken data as unavailable', () => {
    const ready = financeView(club(), schedule);
    expect(ready.status).toBe('ready');
    expect(ready.actual.revenue).toBe(0);
    expect(ready.actual.operatingSurplus).toBe(0);
    const legacy = club(); delete legacy.clubFinance; delete legacy.revenueThisSeason;
    expect(financeView(legacy, schedule).actual.revenue).toBeNull();
    expect(financeView(legacy, schedule).status).toBe('legacy');
    expect(financeView({ ...club(), clubFinance: null }, schedule).status).toBe('invalid');
  });
  it('exposes actual, remaining and annual costs from the same forecast', () => {
    const t = applyClubGameFinance(club(), { year: 2026, gameDay: 1, isHomeTeam: true });
    const f = forecastClubFinance(t, schedule), view = financeView(t, schedule);
    for (const key of ['fixed', 'matchday', 'goods']) {
      expect(f.costs[key].min).toBeGreaterThanOrEqual(t.clubFinance.costs[key]);
      expect(view.forecast.costs[key]).toEqual(f.costs[key]);
    }
    expect(Object.values(f.costs).reduce((n, r) => n + r.min, 0)).toBe(f.operatingCosts.min);
  });
  it('quotes a manual price without changing the current ledger, budget or inputs', () => {
    const t = freeze(club({ customAvgTicketPrice: 2800 })), before = JSON.stringify(t);
    const p = ticketPreview(t, schedule, '3300');
    const expected = calcClubGameFinance({ ...t, customAvgTicketPrice: 3300 }, true, 1);
    expect(p.ok).toBe(true); expect(p.after.quote).toEqual(expected);
    expect(p.after.hostRevenue).toBe(expected.income.ticket + expected.income.food + expected.income.merch);
    expect(p.before.quote.avgTicketPrice).toBe(2800);
    expect(JSON.stringify(t)).toBe(before);
  });
  it.each(['', '   ', '0', '-500', '499', '5001', '2.5', 'NaN', 'Infinity'])('rejects a price of %s before computing or committing', input => {
    expect(ticketPreview(club(), schedule, input).ok).toBe(false);
  });
  it.each([500, 5000])('accepts boundary price %i and keeps capacity bounded', price => {
    const p = ticketPreview(club({ popularity: 100, wins: 90 }), schedule, String(price));
    expect(p.ok).toBe(true); expect(p.after.quote.avgTicketPrice).toBe(price);
    expect(p.after.quote.attendance).toBeLessThanOrEqual(42000);
  });
  it('compares stadium scenarios for a full year using the same manual price, schedule and contracts', () => {
    const t = freeze(applyClubGameFinance(club({ customAvgTicketPrice: 3300 }), { year: 2026, gameDay: 1, isHomeTeam: true }));
    const before = JSON.stringify(t), p = stadiumPreview(t, schedule);
    expect(p.cost).toBe(100000); expect(p.budgetAfter).toBe(t.budget - 100000); expect(p.affordable).toBe(true);
    expect(p.before.quote.avgTicketPrice).toBe(3300); expect(p.after.quote.avgTicketPrice).toBe(3300);
    expect(p.before.forecast.gamesPlayed).toBe(0); expect(p.before.forecast.homeGames).toEqual({ min: 72, max: 72 });
    expect(p.after.forecast.income.sponsor).toEqual(p.before.forecast.income.sponsor);
    expect(p.attendanceDelta.min).toBe((p.after.quote.attendance - p.before.quote.attendance) * 72);
    expect(p.surplusDelta.min).toBe((p.after.quote.operatingSurplus - p.before.quote.operatingSurplus) * 72);
    expect(p.payback.min).toBeCloseTo(p.cost / p.surplusDelta.min);
    expect(JSON.stringify(t)).toBe(before);
  });
  it('still shows full-year investment impact when the current season is over', () => {
    let t = club();
    for (let day = 1; day <= 143; day++) t = applyClubGameFinance(t, { year: 2026, gameDay: day, isHomeTeam: day % 2 === 1 });
    expect(financeView(t, schedule).forecast.gamesPlayed).toBe(143);
    expect(stadiumPreview(t, schedule).before.forecast.gamesPlayed).toBe(0);
    expect(stadiumPreview(t, schedule).surplusDelta.min).toBeGreaterThan(0);
  });
  it('shows budget shortfall, maximum level and nonpositive payback without a fake number', () => {
    expect(stadiumPreview(club({ budget: -100 }), schedule)).toMatchObject({ affordable: false, budgetAfter: -100100 });
    expect(stadiumPreview(club({ stadiumLevel: 3 }), schedule).max).toBe(true);
    // No hosting games => no incremental gate revenue, so there is no payback.
    const awayOnly = [null, ...Array.from({ length: 143 }, () => ({ matchups: [{ homeId: 1, awayId: 0 }] }))];
    const p = stadiumPreview(club(), awayOnly);
    expect(p.surplusDelta).toEqual({ min: 0, max: 0 }); expect(p.payback).toBeNull();
  });
  it('keeps schedule uncertainty and absent budgets visible', () => {
    const p = stadiumPreview(club({ budget: undefined }));
    expect(p.budgetAfter).toBeNull(); expect(p.affordable).toBe(false);
    expect(p.before.forecast.completeSchedule).toBe(false);
    expect(p.before.forecast.homeGames).toEqual({ min: 71, max: 72 });
  });
});
