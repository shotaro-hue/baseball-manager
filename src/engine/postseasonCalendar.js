import { SEASON_GAMES } from '../constants';
import { parseContractDate } from './contractCalendar';
import { economyClockFor } from './economyCalendar';

const STAGES = { cs1_se: 'first', cs1_pa: 'first', cs2_se: 'final', cs2_pa: 'final', jpSeries: 'japan' };
const fail = () => { throw new Error('ポストシーズンの日付・保存履歴を確認してください。'); };

// A civil calendar policy, independent of simulation order, timezone and RNG.
function plusDays(date, count) {
  let { year, month, day, days } = parseContractDate(date);
  for (let n = 0; n < count; n++) {
    if (++day > days) {
      day = 1;
      if (++month > 12) { month = 1; year++; }
      days = parseContractDate(`${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`).days;
    }
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function calendarYear(calendar) {
  if (calendar?.version !== 1) fail();
  return parseContractDate(calendar.regularSeasonEndDate).year;
}

function beforeOffseason(date, year) {
  const parsed = parseContractDate(date);
  if (parsed.year !== year || parsed.month >= 12) fail();
  return date;
}

export function postseasonStartDate(calendar, kind) {
  const year = calendarYear(calendar);
  const offset = { first: 2, final: 6, japan: year >= 2026 ? 14 : 13 }[kind];
  if (offset == null) fail();
  return beforeOffseason(plusDays(calendar.regularSeasonEndDate, offset), year);
}

export function playoffGameDate(series, number) {
  const limit = { first: 3, final: series.year >= 2026 ? 7 : 6, japan: 14 }[series.kind];
  if (!Number.isSafeInteger(number) || number < 1 || limit === undefined || number > limit) fail();
  const { year } = parseContractDate(series.startDate);
  if (series.year !== year) fail();
  // Existing venues change after games 2, 5 and 8. Seven draws + seven decisive games can require 14 games.
  const restDays = series.kind === 'japan' ? [2, 5, 8].filter(n => number > n).length : 0;
  return beforeOffseason(plusDays(series.startDate, number - 1 + restDays), year);
}

export function createPostseasonCalendar({ year, schedule }) {
  const regularSeasonEndDate = economyClockFor({ season: year, phase: 'season', schedule, gameDay: SEASON_GAMES }).date;
  const calendar = { version: 1, regularSeasonEndDate };
  // Refuse a calendar that cannot fit its longest supported series before 12/1.
  playoffGameDate({ kind: 'japan', year, startDate: postseasonStartDate(calendar, 'japan') }, 14);
  return calendar;
}

export function validatePlayoffCalendar(playoff, context = {}) {
  const { year = playoff.year, schedule } = context;
  if (!Object.hasOwn(playoff, 'calendar')) {
    // Missing is historical; partially removed dated evidence is corruption.
    if (Object.keys(STAGES).some(key => playoff[key]?.startDate !== undefined
      || playoff[key]?.games?.some(game => Object.hasOwn(game, 'date')))) fail();
    return false;
  }
  if (calendarYear(playoff.calendar) !== year || playoff.year !== year) fail();
  if (Object.hasOwn(context, 'schedule') && createPostseasonCalendar({ year, schedule }).regularSeasonEndDate
    !== playoff.calendar.regularSeasonEndDate) fail();
  for (const [key, kind] of Object.entries(STAGES)) {
    const series = playoff[key];
    if (!series) continue;
    if (series.kind !== kind || series.year !== year || series.startDate !== postseasonStartDate(playoff.calendar, kind)
      || !Array.isArray(series.games)) fail();
    series.games.forEach((game, i) => { if (game.date !== playoffGameDate(series, i + 1)) fail(); });
  }
  return true;
}
