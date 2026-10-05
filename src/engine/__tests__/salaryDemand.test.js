import { describe, it, expect } from 'vitest';
import { calculateSalaryDemand, renewalSalaryFloor, salaryAwardBonuses, assessSalaryPerformance } from '../salaryDemand';
import { calcPlayerDemand, evaluateRenewalOffer, simulateNegotiationRounds } from '../contract';
import { emptyStats } from '../playerCore';

const batter = (salary = 1000, stats = {}, extra = {}) => ({ id: 0, name: '打者', age: 25, salary, personality: { money: 50 }, stats: { ...emptyStats(), PA: 550, AB: 480, H: 170, BB: 60, HBP: 5, SF: 5, D: 30, T: 3, HR: 20, ...stats }, ...extra });
const pitcher = (salary = 1000, stats = {}, extra = {}) => ({ ...batter(salary), isPitcher: true, subtype: '先発', stats: { ...emptyStats(), IP: 150, ER: 40, Kp: 150, BBp: 40, BF: 600, ...stats }, ...extra });
const team = { id: 0, league: 'セ', name: '球団', city: '東京', budget: 100000, wins: 80, losses: 60, rotation: [0], lineup: [0], players: [{ age: 25 }] };
const other = { ...team, id: 1, wins: 60, losses: 80 };
const context = { year: 2026, team, teams: [team, other] };

describe('performance-based salary demand', () => {
  it('allows a low-paid breakout to exceed the old 55% ceiling', () => {
    expect(calculateSalaryDemand(batter(600)).demandSalary).toBeGreaterThan(600 * 1.55);
  });
  it('distinguishes relief work from starting workload', () => {
    const stats = { IP: 60, ER: 12, Kp: 65, BBp: 15, SV: 35 };
    expect(calculateSalaryDemand(pitcher(3000, stats, { subtype: '抑え' })).demandSalary).toBeGreaterThan(calculateSalaryDemand(pitcher(3000, stats)).demandSalary);
  });
  it('uses recorded appearances over the current registered role', () => {
    expect(assessSalaryPerformance(pitcher(1000, { G: 60, GS: 0 })).role).toBe('救援');
  });
  it('limits small-sample raises without erasing measured performance', () => {
    const p = batter(600, { PA: 50, AB: 40, H: 20, BB: 10, HBP: 0, SF: 0, D: 3, T: 0, HR: 3 });
    expect(calculateSalaryDemand(p).demandSalary).toBeLessThanOrEqual(700);
    expect(calculateSalaryDemand(p).assessment.recorded).toBe(true);
  });
  it('holds missing stats unchanged but evaluates recorded zero appearances', () => {
    const p = batter(3000); delete p.stats.PA;
    expect(calculateSalaryDemand(p).demandSalary).toBe(3000);
    expect(calculateSalaryDemand(p).assessment.recorded).toBe(false);
    expect(calculateSalaryDemand(batter(3000, { PA: 0 })).demandSalary).toBeLessThan(3000);
  });
  it('does not synthesize missing rate inputs or a missing save bonus', () => {
    const p = pitcher(); delete p.stats.ER;
    expect(calculateSalaryDemand(p).assessment.recorded).toBe(false);
    const relief = pitcher(3000, {}, { subtype: '抑え' }); delete relief.stats.SV;
    expect(assessSalaryPerformance(relief).value).toBeCloseTo(assessSalaryPerformance({ ...relief, stats: { ...relief.stats, SV: 0 } }).value);
  });
  it('applies 25%/40% cut boundaries and keeps the salary floor despite rounding', () => {
    expect(renewalSalaryFloor(batter(10000))).toBe(7500);
    expect(renewalSalaryFloor(batter(10100))).toBe(6100);
    expect(renewalSalaryFloor(batter(420))).toBe(420);
    expect(renewalSalaryFloor(batter(240, {}, { 育成: true }))).toBe(240);
    for (const salary of [420, 750, 10000, 10100, 50000]) expect(calculateSalaryDemand(batter(salary, { PA: 0 })).demandSalary).toBeGreaterThanOrEqual(renewalSalaryFloor(batter(salary)));
  });
  it('buffers a decline with recent recorded seasons and excludes current/future entries', () => {
    const p = batter(10000, { PA: 100 });
    const prior = { year: 2025, stats: batter().stats };
    expect(calculateSalaryDemand({ ...p, recentCareerLog: [prior] }, context).demandSalary).toBeGreaterThan(calculateSalaryDemand(p, context).demandSalary);
    expect(calculateSalaryDemand({ ...p, recentCareerLog: [{ ...prior, year: 2026 }] }, context).demandSalary).toBe(calculateSalaryDemand(p, context).demandSalary);
  });
  it('does not cut a productive established player solely on a lower model valuation', () => {
    expect(calculateSalaryDemand(batter(30000)).demandSalary).toBeGreaterThanOrEqual(30000);
  });
  it('honors zero money preference, and missing preferences use the neutral default', () => {
    const p = batter();
    expect(calculateSalaryDemand({ ...p, personality: { money: 0 } }).demandSalary).toBeLessThan(calculateSalaryDemand(p).demandSalary);
    expect(calculateSalaryDemand({ ...p, personality: {} }).demandSalary).toBe(calculateSalaryDemand(p).demandSalary);
  });
  it('awards every tied winner, caps stacked titles and ignores old/name-only awards', () => {
    const winner = { playerId: 0, value: 30 };
    const awards = { version: 2, year: 2026, mvp: { central: winner }, rookie: { central: winner }, sawamura: winner, bestNine: { central: { 投手: [winner] } }, titles: { central: { sv: { value: 30, winners: [{ playerId: 1 }, winner] }, so: winner } } };
    const bonuses = salaryAwardBonuses(pitcher(), { ...context, awards });
    expect(bonuses.bonus).toBe(.25);
    expect(bonuses.reasons.map(r => r.label)).toContain('最多セーブ');
    expect(salaryAwardBonuses(pitcher(), { ...context, awards: { ...awards, year: 2025 } }).bonus).toBe(0);
    expect(salaryAwardBonuses(pitcher(), { ...context, awards: { ...awards, version: 1 } }).bonus).toBe(0);
  });
  it('caps team additions, requires this-year championship and gives no lower-place penalty', () => {
    const p = batter(); const without = calculateSalaryDemand(p);
    const champion = calculateSalaryDemand(p, { ...context, championship: { year: 2026, championId: 0 } });
    expect(champion.assessment.teamBonus).toBe(.05);
    expect(champion.demandSalary).toBeGreaterThan(without.demandSalary);
    expect(calculateSalaryDemand(p, { ...context, team: other }).demandSalary).toBe(without.demandSalary);
    expect(calculateSalaryDemand(p, { ...context, championship: { year: 2025, championId: 0 } }).assessment.teamBonus).toBe(.03);
  });
});

