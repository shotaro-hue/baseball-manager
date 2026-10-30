import { parseContractDate } from './contractCalendar';

// Civil dates are input, never inferred from the number of games played.
export function economyClockFor({ season, phase, schedule, gameDay, offseasonTurn }) {
  if (!Number.isInteger(season) || season < 1 || season > 9999
    || !['preseason', 'season', 'offseason'].includes(phase)) throw new Error('契約時計の年度・フェーズを確認してください。');
  let date;
  const year = String(season).padStart(4, '0');
  if (phase === 'season') {
    const day = Number.isSafeInteger(gameDay) && gameDay >= 1 && Array.isArray(schedule) ? schedule[gameDay]?.date : null;
    if (!day || !Number.isInteger(day.month) || !Number.isInteger(day.day)) throw new Error('契約時計に実日程の年月日が必要です。');
    date = `${year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`;
  } else date = `${year}-${phase === 'offseason' ? '12-01' : '02-01'}`;
  parseContractDate(date);
  if (phase === 'offseason' && (!Number.isSafeInteger(offseasonTurn) || offseasonTurn < 0)) throw new Error('オフの契約ターンを確認してください。');
  return { season, phase, date, offseasonTurn: phase === 'offseason' ? offseasonTurn : 0 };
}

export function validateEconomyClock(world) {
  const clock = world.contractEconomy?.clock;
  if (!clock || clock.season !== world.year || !Number.isSafeInteger(clock.offseasonTurn) || clock.offseasonTurn < 0)
    throw new Error('保存年度と契約時計が一致しません。');
  const expected = economyClockFor({ ...clock, schedule: world.schedule, gameDay: world.gameDay });
  if (clock.date !== expected.date || clock.offseasonTurn !== expected.offseasonTurn) throw new Error('契約時計と実日程が一致しません。');
  return true;
}
