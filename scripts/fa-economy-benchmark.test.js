import { describe, it, expect, vi } from 'vitest';
import { writeFileSync } from 'node:fs';
import { createInitialTeams } from '../src/engine/bootstrapTeams';
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../src/engine/scheduleGen';
import { simulateSeasonBatch } from '../src/workers/seasonBatchCore';
import { calcSeasonAwards } from '../src/engine/awards';
import { cpuRenewContracts, processCpuFaBids } from '../src/engine/contract';
import { resolveOffseasonFaDeclarations } from '../src/engine/faDeclaration';
import { developPlayers } from '../src/engine/player';
import { prepareOffseasonFreeAgent } from '../src/engine/offseasonMarket';
import { SEASON_GAMES } from '../src/constants';
import { nextEconomyYear, collectEconomyDemands, createEconomyMarketEntries, economyPriceMismatches } from './faEconomyModel';

const totalPay = teams => teams.reduce((sum, t) => sum + [...t.players, ...t.farm].reduce((s, p) => s + p.salary, 0), 0);
const median = values => { const v = values.slice().sort((a, b) => a - b); return v.length ? (v[Math.floor((v.length - 1) / 2)] + v[Math.floor(v.length / 2)]) / 2 : null; };
const round = n => Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
const salaryGroups = rows => [
  ['29歳以下', r => r.age <= 29], ['30歳以上', r => r.age >= 30],
  ['一軍所属', r => r.roster === 'active'], ['二軍所属・支配下', r => r.roster === 'farm' && !r.ikusei], ['育成', r => r.ikusei],
  ['野手400打席以上', r => !r.pitcher && r.pa >= 400],
  ['野手400打席・OPS.800以上', r => !r.pitcher && r.pa >= 400 && r.ops >= .8],
  ['野手20本塁打以上', r => !r.pitcher && r.hr >= 20],
  ['投手100回以上', r => r.pitcher && r.ip >= 100],
  ['投手120回・防御率3.00以下', r => r.pitcher && r.ip >= 120 && Number.isFinite(r.era) && r.era <= 3],
  ['救援40回以上', r => r.pitcher && /中継ぎ|抑え/.test(r.role) && r.ip >= 40],
].map(([label, match]) => { const group = rows.filter(match); return { label, count: group.length,
  medianPrevious: median(group.map(r => r.previous)), medianDemand: median(group.map(r => r.demand)),
  medianChangeRatio: round(median(group.filter(r => r.previous > 0).map(r => r.demand / r.previous))) }; });

