import { describe, expect, it } from 'vitest';
import { saberBatter } from '../sabermetrics';

describe('saberBatter', () => {
  it('uses every official wOBA plate-appearance component in the denominator exactly once', () => {
    const stats = {
      PA: 145,
      AB: 120,
      H: 30,
      D: 5,
      T: 1,
      HR: 4,
      BB: 15,
      HBP: 3,
      SF: 2,
      K: 35,
    };

    // (0.69*BB + 0.72*HBP + 0.88*1B + 1.24*2B + 1.56*3B + 2.01*HR)
    // / (AB + BB + HBP + SF)
    const expected = (
      0.69 * 15 + 0.72 * 3 + 0.88 * 20 + 1.24 * 5 + 1.56 + 2.01 * 4
    ) / (120 + 15 + 3 + 2);

    expect(saberBatter(stats).wOBA).toBeCloseTo(expected, 3);
  });

  it('does not let strikeouts alter the wOBA denominator beyond their existing at-bat', () => {
    const common = { PA: 100, AB: 80, H: 20, D: 2, T: 0, HR: 2, BB: 15, HBP: 2, SF: 1 };
    expect(saberBatter({ ...common, K: 10 }).wOBA)
      .toBe(saberBatter({ ...common, K: 40 }).wOBA);
  });
});

const known = { PA: 500, AB: 450, H: 129, D: 25, T: 3, HR: 14, BB: 40, HBP: 5, SF: 5, K: 80 };
it('FIX-S3 computes .797 from unrounded OBP and SLG and preserves other metrics', () => {
  expect(saberBatter(known)).toMatchObject({ OPS: .797, OBP: .348, SLG: .449, wOBA: .343, WAR: 1.22 });
});
it('FIX-S3 adds raw components before rounding (not .333 + .333)', () => {
  expect(saberBatter({ ...known, AB: 3, H: 1, D: 0, T: 0, HR: 0, BB: 0, HBP: 0, SF: 0 }).OPS).toBe(.667);
});
it('FIX-S3 separates third-decimal results previously tied at .80', () => {
  expect(saberBatter({ ...known, H: 130, D: 26 }).OPS).toBe(.803);
  expect(saberBatter(known).OPS).toBe(.797);
});
