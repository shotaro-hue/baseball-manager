import { parseContractDate } from './contractCalendar';
import { SEASON_GAMES } from '../constants';
import { postseasonClosingDate } from './playoff';

// A dated, completed snapshot is the only source for this native boundary.
// gameDay is checked as a position, never converted into a civil date.
export function postseasonBoundaryDate(world) {
  const plan = world.offseasonPlan;
  if (world.gameDay !== SEASON_GAMES + 1 || plan?.stage !== 'postseason'
    || plan.year !== world.year || plan.myId !== world.myId || !plan.playoff
    || !Array.isArray(world.teams) || !world.teams.length
    || world.teams.some(t => ![t.wins, t.losses, t.draws].every(n => Number.isSafeInteger(n) && n >= 0)
      || t.wins + t.losses + t.draws !== SEASON_GAMES))
    throw new Error('閉幕した年度の公式戦成績・保存済みポストシーズンが必要です。');
  const date = postseasonClosingDate(plan.playoff, { year: world.year, schedule: world.schedule, teams: world.teams });
  const p = plan.playoff, entrants = [p.se1, ...(p.cs1_se?.teams ?? []), p.pa1, ...(p.cs1_pa?.teams ?? [])];
  if (!date || entrants.some(t => !world.teams.some(club => club.id === t.id
    && ['league', 'wins', 'losses', 'draws'].every(k => club[k] === t[k]))))
    throw new Error('閉幕日と凍結した公式戦成績が一致しません。');
  return date;
}

// Civil dates are input, never inferred from the number of games played.
export function economyClockFor({ season, phase, schedule, gameDay, offseasonTurn }) {
  if (!Number.isInteger(season) || season < 1 || season > 9999
    || !['preseason', 'season', 'offseason'].includes(phase)) throw new Error('契約時計の年度・フェーズを確認してください。');
  let date;
  const year = String(season).padStart(4, '0');
  if (phase === 'season') {
    // gameDay is the NEXT official round, not an arbitrary schedule index.
    // 144/145 store July All-Star dates; after the final game no current
    // official date exists. A future postseason producer must supply its own
    // dated boundary, never clamp/infer a date from completed game counts.
    const entry = Number.isSafeInteger(gameDay) && gameDay >= 1 && gameDay <= SEASON_GAMES
      && Array.isArray(schedule) ? schedule[gameDay] : null;
    if (!entry || entry.isAllStar || (Object.hasOwn(entry, 'gameNo') && entry.gameNo !== gameDay))
      throw new Error('契約時計に現在の公式戦日程が必要です。');
    const day = entry.date;
    if (!day || !Number.isInteger(day.month) || !Number.isInteger(day.day)) throw new Error('契約時計に実日程の年月日が必要です。');
    date = `${year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
  } else date = `${year}-${phase === 'offseason' ? '12-01' : '02-01'}`;
  parseContractDate(date);
  if (phase === 'offseason' && (!Number.isSafeInteger(offseasonTurn) || offseasonTurn < 0)) throw new Error('オフの契約ターンを確認してください。');
  return { season, phase, date, offseasonTurn: phase === 'offseason' ? offseasonTurn : 0 };
}

export function validateEconomyClock(world, previousWorld) {
  const clock = world.contractEconomy?.clock;
  if (!clock || clock.season !== world.year || !Number.isSafeInteger(clock.offseasonTurn) || clock.offseasonTurn < 0)
    throw new Error('保存年度と契約時計が一致しません。');
  const expected = clock.phase === 'season' && world.gameDay === SEASON_GAMES + 1
    && world.contractEconomy.cycle?.stage === 'postseason'
    ? { date: postseasonBoundaryDate(world), offseasonTurn: 0 }
    : economyClockFor({ ...clock, schedule: world.schedule, gameDay: world.gameDay });
  if (clock.date !== expected.date || clock.offseasonTurn !== expected.offseasonTurn) throw new Error('契約時計と実日程が一致しません。');
  if (previousWorld) {
    validateEconomyClock(previousWorld);
    const previous = previousWorld.contractEconomy.clock;
    if (clock.date < previous.date || (clock.date === previous.date && clock.offseasonTurn < previous.offseasonTurn))
      throw new Error('契約時計を過去へ戻すことはできません。');
  }
  return true;
}