describe.skipIf(!process.env.RUN_FA_ECONOMY_BENCHMARK)('seeded multi-season FA economy', () => {
  it('records full seasons, asking salaries, market outcomes and cashflow separately', () => {
    const seeds = (process.env.FA_ECONOMY_SEEDS || '1,42').split(',').map(Number);
    const years = Number(process.env.FA_ECONOMY_YEARS || 3);
    const report = { modelVersion: 2, sourceCommit: process.env.FA_ECONOMY_SOURCE_COMMIT || null,
      seeds, years, scenario: 'All clubs use CPU renewal and acquisition; no user-first signing',
      limitations: ['No draft, retirement, posting, playoffs, ikusei expiry or championship salary bonus',
        'Growth and aging run; roster replenishment is omitted, so long-term population is not validated',
        'Initial registration days/personality are game-generated, not historical NPB observations',
        'FA re-qualification after exercise remains the current cumulative-days policy',
        'Budgets are game money with CPU renewal deductions and the annual budget floor; not NPB accounting'], runs: [] };
    for (const initialSeed of seeds) {
      let seed = initialSeed;
      const random = vi.spyOn(Math, 'random').mockImplementation(() => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; });
      const logging = vi.spyOn(console, 'log').mockImplementation(() => {});
      try {
        let teams = createInitialTeams(); let pool = [];
        const run = { seed: initialSeed, initialPayroll: totalPay(teams), seasons: [] };
        report.runs.push(run);
        for (let index = 0; index < years; index++) {
          const year = 2026 + index;
          const schedule = generateSeasonSchedule(year, teams);
          const season = simulateSeasonBatch({ count: SEASON_GAMES, autoManageMyTeam: true, snapshot: {
            teams, schedule, faPool: pool, year, gameDay: 1, myId: teams[0].id,
            allStarDone: false, allStarTriggerDay: calcAllStarTriggerDay(schedule, []),
            seasonHistory: { awards: [], records: {}, hallOfFame: [], championships: [], standingsHistory: [], transfers: [] },
            news: [], mailbox: [], saveRevision: 0 } });
          teams = season.nextState.teams.map(t => ({ ...t,
            players: developPlayers(t.players, t.coaches || []).players,
            farm: developPlayers(t.farm, t.coaches || []).players }));
          pool = season.nextState.faPool;
          const context = { year, awards: calcSeasonAwards(teams, year) };
          const demandRows = collectEconomyDemands(teams, context);
          const payrollBefore = totalPay(teams);
          const declarations = resolveOffseasonFaDeclarations(teams, year, context);
          const renewal = cpuRenewContracts(declarations.updatedTeams, null, teams, context);
          const cpuEntries = createEconomyMarketEntries(renewal.newFaPlayers, teams, year);
          const entries = [...declarations.newFaPlayers, ...cpuEntries];
          const market = processCpuFaBids(renewal.updatedTeams, null, [...pool, ...entries], teams, year, 'offseason');
          const claimed = market.claimed || [];
          const enteredIds = new Set(entries.map(p => p.id));
          const domesticIds = new Set(entries.filter(p => p.marketEntryReason === '国内FA宣言').map(p => p.id));
          const acquisitions = claimed.filter(c => enteredIds.has(c.player.id));
          const newDomestic = acquisitions.filter(c => domesticIds.has(c.player.id));
          const after = market.updatedTeams;
          const row = { year, completedTeamGames: teams.map(t => t.wins + t.losses + (t.draws || 0)),
            expiring: demandRows.length, faQualified: demandRows.filter(r => r.qualified).length,
            declarationEligible: demandRows.filter(r => r.decision).length,
            expectedIndependentDeclarations: round(demandRows.reduce((s, r) => s + (r.decision?.probability || 0), 0)),
            independentDeclarations: declarations.newFaPlayers.length,
            negotiationDeclarations: cpuEntries.filter(p => p.marketEntryReason === '国内FA宣言').length,
            freeContracts: cpuEntries.filter(p => p.marketEntryReason !== '国内FA宣言').length,
            domesticTransfers: newDomestic.filter(c => c.teamId !== c.player.faOriginTeamId).length,
            domesticStays: newDomestic.filter(c => c.teamId === c.player.faOriginTeamId).length,
            domesticUnsigned: entries.filter(p => domesticIds.has(p.id) && !newDomestic.some(c => c.player.id === p.id)).length,
            payrollBefore, payrollAfter: totalPay(after), salaryGroups: salaryGroups(demandRows),
            marketPriceMismatches: economyPriceMismatches(entries, demandRows),
            teams: after.map(t => ({ name: t.name, active: t.players.length, farm: t.farm.length,
              budgetBeforeRenewal: teams.find(x => x.id === t.id).budget,
              budgetAfterRenewal: renewal.updatedTeams.find(x => x.id === t.id).budget,
              budgetAfterMarket: t.budget })) };
          expect(row.completedTeamGames.every(n => n === SEASON_GAMES)).toBe(true);
          expect(after.every(t => Number.isFinite(t.budget) && t.budget >= 0)).toBe(true);
          expect(new Set(claimed.map(c => c.player.id)).size).toBe(claimed.length);
          expect(demandRows.every(r => Number.isFinite(r.demand) && r.demand > 0)).toBe(true);
          expect(row.marketPriceMismatches).toEqual([]);
          const ownedIds = after.flatMap(t => [...t.players, ...t.farm].map(p => p.id));
          expect(new Set(ownedIds).size).toBe(ownedIds.length);
          run.seasons.push(row);
          if (process.env.FA_ECONOMY_REPORT) writeFileSync(process.env.FA_ECONOMY_REPORT, JSON.stringify(report, null, 2) + '\n');
          console.info('[fa-economy-progress]', initialSeed, year, row.independentDeclarations, row.negotiationDeclarations, row.marketPriceMismatches.length);
          teams = nextEconomyYear(after, year);
          pool = market.remainingFaPool.map(p => ({ ...prepareOffseasonFreeAgent(p, year), age: p.age + 1 }));
        }
      } finally { random.mockRestore(); logging.mockRestore(); }
    }
    if (process.env.FA_ECONOMY_REPORT) writeFileSync(process.env.FA_ECONOMY_REPORT, JSON.stringify(report, null, 2) + '\n');
  }, 300000);
});
