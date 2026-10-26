import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { accruedSalaryManYen, salaryForPeriodManYen, quoteContractPayroll } from '../monthlyPayroll';

const contract = extra => createSeasonContract({ contractId: 'c1', playerId: 0,
  signedSeason: 2026, agreementPhase: 'season', purpose: 'acquisition', termYears: 1,
  annualSalaryManYen: 10000, guaranteed: true, ...extra });
const stint = (teamId, startDate, endDate) => ({ teamId, startDate, endDate });

describe('monthly salary costs in whole 万円 (not yet connected to game state)', () => {
  it.each([
    ['2026-01-01', 10000], ['2026-02-01', 10000], ['2026-04-01', 8000],
    ['2026-06-01', 6000], ['2026-07-01', 5000], ['2026-07-16', 4516],
    ['2026-07-31', 4032], ['2026-11-30', 33], ['2026-12-01', 0], ['2027-01-01', 0],
  ])('charges annual salary 10000 from %s at %i', (date, expected) => {
    expect(salaryForPeriodManYen(10000, 2026, date, '2027-01-01')).toBe(expected);
  });

  it('uses the actual February length rather than 300 days, games, or host timezone', () => {
    expect(accruedSalaryManYen(29000, 2028, '2028-02-28')).toBe(2700);
    expect(accruedSalaryManYen(29000, 2028, '2028-02-29')).toBe(2800);
    expect(accruedSalaryManYen(29000, 2028, '2028-03-01')).toBe(2900);
    expect(accruedSalaryManYen(28000, 2026, '2026-02-28')).toBe(2700);
    expect(accruedSalaryManYen(10000, 2026, '2025-12-31')).toBe(0);
    expect(accruedSalaryManYen(10000, 2026, '2027-01-01')).toBe(10000);
  });

  it('preserves the annual cost when two same-month transfers split a tiny salary', () => {
    const a = salaryForPeriodManYen(55, 2026, '2026-02-01', '2026-07-01');
    const b = salaryForPeriodManYen(55, 2026, '2026-07-01', '2026-07-16');
    const c = salaryForPeriodManYen(55, 2026, '2026-07-16', '2026-12-01');
    expect([a, b, c]).toEqual([28, 2, 25]);
    expect(a + b + c).toBe(55);
  });

  it('does not retroactively charge the promoted salary or round the salary difference instead', () => {
    const oldCost = salaryForPeriodManYen(240, 2026, '2026-02-01', '2026-07-16');
    const newCost = salaryForPeriodManYen(420, 2026, '2026-07-16', '2026-12-01');
    expect([oldCost, newCost, oldCost + newCost]).toEqual([132, 190, 322]);
  });

  it('can quote a formal termination boundary separately from the retained guarantee', () => {
    expect(salaryForPeriodManYen(10000, 2026, '2026-02-01', '2026-07-16')).toBe(5484);
    expect(salaryForPeriodManYen(10000, 2026, '2026-07-16', '2026-12-01')).toBe(4516);
    // A club release must retain both periods in the later liability ledger.
    expect(salaryForPeriodManYen(10000, 2026, '2026-02-01', '2026-12-01')).toBe(10000);
  });

  it.each([2026, 2028])('preserves monotonic accrual and full cost for every day in %i', year => {
    const dates = [];
    for (let day = new Date(Date.UTC(year, 1, 1)); day <= new Date(Date.UTC(year, 11, 1)); day.setUTCDate(day.getUTCDate() + 1)) {
      dates.push(day.toISOString().slice(0, 10));
    }
    for (const salary of [0, 1, 55, 240, 10000, Number.MAX_SAFE_INTEGER]) {
      let total = 0;
      for (let i = 1; i < dates.length; i++) {
        const cost = salaryForPeriodManYen(salary, year, dates[i - 1], dates[i]);
        expect(cost).toBeGreaterThanOrEqual(0);
        total += cost;
      }
      expect(total).toBe(salary);
    }
  });

  it('handles exact half-unit boundaries near the safe money limit', () => {
    expect(accruedSalaryManYen(Number.MAX_SAFE_INTEGER, 2026, '2026-07-01')).toBe(4503599627370496);
    expect(salaryForPeriodManYen(Number.MAX_SAFE_INTEGER, 2026, '2026-07-01', '2026-12-01')).toBe(4503599627370495);
  });

  it('distinguishes recorded zero from missing money and rejects malformed civil dates', () => {
    expect(accruedSalaryManYen(0, 2026, '2026-07-16')).toBe(0);
    for (const salary of [null, undefined, '10000', NaN, Infinity, -1, 0.5]) {
      expect(() => accruedSalaryManYen(salary, 2026, '2026-07-16')).toThrow();
    }
    for (const date of [undefined, null, '', '2026-7-01', '2026-02-29', '2100-02-29', '2026-04-31',
      '2026-00-01', '2026-13-01', '2026-07-00', '2026-07-16T00:00:00Z', '0000-01-01']) {
      expect(() => accruedSalaryManYen(10000, 2026, date)).toThrow();
    }
    for (const season of [undefined, 0, NaN, '2026', 2026.5]) {
      expect(() => accruedSalaryManYen(10000, season, '2026-07-16')).toThrow();
    }
    expect(() => salaryForPeriodManYen(10000, 2026, '2026-07-16', '2026-07-15')).toThrow();
    expect(salaryForPeriodManYen(10000, 2026, '2026-07-16', '2026-07-16')).toBe(0);
  });
});

