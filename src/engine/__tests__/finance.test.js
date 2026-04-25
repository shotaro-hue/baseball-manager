import { describe, expect, it } from 'vitest';
import { calcRevenue } from '../finance';

const baseTeam = {
  id: 0,
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
    expect(rev.ticket).toBe(Math.round((rev.avgTicketPrice * rev.attendance) / 10000));
    expect(rev.attendance).toBeGreaterThan(10000);
    expect(rev.avgTicketPrice).toBeGreaterThan(600);
  });

  it('球場投資でチケット収入が増える', () => {
    const low = calcRevenue({ ...baseTeam, stadiumLevel: 0 });
    const high = calcRevenue({ ...baseTeam, stadiumLevel: 3 });
    expect(high.ticket).toBeGreaterThan(low.ticket);
  });

  it('手動価格設定で価格を上げると動員が減る', () => {
    const normal = calcRevenue(baseTeam);
    const expensive = calcRevenue({ ...baseTeam, customAvgTicketPrice: normal.avgTicketPrice * 1.5 });
    expect(expensive.avgTicketPrice).toBeGreaterThan(normal.avgTicketPrice);
    expect(expensive.attendance).toBeLessThan(normal.attendance);
  });

  it('価格を下げても動員は本拠地収容人数を超えない', () => {
    const rev = calcRevenue({
      ...baseTeam,
      wins: 120,
      losses: 10,
      popularity: 100,
      budget: 3000000,
      customAvgTicketPrice: 500,
    });
    expect(rev.attendance).toBeLessThanOrEqual(30969);
  });
});
