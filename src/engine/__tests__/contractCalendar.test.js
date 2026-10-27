import { describe, expect, it } from 'vitest';
import { parseContractDate, registrationDateAllowed } from '../contractCalendar';

describe('contract civil calendar and registration deadline', () => {
  it.each([['2026-01-01', true], ['2026-02-01', true], ['2026-07-31', true],
    ['2026-08-01', false], ['2026-11-30', false], ['2027-02-01', false]])('%s registration is %s', (date, allowed) => {
    expect(registrationDateAllowed(2026, date)).toBe(allowed);
  });
  it.each([[2028, true], [2000, true], [2100, false], [1900, false]])('validates leap days in %i', (year, leap) => {
    if (leap) expect(parseContractDate(`${year}-02-29`)).toMatchObject({ year, month: 2, day: 29, days: 29 });
    else expect(() => parseContractDate(`${year}-02-29`)).toThrow();
  });
  it.each([undefined, null, '', '2026-7-01', '2026-04-31', '2026-07-00', '0000-01-01', '2026-07-31T00:00:00Z'])('rejects an unknown or malformed date %s', date => {
    expect(() => registrationDateAllowed(2026, date)).toThrow();
  });
  it('never infers a year or date from game rounds', () => {
    for (const year of [undefined, null, '2026', NaN, 0, 2026.5]) expect(() => registrationDateAllowed(year, '2026-07-31')).toThrow();
    expect(() => registrationDateAllowed(2026, 100)).toThrow();
  });
});
