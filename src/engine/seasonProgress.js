import { SEASON_GAMES } from '../constants';

const isCount = value => Number.isSafeInteger(value) && value >= 0;

// Standings count played games; gameDay is the next scheduled round (1-based),
// not a calendar date. Missing draws in legacy saves means zero, not repair.
export function regularSeasonProgress(team, scheduledGames = SEASON_GAMES) {
  const invalid = { valid: false, playedGames: null, remainingGames: 0 };
  if (!team || !isCount(scheduledGames) || scheduledGames === 0) return invalid;
  const draws = team.draws === undefined ? 0 : team.draws;
  if (![team.wins, team.losses, draws].every(isCount)) return invalid;
  const playedGames = team.wins + team.losses + draws;
  return { valid: playedGames <= scheduledGames, playedGames,
    remainingGames: Math.max(0, scheduledGames - playedGames) };
}

export function batchGameOptions(remainingGames) {
  if (!isCount(remainingGames) || remainingGames === 0) return [];
  const options = [];
  for (let count = 5; count <= remainingGames; count += 5) options.push(count);
  if (!options.includes(remainingGames)) options.push(remainingGames);
  return options;
}

// Keep the existing round-based ceiling, and require agreement with standings.
// Never invent a matchup or replay an existing result to repair an old save.
export function regularSeasonRequest(snapshot, requestedCount) {
  const fail = reason => ({ count: 0, reason });
  const team = Array.isArray(snapshot?.teams) ? snapshot.teams.find(t => t?.id === snapshot.myId) : null;
  const progress = regularSeasonProgress(team);
  if (!progress.valid) return fail('成績データを確認できません。保存データを読み直してください。');
  const plan = snapshot.offseasonPlan;
  if (plan && plan.year === snapshot.year && plan.myId === snapshot.myId && plan.stage !== 'new_season')
    return fail('通常シーズンは終了しています。続きの手続きへ戻ってください。');
  if (progress.remainingGames === 0) return fail('通常シーズンは終了しています。');
  if (!Number.isSafeInteger(requestedCount) || requestedCount <= 0) return fail('実行する試合数が不正です。');
  const day = snapshot.gameDay;
  if (!Number.isSafeInteger(day) || day < 1 || day > SEASON_GAMES || day - 1 !== progress.playedGames)
    return fail('成績と日程の進行位置が一致しません。保存データを読み直してください。');
  const count = Math.min(requestedCount, progress.remainingGames, SEASON_GAMES - (day - 1));
  for (let offset = 0; offset < count; offset++) {
    const round = day + offset;
    const matchups = snapshot.schedule?.[round]?.matchups;
    const mine = Array.isArray(matchups) ? matchups.filter(m => m && (m.homeId === team.id || m.awayId === team.id)) : null;
    if (mine?.length !== 1 || snapshot.gameResultsMap?.[round]) return fail('未実行の対戦日程を確認できません。保存データを読み直してください。');
    const opponentId = mine[0].homeId === team.id ? mine[0].awayId : mine[0].homeId;
    if (opponentId === team.id || !snapshot.teams.some(t => t?.id === opponentId)) return fail('対戦相手を確認できません。');
  }
  return { count, reason: null };
}
