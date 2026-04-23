import { describe, expect, it } from 'vitest';
import { calcRevenue } from '../finance';

const baseTeam = {
  wins: 70,
  losses: 60,
  popularity: 55,
  stadiumLevel: 0,
  budget: 500000,
};

describe('calcRevenue', () => {
  it('収入が現実的なレンジに収まる', () => {
    const rev = calcRevenue(baseTeam);
    expect(rev.ticket).toBeGreaterThan(1500);
    expect(rev.ticket).toBeLessThan(5000);
    expect(rev.sponsor).toBeGreaterThan(1000);
    expect(rev.sponsor).toBeLessThan(3000);
    expect(rev.merch).toBeGreaterThan(200);
  });

  it('球場投資でチケット収入が増える', () => {
    const low = calcRevenue({ ...baseTeam, stadiumLevel: 0 });
    const high = calcRevenue({ ...baseTeam, stadiumLevel: 3 });
    expect(high.ticket).toBeGreaterThan(low.ticket);
  });
});
