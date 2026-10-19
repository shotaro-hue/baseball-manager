import { it, expect } from 'vitest';
import { createInitialTeams } from '../bootstrapTeams';
import { generateSeasonSchedule } from '../scheduleGen';
import { simulateSeasonBatch } from '../../workers/seasonBatchCore';

it('new games accrue actual home/away club receipts through the real season worker', async () => {
  const teams = createInitialTeams(), schedule = generateSeasonSchedule(2026, teams);
  expect(teams.every(t => t.clubFinance?.version === 1)).toBe(true);
  const snapshot = { teams, schedule, myId: 0, year: 2026, gameDay: 1, faPool: [],
    seasonHistory: { transfers: [] }, news: [], mailbox: [], gameResultsMap: {}, scheduleArchive: [],
    allStarDone: true, allStarTriggerDay: 72, saveRevision: 0 };
  const result = await simulateSeasonBatch({ snapshot, count: 2, isCancelled: () => false });
  const after = result.nextState.teams;
  for (const t of after) {
    const hosts = [1, 2].filter(round => schedule[round].matchups.some(m => m.homeId === t.id)).length;
    expect(t.clubFinance.homeGames).toBe(hosts);
    expect(t.clubFinance.awayGames).toBe(2 - hosts);
    expect(t.revenueThisSeason).toBe(Object.values(t.clubFinance.income).reduce((a, b) => a + b, 0));
    if (!hosts) expect(t.clubFinance.income.ticket).toBe(0);
    expect(t.budget).toBe(teams.find(x => x.id === t.id).budget + t.clubFinance.operatingSurplus);
  }
});

it('the season worker posts the one-day quote based on the initial popularity and record', async () => {
  const teams = createInitialTeams(), schedule = generateSeasonSchedule(2026, teams);
  const snapshot = { teams, schedule, myId: 0, year: 2026, gameDay: 1, faPool: [],
    seasonHistory: { transfers: [] }, news: [], mailbox: [], gameResultsMap: {}, scheduleArchive: [],
    allStarDone: true, allStarTriggerDay: 72, saveRevision: 0 };
  const { nextState } = await simulateSeasonBatch({ snapshot, count: 1, isCancelled: () => false });
  const { calcClubGameFinance } = await import('../clubFinance');
  for (const after of nextState.teams) {
    const pre = teams.find(team => team.id === after.id);
    const match = schedule[1].matchups.find(m => m.homeId === after.id || m.awayId === after.id);
    expect(match).toBeTruthy();
    const home = match.homeId === after.id, quote = calcClubGameFinance(pre, home, 1);
    expect(after.clubFinance.income).toEqual(quote.income);
    expect(after.clubFinance.costs).toEqual(quote.costs);
    expect(after.budget - pre.budget).toBe(quote.operatingSurplus);
    expect(after.clubFinance.postedRounds).toEqual([1]);
  }
});
