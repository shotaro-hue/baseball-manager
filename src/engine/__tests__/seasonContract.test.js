import { describe, expect, it } from 'vitest';
import { createSeasonContract, contractSeasonsRemaining, validateSeasonContract } from '../seasonContract';

const terms = extra => ({ contractId: 'c1', playerId: 0, signedSeason: 2026,
  agreementPhase: 'season', purpose: 'acquisition', termYears: 1,
  annualSalaryManYen: 10000, guaranteed: true, ...extra });

describe('season-based fixed salary contracts (not yet connected to game state)', () => {
  it.each([
    ['season', 'acquisition', 1, 2026, 2026],
    ['season', 'acquisition', 3, 2026, 2028],
    ['offseason', 'acquisition', 1, 2027, 2027],
    ['offseason', 'acquisition', 3, 2027, 2029],
    ['preseason', 'acquisition', 1, 2026, 2026],
    ['season', 'renewal', 3, 2027, 2029],
    ['offseason', 'renewal', 7, 2027, 2033],
    ['preseason', 'renewal', 1, 2026, 2026],
  ])('%s %s for %i seasons starts %i and ends %i', (agreementPhase, purpose, termYears, startSeason, endSeason) => {
    const input = terms({ agreementPhase, purpose, termYears }), before = structuredClone(input);
    const contract = createSeasonContract(input);
    expect(contract).toMatchObject({ version: 1, playerId: 0, signedSeason: 2026,
      startSeason, endSeason, termYears, annualSalaryManYen: 10000 });
    expect(validateSeasonContract(contract)).toBe(true);
    expect(input).toEqual(before);
  });

  it('expires a midseason one-year contract that winter, regardless of signing year', () => {
    const contract = createSeasonContract(terms());
    expect(contractSeasonsRemaining(contract, 2026)).toBe(1);
    expect(contractSeasonsRemaining(contract, 2027)).toBe(0);
    expect(contractSeasonsRemaining(contract, 2035)).toBe(0);
  });

  it('keeps upcoming terms separate from current-season remaining years and survives JSON reload', () => {
    const contract = createSeasonContract(terms({ agreementPhase: 'offseason', termYears: 7 }));
    const before = structuredClone(contract), restored = JSON.parse(JSON.stringify(contract));
    expect(contractSeasonsRemaining(restored, 2026)).toBe(0);
    expect(contractSeasonsRemaining(restored, 2027)).toBe(7);
    expect(contractSeasonsRemaining(restored, 2030)).toBe(4);
    expect(contractSeasonsRemaining(restored, 2033)).toBe(1);
    expect(contractSeasonsRemaining(restored, 2034)).toBe(0);
    expect(restored).toEqual(before);
  });

  it('preserves recorded zero money without inventing a missing salary', () => {
    expect(createSeasonContract(terms({ annualSalaryManYen: 0, contractId: 0 })).annualSalaryManYen).toBe(0);
    for (const annualSalaryManYen of [undefined, null, NaN, Infinity, -1, '10000', 1.5]) {
      expect(() => createSeasonContract(terms({ annualSalaryManYen }))).toThrow();
    }
  });

  it.each([
    { contractId: '' }, { playerId: null }, { signedSeason: 0 }, { signedSeason: '2026' },
    { agreementPhase: 'postseason' }, { agreementPhase: undefined }, { purpose: 'trade' },
    { termYears: 0 }, { termYears: 8 }, { termYears: 1.5 }, { guaranteed: undefined },
    { signedSeason: 9999, agreementPhase: 'offseason' },
  ])('rejects incomplete or ambiguous contract input %j', extra => {
    expect(() => createSeasonContract(terms(extra))).toThrow();
  });

  it.each([
    { version: 2 }, { startSeason: 2027 }, { endSeason: 2025 }, { termYears: 2 },
    { guaranteed: 'true' }, { annualSalaryManYen: undefined },
  ])('does not silently repair corrupted authoritative data %j', extra => {
    const contract = { ...createSeasonContract(terms()), ...extra };
    expect(() => validateSeasonContract(contract)).toThrow();
    expect(() => contractSeasonsRemaining(contract, 2026)).toThrow();
  });

  it('rejects an unrecorded target season rather than consuming a year', () => {
    const contract = createSeasonContract(terms());
    for (const year of [undefined, NaN, 0, 2026.5, '2026']) {
      expect(() => contractSeasonsRemaining(contract, year)).toThrow();
    }
  });
});
