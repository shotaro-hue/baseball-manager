import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { generateSeasonSchedule } from '../../src/engine/scheduleGen';

// Real opening rosters and schedule, with controlled historical scores. The
// final 0-over-1 win creates a 2-2 tie: club 0 wins their head-to-head 2-1,
// despite the opposite previous ranking. Everyone has 142 recorded games.
export function finalRankingFixture({ isHome = true, finalDraw = false } = {}) {
  const initial = JSON.parse(gunzipSync(readFileSync(new URL('../../e2e/fixtures/new-game.json.gz', import.meta.url))));
  const teams = initial.teams.map(t => ({ ...t, wins: 0, losses: 0, draws: 0, rf: t.id === 1 ? 100 : 0, ra: t.id === 0 ? 100 : 0 }));
  const schedule = generateSeasonSchedule(initial.year, teams);
  schedule[143] = { ...schedule[143], matchups: [
    { homeId: isHome ? 0 : 1, awayId: isHome ? 1 : 0 },
    ...[[2, 3], [4, 5], [6, 7], [8, 9], [10, 11]].map(([homeId, awayId]) => ({ homeId, awayId })),
  ] };
  const decisions = finalDraw ? [[0, 1], [6, 0], [1, 6]] : [[0, 1], [1, 0], [6, 0], [1, 6]];
  const used = new Set(), wins = new Map();
  for (const [winner, loser] of decisions) {
    const day = schedule.findIndex((entry, day) => day > 0 && day < 143 && !used.has(day)
      && entry.matchups?.some(m => [m.homeId, m.awayId].includes(winner) && [m.homeId, m.awayId].includes(loser)));
    if (day < 1) throw new Error('ranking fixture requires the actual head-to-head schedule');
    used.add(day); wins.set(`${day}:${winner}`, loser);
  }
  const allTeamResultsMap = Object.fromEntries(teams.map(t => [t.id, {}]));
  for (let day = 1; day < 143; day++) for (const { homeId, awayId } of schedule[day].matchups) {
    const h = wins.get(`${day}:${homeId}`) === awayId ? 1 : 0;
    const a = wins.get(`${day}:${awayId}`) === homeId ? 1 : 0;
    for (const [id, oppId, myScore, oppScore] of [[homeId, awayId, h, a], [awayId, homeId, a, h]]) {
      allTeamResultsMap[id][day] = { oppId, homeId, awayId, myScore, oppScore, won: myScore > oppScore, drew: h === a };
      teams.find(t => t.id === id)[h === a ? 'draws' : myScore > oppScore ? 'wins' : 'losses']++;
    }
  }
  const gameResultsMap = Object.fromEntries(Object.entries(allTeamResultsMap[0]).map(([day, row]) =>
    [day, { ...row, isHome: row.homeId === 0, oppTeam: { id: row.oppId } }]));
  return { ...initial, teams, schedule, myId: 0, gameDay: 143, allStarDone: true,
    allTeamResultsMap, gameResultsMap,
    seasonHistory: { ...initial.seasonHistory, standingsHistory: [{ year: initial.year - 1,
      central: [1, 0, 2, 3, 4, 5].map(id => ({ id })), pacific: [6, 7, 8, 9, 10, 11].map(id => ({ id })) }] } };
}