describe('annual liabilities and ownership intervals', () => {
  it('separates a three-year nominal salary from actual midseason club costs', () => {
    const c = contract({ termYears: 3 }), tenures = [stint(0, '2026-07-01', '2028-12-01')];
    const input = structuredClone({ c, tenures });
    const quote = quoteContractPayroll(c, '2026-07-01', tenures);
    expect(quote).toMatchObject({ annualSalaryManYen: 10000, nominalTotalManYen: 30000, totalLiabilityManYen: 25000 });
    expect(quote.seasons.map(s => [s.season, s.amountManYen])).toEqual([[2026, 5000], [2027, 10000], [2028, 10000]]);
    expect(quoteContractPayroll(JSON.parse(JSON.stringify(c)), '2026-07-01', JSON.parse(JSON.stringify(tenures)))).toEqual(quote);
    expect(quoteContractPayroll(c, '2026-07-01', tenures)).toEqual(quote);
    expect({ c, tenures }).toEqual(input);
  });

  it('moves only future liability to the buyer without extending the original expiry', () => {
    const c = contract({ termYears: 3 });
    const quote = quoteContractPayroll(c, '2026-02-01', [
      stint(0, '2026-02-01', '2026-07-01'), stint(1, '2026-07-01', '2026-07-16'),
      stint(0, '2026-07-16', '2028-12-01'),
    ]);
    expect(quote.seasons.map(s => s.teams)).toEqual([
      [{ teamId: 0, amountManYen: 9516 }, { teamId: 1, amountManYen: 484 }],
      [{ teamId: 0, amountManYen: 10000 }], [{ teamId: 0, amountManYen: 10000 }],
    ]);
    expect(quote.totalLiabilityManYen).toBe(30000);
    expect(c.endSeason).toBe(2028);
  });

  it('quotes all seven future years rather than silently truncating to three', () => {
    const c = contract({ agreementPhase: 'offseason', termYears: 7 });
    const quote = quoteContractPayroll(c, '2027-02-01', [stint('club', '2027-02-01', '2033-12-01')]);
    expect(quote.seasons.map(s => s.season)).toEqual([2027, 2028, 2029, 2030, 2031, 2032, 2033]);
    expect(quote.totalLiabilityManYen).toBe(70000);
  });

  it.each([
    [], [stint(null, '2026-02-01', '2026-12-01')],
    [stint(0, '2026-02-02', '2026-12-01')], [stint(0, '2026-02-01', '2026-11-30')],
    [stint(0, '2026-02-01', '2026-07-16'), stint(1, '2026-07-15', '2026-12-01')],
    [stint(0, '2026-02-01', '2026-07-15'), stint(1, '2026-07-16', '2026-12-01')],
    [stint(0, '2026-02-01', '2026-02-01'), stint(1, '2026-02-01', '2026-12-01')],
    [stint(0, '2026-07-01', '2026-12-01'), stint(1, '2026-02-01', '2026-07-01')],
  ])('rejects missing, overlapping, gapped or unordered payer intervals %j', (...entries) => {
    // Vitest expands each array row, so restore its list of tenure arguments.
    expect(() => quoteContractPayroll(contract(), '2026-02-01', entries)).toThrow();
  });

  it('does not shift an unknown or December effective date to a different contract year', () => {
    for (const date of [undefined, '2025-07-01', '2026-12-01', '2027-02-01']) {
      expect(() => quoteContractPayroll(contract(), date, [stint(0, date, '2026-12-01')])).toThrow();
    }
  });
});
