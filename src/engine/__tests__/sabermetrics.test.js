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
