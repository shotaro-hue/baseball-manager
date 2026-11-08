import { rankLeague, teamWinRate } from './standings';
import { createPostseasonCalendar, playoffGameDate, postseasonStartDate, validatePlayoffCalendar } from './postseasonCalendar';

export const PLAYOFF_ORDER = ['cs1_se', 'cs1_pa', 'cs2_se', 'cs2_pa', 'jpSeries'];
// Freeze season records; never duplicate full player logs in saves.
export function playoffTeam(team) {
  return Object.fromEntries(['id', 'name', 'short', 'emoji', 'color', 'league', 'wins', 'losses', 'draws', 'dhEnabled']
    .map(key => [key, team[key]]));
}
export function createSeries(top, challenger, kind, year = 2026) {
  const gap = ((top.wins - challenger.wins) + (challenger.losses - top.losses)) / 2;
  const special = kind === 'final' && year >= 2026 && (gap >= 10 || teamWinRate(challenger) < .5);
  const advantage = kind === 'final' ? special ? 2 : 1 : 0;
  return {
    label: kind === 'japan' ? '日本シリーズ' : `CS${kind === 'first' ? 'ファースト' : 'ファイナル'}ステージ（${top.league}）`,
    kind, rulesVersion: year >= 2026 ? 2026 : 2025, year,
    teams: [playoffTeam(top), playoffTeam(challenger)],
    wins: [advantage, 0], adv: [advantage, 0], games: [], done: false, winner: null,
    need: kind === 'first' ? 2 : special ? 5 : 4,
    maxGames: kind === 'japan' ? null : kind === 'first' ? 3 : special ? 7 : 6,
    specialReason: special ? [gap >= 10 && '10ゲーム差以上', teamWinRate(challenger) < .5 && '勝ち上がり球団の勝率5割未満'].filter(Boolean).join('・') : null,
  };
}

export function initPlayoff(teams, { year = 2026, schedule, ...context } = {}) {
  const se = rankLeague(teams, 'セ', context), pa = rankLeague(teams, 'パ', context);
  const calendar = schedule === undefined ? null : createPostseasonCalendar({ year, schedule });
  const datedSeries = (top, challenger) => ({ ...createSeries(top, challenger, 'first', year),
    ...(calendar ? { startDate: postseasonStartDate(calendar, 'first') } : {}) });
  return {
    year, phase: 'cs1_se', rulesVersion: year >= 2026 ? 2026 : 2025,
    ...(calendar ? { calendar } : {}),
    cs1_se: datedSeries(se.teams[1], se.teams[2]),
    cs1_pa: datedSeries(pa.teams[1], pa.teams[2]),
    cs2_se: null, cs2_pa: null, jpSeries: null, champion: null,
    se1: playoffTeam(se.teams[0]), pa1: playoffTeam(pa.teams[0]),
    rankingWarnings: [...new Set([...se.warnings, ...pa.warnings])],
  };
}
// Keep a legacy series' agreed advantage when resuming it.
export function seriesRules(series) {
  const kind = series.kind || (series.label === '日本シリーズ' ? 'japan'
    : series.label?.includes('ファースト') ? 'first' : 'final');
  return { kind, need: series.need ?? (kind === 'first' ? 2 : (series.adv?.[0] === 2 ? 5 : 4)),
    maxGames: kind === 'japan' ? null : series.maxGames ?? (kind === 'first' ? 3 : series.adv?.[0] === 2 ? 7 : 6) };
}
export function seriesWinner(series, need = seriesRules(series).need) {
  if (series.wins[0] >= need) return 0;
  if (series.wins[1] >= need) return 1;
  const { maxGames } = seriesRules(series);
  if (maxGames == null) return null;
  const remaining = Math.max(0, maxGames - series.games.length);
  if (series.wins[0] >= series.wins[1] + remaining) return 0;
  if (remaining === 0) return series.wins[0] >= series.wins[1] ? 0 : 1;
  return null;
}
export function recordSeriesGame(series, result, fixture) {
  if (series.done) return series;
  const a = result.score.my, b = result.score.opp;
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) throw new Error('試合結果が不正です');
  if (seriesRules(series).kind === 'japan' && series.games.length >= 7 && a === b)
    throw new Error('第8戦以降は引分で終了できません');
  const date = series.startDate === undefined ? null : playoffGameDate(series, series.games.length + 1);
  if (date && fixture && fixture.date !== date) throw new Error('ポストシーズンの試合日が一致しません。');
  const playedFixture = fixture ?? (date ? nextPlayoffFixture(series) : null);
  const winner = a === b ? null : a > b ? 0 : 1;
  const next = { ...series,
    wins: series.wins.map((n, i) => n + (winner === i ? 1 : 0)),
    games: [...series.games, { ...(date ? { date } : {}), score: `${a}-${b}`, scores: [a, b], won0: winner === 0,
      drew: winner === null, winner, homeId: playedFixture?.homeId, inningSummary: result.inningSummary || [] }],
  };
  const seriesResult = seriesWinner(next);
  return { ...next, done: seriesResult !== null, winner: seriesResult };
}