describe('shared renewal negotiation', () => {
  it('rejects invalid/under-floor offers even when personality would favor them', () => {
    const p = batter(10000); const demand = calcPlayerDemand(p);
    expect(evaluateRenewalOffer(p, { salary: 7000, years: 1 }, team, [team, other], demand).valid).toBe(false);
    expect(evaluateRenewalOffer(p, { salary: demand.demandSalary, years: 0 }, team, [team, other], demand).valid).toBe(false);
    expect(evaluateRenewalOffer(p, { salary: NaN, years: 1 }, team, [team, other], demand).valid).toBe(false);
  });
  it('uses demand, not previous salary, and prevents a breakout from signing for far below demand', () => {
    const p = batter(600); const demand = calcPlayerDemand(p);
    expect(evaluateRenewalOffer(p, { salary: 600, years: 3 }, team, [team, other], demand, 3).accepted).toBe(false);
    expect(evaluateRenewalOffer(p, { salary: demand.demandSalary, years: 1 }, team, [team, other], demand).accepted).toBe(true);
  });
  it('makes CPU and individual offers pass the same acceptance function', () => {
    const p = pitcher(3000); const demand = calcPlayerDemand(p, context);
    const result = simulateNegotiationRounds(p, team, [team, other], demand.demandSalary, demand.resistanceFactor, demand);
    expect(result.result).toBe('signed');
    expect(evaluateRenewalOffer(p, { salary: result.finalSalary, years: 1 }, team, [team, other], demand, result.rounds).accepted).toBe(true);
  });
  it('lets a difficult CPU negotiation reach the demand without forcing a below-demand agreement', () => {
    const p = pitcher(3000, {}, { personality: { money: 0, winning: 0, playing: 0, hometown: 0, loyalty: 0, stability: 0, future: 0 } });
    const demand = calcPlayerDemand(p, context);
    const result = simulateNegotiationRounds(p, team, [team, other], demand.demandSalary, demand.resistanceFactor, demand);
    expect(result.rounds).toBe(3);
    expect(result.finalSalary).toBe(demand.demandSalary);
    expect(result.result).toBe('signed');
  });
});
