import { it, expect } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { TEAM_DEFS } from '../src/constants';
import { generateSeasonSchedule } from '../src/engine/scheduleGen';
import { startClubFinance, applyClubGameFinance, forecastClubFinance, validateClubFinance } from '../src/engine/clubFinance';

it('calibrates all 12 clubs across fixed-condition seasons, with exact receipts and closing forecasts', () => {
  const schedule = generateSeasonSchedule(2026, TEAM_DEFS), rows = [];
  for (const scenario of [
    { name: 'baseline', popularity: 50, wins: 70, losses: 70, stadiumLevel: 0 },
    { name: 'low-demand', popularity: 0, wins: 40, losses: 100, stadiumLevel: 0 },
    { name: 'high-demand', popularity: 100, wins: 100, losses: 40, stadiumLevel: 0 },
    { name: 'low-price', popularity: 50, wins: 70, losses: 70, stadiumLevel: 0, customAvgTicketPrice: 500 },
    { name: 'high-price', popularity: 50, wins: 70, losses: 70, stadiumLevel: 0, customAvgTicketPrice: 5000 },
    { name: 'upgrade-1', popularity: 50, wins: 70, losses: 70, stadiumLevel: 1 },
    { name: 'upgrade-2', popularity: 50, wins: 70, losses: 70, stadiumLevel: 2 },
    { name: 'upgrade-3', popularity: 50, wins: 70, losses: 70, stadiumLevel: 3 },
  ]) for (const def of TEAM_DEFS) {
    const initial = startClubFinance({ ...def, ...scenario, players: [], farm: [] }, 2026);
    const forecast = forecastClubFinance(initial,schedule); let t = initial;
    for (let gameDay=1;gameDay<=143;gameDay++) {
      const host = schedule[gameDay].matchups.some(m=>m.homeId===t.id);
      t = applyClubGameFinance(t,{year:2026,gameDay,isHomeTeam:host});
    }
    expect(validateClubFinance(t.clubFinance)).toBe(true);
    expect(t.revenueThisSeason).toBe(forecast.revenue.min);
    expect(t.clubFinance.operatingSurplus).toBe(forecast.operatingSurplus.min);
    expect(forecastClubFinance(t,schedule).revenue).toEqual({min:t.revenueThisSeason,max:t.revenueThisSeason});
    expect(Number.isFinite(t.budget)).toBe(true);
    if(scenario.name==='baseline') {
      expect(t.revenueThisSeason).toBeGreaterThan(900000);
      expect(t.revenueThisSeason).toBeLessThan(3500000);
      expect(t.clubFinance.operatingSurplus).toBeGreaterThan(0);
    }
    rows.push({scenario:scenario.name,teamId:def.id,team:def.short,homeGames:t.clubFinance.homeGames,
      revenueManYen:t.revenueThisSeason,operatingCostsManYen:Object.values(t.clubFinance.costs).reduce((a,b)=>a+b,0),
      surplusBeforePlayerPayrollManYen:t.clubFinance.operatingSurplus,closingBudgetManYen:t.budget});
  }
  if(process.env.CLUB_FINANCE_REPORT) {
    mkdirSync(dirname(process.env.CLUB_FINANCE_REPORT),{recursive:true});
    writeFileSync(process.env.CLUB_FINANCE_REPORT,JSON.stringify({
      scope:'96 fixed-condition synthetic seasons; real 2026 schedule and production receipts/forecast functions. No games, growth, contracts or AI are simulated.',
      units:'万円', rows },null,2)+'\n');
  }
});
