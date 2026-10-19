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
