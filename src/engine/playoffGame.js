import { quickSimGame } from './simulation';
import { applyGameStatsFromLog } from './postGame';
import { prepareTeamForGame } from './rosterAutomation';
import { advancePlayoff, nextPlayoffFixture, recordSeriesGame } from './playoff';

export function simulateNextPlayoffGame(playoff, teams, year, simulate = quickSimGame) {
  const state = advancePlayoff(playoff, year);
  if (state.champion) return { playoff: state, teams, message: '全試合終了' };
  const key = state.phase, series = state[key], fixture = nextPlayoffFixture(series, year);
  const clubs = series.teams.map(snapshot => teams.find(t => t.id === snapshot.id));
  if (clubs.some(t => !t)) throw new Error('出場球団のデータが見つかりません');
  const prepared = clubs.map(t => prepareTeamForGame(t, fixture.useDh));
  const result = simulate(prepared[0], prepared[1], fixture);
  const updated = recordSeriesGame(series, result, fixture);
  // Score/log remain in series team order even when team 1 is the home club.
  const updatedTeams = teams.map(team => {
    const i = clubs.findIndex(t => t.id === team.id);
    if (i < 0) return team;
    const won = i === 0 ? result.score.my > result.score.opp : result.score.opp > result.score.my;
    return { ...team, players: applyGameStatsFromLog(prepared[i].players, result.log || [], i === 0, won, 0, 'playoffStats'),
      rotIdx: (team.rotIdx ?? 0) + 1 };
  });
  const game = updated.games.at(-1);
  const outcome = game.drew ? '引分' : `${clubs[game.winner].name}が勝利`;
  return { playoff: advancePlayoff({ ...state, [key]: updated }, year), teams: updatedTeams,
    message: `${series.label} 第${fixture.number}戦：${outcome}（${game.score}）${updated.done ? ` → ${clubs[updated.winner].name}が突破` : ''}` };
}