// Create each stage once. Both simulation controls use this same transition.
export function advancePlayoff(playoff, year = playoff.year ?? 2026) {
  validatePlayoffCalendar(playoff, { year });
  const next = { ...playoff, year };
  const makeSeries = (top, challenger, kind) => ({ ...createSeries(top, challenger, kind, year),
    ...(next.calendar ? { startDate: postseasonStartDate(next.calendar, kind) } : {}) });
  for (const key of PLAYOFF_ORDER) {
    if (key === 'cs2_se' && !next[key] && next.cs1_se?.done)
      next[key] = makeSeries(next.se1, next.cs1_se.teams[next.cs1_se.winner], 'final');
    if (key === 'cs2_pa' && !next[key] && next.cs1_pa?.done)
      next[key] = makeSeries(next.pa1, next.cs1_pa.teams[next.cs1_pa.winner], 'final');
    if (key === 'jpSeries' && !next[key] && next.cs2_se?.done && next.cs2_pa?.done)
      next[key] = makeSeries(next.cs2_se.teams[next.cs2_se.winner], next.cs2_pa.teams[next.cs2_pa.winner], 'japan');
    if (!next[key] || !next[key].done) return { ...next, phase: key };
  }
  return { ...next, phase: 'champion', champion: next.jpSeries.teams[next.jpSeries.winner] };
}

export function nextPlayoffFixture(series, year = series.year ?? 2026) {
  const { kind } = seriesRules(series), number = series.games.length + 1;
  const openingLeague = year % 2 === 0 ? 'セ' : 'パ';
  const homeLeague = [1, 2, 6, 7, 8].includes(number) ? openingLeague : openingLeague === 'セ' ? 'パ' : 'セ';
  const homeIndex = kind !== 'japan' ? 0 : series.teams.findIndex(t => t.league === homeLeague);
  const homeClinchOnDraw = kind !== 'japan' && seriesWinner({ ...series, games: [...series.games, {}] }) === 0;
  return { number, ...(series.startDate === undefined ? {} : { date: playoffGameDate(series, number) }),
    homeId: series.teams[homeIndex].id, isMyHome: homeIndex === 0,
    useDh: year >= 2027 || series.teams[homeIndex].league === 'パ', postseason: true,
    maxInnings: kind === 'japan' && number >= 8 ? null : 12, homeClinchOnDraw };
}
export function encodePlayoff(playoff) {
  if (!playoff) return null;
  validatePlayoffCalendar(playoff);
  return { ...playoff, se1: playoffTeam(playoff.se1), pa1: playoffTeam(playoff.pa1),
    champion: playoff.champion ? playoffTeam(playoff.champion) : null,
    ...Object.fromEntries(PLAYOFF_ORDER.map(key => [key, playoff[key]
      ? { ...playoff[key], teams: playoff[key].teams.map(playoffTeam) } : null])) };
}

