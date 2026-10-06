import { describe, it, expect } from 'vitest';
import { salaryCutRule } from '../renewalRules';
import { getFaProgress, getFaThreshold, evaluateRenewalOffer, calcPlayerDemand } from '../contract';
import { emptyStats } from '../playerCore';
const team = { players: [], lineup: [0], rotation: [], wins: 80, losses: 40, city: '東京' };
const p = { id: 0, salary: 10000, trust: 100, hometown: '東京', personality: { money: 0, winning: 0, playing: 100, hometown: 0, loyalty: 0, stability: 100, future: 0 }, stats: { ...emptyStats(), PA: 0 } };
describe('NPB cut consent and FA progress', () => {
  it.each([[10000, 7500, .25], [10001, 6000.6, .4], [10100, 6060, .4], [1000, 750, .25]])('uses an exact boundary for previous salary %s', (salary, boundary, rate) => {
    expect(salaryCutRule({ salary }, boundary)).toMatchObject({ rate, boundary, exceeds: false });
    expect(salaryCutRule({ salary }, boundary - .01).exceeds).toBe(true);
  });
  it('does not invent a cut boundary for an unrecorded salary', () => {
    expect(salaryCutRule({}).recorded).toBe(false);
  });
  it('permits consent beyond the cut boundary with the shared acceptance score', () => {
    const demand = calcPlayerDemand(p);
    expect(demand.minAcceptSalary).toBeLessThan(7500);
    const result = evaluateRenewalOffer(p, { salary: 7000, years: 3 }, team, [team], demand, 3);
    expect(result).toMatchObject({ valid: true, accepted: true, freeAgencyRequested: false, cut: { exceeds: true } });
  });
  it('a nonconsenting player can request free agency without FA service eligibility', () => {
    const result = evaluateRenewalOffer({ ...p, daysOnActiveRoster: 0 }, { salary: 5000, years: 1 }, team, [team], { demandSalary: 20000, minAcceptSalary: 15000 });
    expect(result).toMatchObject({ valid: true, accepted: false, freeAgencyRequested: true });
  });
  it('minimum salary guarantees apply at agreement, not input', () => {
    for (const [育成, salary] of [[false, 419], [true, 239]]) {
      const result = evaluateRenewalOffer({ ...p, 育成 }, { salary, years: 3 }, team, [team], { demandSalary: 100, minAcceptSalary: 100 }, 3);
      expect(result.valid).toBe(true); expect(result.accepted).toBe(false);
    }
    for (const salary of [0, -1, NaN, Infinity, '']) expect(evaluateRenewalOffer(p, { salary, years: 1 }, team, [team], { demandSalary: 1000 }).valid).toBe(false);
  });
  it('high-school spelling matches generated players and zero registration is measured', () => {
    expect(getFaThreshold({ entryType: '高校生' })).toEqual(getFaThreshold({ entryType: '高卒' }));
    expect(getFaProgress({ entryType: '高校生', daysOnActiveRoster: 0, serviceYears: 10 })).toMatchObject({ estimated: false, domestic: { years: 8, remainingDays: 960 } });
  });
  it('rounds remaining years up and distinguishes estimated and unrecorded data', () => {
    expect(getFaProgress({ entryType: '大卒', daysOnActiveRoster: 839 }).domestic).toEqual({ years: 1, remainingDays: 1, eligible: false });
    expect(getFaProgress({ daysOnActiveRoster: 840 }).domestic.eligible).toBe(true);
    expect(getFaProgress({ serviceYears: 5 })).toMatchObject({ estimated: true, domestic: { years: 2 } });
    expect(getFaProgress({}).recorded).toBe(false);
  });
});
