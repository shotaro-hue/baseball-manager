import { finalRankingFixture } from './season-ranking';
import { closedPostseasonWorld, completedPlayoff } from '../../src/engine/__tests__/fixtures/openOffseason';
import { standingsContext } from '../../src/engine/standings';
import { postseasonClosingDate } from '../../src/engine/playoff';

// PR-A's complete 142-round score fixture plus the final result. Club 0 beats
// club 1 by head-to-head, while the recorded previous ranking puts 1 first.
export function tiedClosingWorld({ previousOnly = false } = {}) {
  const snapshot = finalRankingFixture(), w = closedPostseasonWorld();
  w.schedule = snapshot.schedule; w.seasonHistory = snapshot.seasonHistory;
  w.teams = w.teams.map(t => {
    const old = snapshot.teams.find(x => x.id === t.id);
    return { ...t, wins: old.wins, losses: old.losses, draws: old.draws };
  });
  w.allTeamResultsMap = snapshot.allTeamResultsMap;
  for (const { homeId, awayId } of w.schedule[143].matchups) {
    const homeScore = homeId === 0 ? 1 : 0;
    for (const [id, oppId, myScore, oppScore] of [[homeId, awayId, homeScore, 0], [awayId, homeId, 0, homeScore]]) {
      w.allTeamResultsMap[id][143] = { oppId, myScore, oppScore };
      w.teams.find(t => t.id === id)[myScore === oppScore ? 'draws' : myScore > oppScore ? 'wins' : 'losses']++;
    }
  }
  if (previousOnly) delete w.allTeamResultsMap;
  w.offseasonPlan.playoff = completedPlayoff(w.teams, w.year, w.schedule, false,
    standingsContext(w.seasonHistory, w.allTeamResultsMap, w.year));
  w.contractEconomy.clock.date = postseasonClosingDate(w.offseasonPlan.playoff, { year: w.year, schedule: w.schedule, teams: w.teams });
  return w;
}