// Replay every saved series, including those after an unfinished one. Shared
// by persistence and closing; undated histories retain their legacy contract.
export function validatePlayoffResults(playoff, context = {}) {
  if (!validatePlayoffCalendar(playoff, context)) return false;
  const fail = () => { throw new Error('ポストシーズンの確定結果が保存履歴と一致しません。'); };
  const sameTeam = (a, b) => a && b && ['id', 'league', 'wins', 'losses', 'draws'].every(field => a[field] === b[field]);
  const entrants = [playoff.se1, ...(playoff.cs1_se?.teams ?? []), playoff.pa1, ...(playoff.cs1_pa?.teams ?? [])];
  if (entrants.length !== 6 || new Set(entrants.map(t => t?.id)).size !== 6
    || entrants.some((t, i) => !t || t.id == null || t.league !== (i < 3 ? 'セ' : 'パ')
      || (context.teams && !context.teams.some(club => club.id === t.id && club.league === t.league)))) fail();
  for (const key of PLAYOFF_ORDER) {
    const series = playoff[key];
    if (!series) continue;
    if (!Array.isArray(series.teams) || series.teams.length !== 2) fail();
    let replay = { ...createSeries(...series.teams, series.kind, playoff.year), startDate: series.startDate };
    for (const game of series.games) {
      if (replay.done || !Array.isArray(game.scores) || game.scores.length !== 2
        || game.scores.some(n => !Number.isSafeInteger(n) || n < 0)) fail();
      replay = recordSeriesGame(replay, { score: { my: game.scores[0], opp: game.scores[1] } }, nextPlayoffFixture(replay));
      const expected = replay.games.at(-1);
      if (['date', 'score', 'winner', 'drew', 'won0', 'homeId'].some(field => expected[field] !== game[field])) fail();
    }
    if (replay.done !== series.done || replay.winner !== series.winner || replay.need !== series.need
      || replay.maxGames !== series.maxGames || replay.rulesVersion !== series.rulesVersion
      || JSON.stringify(replay.wins) !== JSON.stringify(series.wins)
      || JSON.stringify(replay.adv) !== JSON.stringify(series.adv)) fail();
  }
  const winner = key => playoff[key]?.done ? playoff[key].teams[playoff[key].winner] : null;
  for (const [key, top, challenger] of [
    ['cs2_se', playoff.se1, winner('cs1_se')], ['cs2_pa', playoff.pa1, winner('cs1_pa')],
    ['jpSeries', winner('cs2_se'), winner('cs2_pa')],
  ]) {
    const series = playoff[key];
    if (series && (!sameTeam(series.teams[0], top) || !sameTeam(series.teams[1], challenger))) fail();
  }
  const next = advancePlayoff(playoff);
  if (playoff.phase !== next.phase || playoff.rulesVersion !== (playoff.year >= 2026 ? 2026 : 2025)
    || (next.phase === 'champion' ? !sameTeam(playoff.champion, winner('jpSeries')) : playoff.champion != null)) fail();
  return true;
}

// Validate the saved source before legacy load code can generate a replacement schedule.
export function validatePostseasonSave(world) {
  const plan = world.offseasonPlan;
  if (!plan?.playoff) return false;
  const dated = validatePlayoffResults(plan.playoff, { year: world.year, schedule: world.schedule, teams: world.teams });
  if (dated && (plan.year !== world.year || plan.myId !== world.myId))
    throw new Error('ポストシーズンの日付・保存履歴を確認してください。');
  return dated;
}

// An input for the future annual close command, not an annual transaction receipt.
export function postseasonClosingDate(playoff, context) {
  if (!validatePlayoffResults(playoff, context) || playoff.phase !== 'champion') return null;
  return playoff.jpSeries.games.at(-1).date;
}
