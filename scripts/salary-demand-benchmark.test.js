import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../src/engine/scheduleGen';
import { simulateSeasonBatch } from '../src/workers/seasonBatchCore';
import { calcSeasonAwards } from '../src/engine/awards';
import { calcPlayerDemand } from '../src/engine/contract';
import { emptyStats } from '../src/engine/playerCore';

function realExamples() {
  const team = { id: 0, league: 'セ', wins: 85, losses: 53 };
  const base = { id: 0, personality: { money: 50 } };
  const fixtures = [
    { ...base, name: '岡林勇希・2022年', salary: 740, actual: 4000, stats: { ...emptyStats(), PA: 608, AB: 553, H: 161, BB: 29, HBP: 3, SF: 1, D: 25, T: 10, HR: 0 }, bestNine: true },
    { ...base, name: '村上頌樹・2023年', salary: 700, actual: 6700, isPitcher: true, subtype: '先発', stats: { ...emptyStats(), IP: 144 + 1/3, ER: 28, Kp: 137, BBp: 15, W: 10 }, title: 'era', mvp: true, rookie: true },
    { ...base, name: '桐敷拓馬・2024年', salary: 3300, actual: 8800, isPitcher: true, subtype: '中継ぎ', stats: { ...emptyStats(), IP: 65 + 1/3, ER: 13, Kp: 60, BBp: 18, HLD: 40 }, title: 'hld' },
  ];
  return fixtures.map(p => {
    // These comparison fixtures isolate current-season performance and supplied awards.
    // They deliberately omit unavailable individual history, market and personality data.
    const winner = { playerId: p.id, value: p.title === 'era' ? 1.75 : p.title === 'avg' ? .291 : 40 };
    const awards = { version: 2, year: 2026, titles: { central: p.title ? { [p.title]: winner } : {} }, bestNine: { central: { 外野手: p.bestNine ? [winner] : [] } }, mvp: { central: p.mvp ? winner : null }, rookie: { central: p.rookie ? winner : null } };
    return { name: p.name, previous: p.salary, actual: p.actual,
      withoutAwards: calcPlayerDemand(p).demandSalary,
      withSuppliedAwards: calcPlayerDemand(p, { year: 2026, team, awards }).demandSalary };
  });
}

describe.skipIf(!process.env.RUN_SALARY_BENCHMARK)('salary balance benchmark', () => {
  it('evaluates a seeded generated season and repeated fixed performance without runaway demands', () => {
    let seed = 42;
    const random = vi.spyOn(Math, 'random').mockImplementation(() => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; });
    const logging = vi.spyOn(console, 'log').mockImplementation(() => {});
    let report;
    try {
      const teams = createInitialTeams();
      const schedule = generateSeasonSchedule(2026, teams);
      const snapshot = { teams, schedule, faPool: [], seasonHistory: { awards: [], records: {}, hallOfFame: [], championships: [], standingsHistory: [], transfers: [] }, news: [], mailbox: [], myId: teams[0].id, gameDay: 1, year: 2026, allStarDone: false, allStarResult: null, allStarTriggerDay: calcAllStarTriggerDay(schedule, []), saveRevision: 0 };
      const result = simulateSeasonBatch({ snapshot, count: 100 });
      const simulated = result.nextState.teams;
      const awards = calcSeasonAwards(simulated, 2026);
      const salaryContext = { year: 2026, awards, teams: simulated };
      const rows = simulated.map(team => {
        const before = team.players.reduce((sum, p) => sum + p.salary, 0);
        const demands = team.players.map(p => calcPlayerDemand(p, { ...salaryContext, team }));
        const after = demands.reduce((sum, d) => sum + d.demandSalary, 0);
        expect(demands.every(d => Number.isFinite(d.demandSalary) && d.demandSalary >= d.minOfferSalary)).toBe(true);
        let fixed = team.players;
        const repeated = [];
        for (let y = 0; y < 15; y++) {
          fixed = fixed.map(p => ({ ...p, salary: calcPlayerDemand(p, { ...salaryContext, team }).demandSalary }));
          repeated.push(fixed.reduce((sum, p) => sum + p.salary, 0));
        }
        // Fixed roles, statistics and awards; this is a convergence check, not full 15-year gameplay.
        expect(Math.abs(repeated.at(-1) - repeated.at(-2))).toBeLessThan(before * .01 + 1000);
        return { team: team.name, games: team.wins + team.losses + (team.draws || 0), activePlayers: team.players.length,
          previousPayroll: before, nextDemandPayroll: after, ratio: +(after / before).toFixed(3), budget: team.budget,
          missingAssessments: demands.filter(d => !d.assessment.recorded).length, fixedPerformancePayroll: repeated };
      });
      const total = key => rows.reduce((sum, row) => sum + row[key], 0);
      report = { seed: 42, simulatedUserGames: result.batchResults.length,
        limitations: ['100-game partial-season data, not full-season final awards', 'Demand amounts, not negotiated payroll', 'All active players hypothetically renewed, regardless of remaining contract', 'No team championship supplied', '15-year check holds statistics/awards fixed; no aging, injuries, roster changes or cashflow simulation'],
        npbExamples: realExamples(), previousPayroll: total('previousPayroll'), nextDemandPayroll: total('nextDemandPayroll'), teams: rows };
      expect(result.batchResults.length).toBeGreaterThanOrEqual(100);
      expect(report.nextDemandPayroll).toBeLessThan(report.previousPayroll * 1.5);
    } finally { random.mockRestore(); logging.mockRestore(); }
    if (process.env.SALARY_BENCHMARK_REPORT) writeFileSync(process.env.SALARY_BENCHMARK_REPORT, JSON.stringify(report, null, 2) + '\n');
    console.info('[salary-demand-benchmark]', JSON.stringify(report));
  }, 120000);
});
