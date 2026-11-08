import { describe, expect, it } from 'vitest';
import { TEAM_DEFS, SEASON_GAMES } from '../../constants';
import { generateSeasonSchedule } from '../scheduleGen';
import * as playoff from '../playoff';
import { validatePlayoffCalendar } from '../postseasonCalendar';

const year = 2026;
const teams = TEAM_DEFS.map((t, i) => ({ ...t, wins: 90 - i % 6 * 4, losses: 50 + i % 6 * 4, draws: 3 }));
const schedule = generateSeasonSchedule(year, teams);
const start = () => playoff.initPlayoff(teams, { year, schedule });
function finish(p, score = { my: 1, opp: 0 }) {
  while (!p.champion) {
    const key = p.phase, s = p[key];
    p = playoff.advancePlayoff({ ...p, [key]: playoff.recordSeriesGame(s, { score }, playoff.nextPlayoffFixture(s)) });
  }
  return p;
}

describe('dated postseason from real official schedule', () => {
  it('anchors on official 143 instead of the trailing July All-Star entries', () => {
    const p = start();
    const d = schedule[SEASON_GAMES].date;
    const end = `${year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
    expect(p.calendar).toEqual({ version: 1, regularSeasonEndDate: end });
    expect(playoff.nextPlayoffFixture(p.cs1_se).date > end).toBe(true);
    expect(playoff.nextPlayoffFixture(p.cs1_pa).date).toBe(playoff.nextPlayoffFixture(p.cs1_se).date);
  });

  it('persists every played date and provides a verified closing date after JSON resume', () => {
    let p = start();
    p.cs1_se = playoff.recordSeriesGame(p.cs1_se, { score: { my: 0, opp: 0 } }, playoff.nextPlayoffFixture(p.cs1_se));
    const resumed = JSON.parse(JSON.stringify(playoff.encodePlayoff(p)));
    expect(resumed.cs1_se.games[0].date).toBe(playoff.nextPlayoffFixture(start().cs1_se).date);
    expect(playoff.nextPlayoffFixture(resumed.cs1_se)).toEqual(playoff.nextPlayoffFixture(p.cs1_se));
    expect(playoff.postseasonClosingDate(resumed, { year, schedule })).toBeNull();
    p = finish(resumed);
    expect(playoff.postseasonClosingDate(p, { year, schedule })).toBe(p.jpSeries.games.at(-1).date);
    expect(p.jpSeries.games.at(-1).date).toMatch(/^2026-\d\d-\d\d$/);
  });

  it('does not fabricate a closing date or retrofit old undated histories', () => {
    const old = finish(playoff.initPlayoff(teams, { year }));
    const frozen = JSON.stringify(old);
    expect(playoff.postseasonClosingDate(old, { year, schedule })).toBeNull();
    expect(JSON.stringify(playoff.advancePlayoff(old))).toBe(frozen);
    expect(old.cs1_se.games[0]).not.toHaveProperty('date');
  });

  it('rejects a changed schedule anchor, a forged game date and a contradictory winner', () => {
    const p = finish(start());
    for (const corrupt of [
      q => { q.calendar.regularSeasonEndDate = '2026-07-25'; },
      q => { q.cs1_se.games[0].date = '2026-02-30'; },
      q => { q.jpSeries.winner = 1 - q.jpSeries.winner; },
    ]) {
      const q = structuredClone(p); corrupt(q);
      expect(() => playoff.postseasonClosingDate(q, { year, schedule })).toThrow();
    }
  });

  it('rejects malformed final fixtures and calendars crossing the offseason boundary', () => {
    for (const entry of [null, { ...schedule[SEASON_GAMES], isAllStar: true },
      { ...schedule[SEASON_GAMES], date: { month: 2, day: 30 } },
      { ...schedule[SEASON_GAMES], date: { month: 11, day: 25 } }]) {
      const broken = schedule.slice(); broken[SEASON_GAMES] = entry;
      expect(() => playoff.initPlayoff(teams, { year, schedule: broken })).toThrow();
    }
  });

  it.each([2025, 2026, 2027])('fixes dates independently of early decisions and league simulation order in %i', season => {
    const dates = generateSeasonSchedule(season, teams);
    let p = playoff.initPlayoff(teams, { year: season, schedule: dates });
    const firstDate = playoff.nextPlayoffFixture(p.cs1_pa).date;
    while (!p.cs1_se.done) p.cs1_se = playoff.recordSeriesGame(p.cs1_se, { score: { my: 1, opp: 0 } }, playoff.nextPlayoffFixture(p.cs1_se));
    p = playoff.advancePlayoff(p);
    expect(playoff.nextPlayoffFixture(p.cs1_pa).date).toBe(firstDate);
    p = finish(p);
    expect(p.cs2_se.startDate).toBe(p.cs2_pa.startDate);
    expect(p.cs2_se.startDate > p.cs1_se.games.at(-1).date).toBe(true);
    expect(p.jpSeries.startDate > p.cs2_pa.games.at(-1).date).toBe(true);
    expect(playoff.postseasonClosingDate(p, { year: season, schedule: dates })).toBe(p.jpSeries.games.at(-1).date);
  });

  it('dates the special seventh CS game and all eleven Japan Series games, including travel days', () => {
    const dates = schedule.slice();
    dates[143] = { ...dates[143], date: { month: 10, day: 1 } };
    const p = playoff.initPlayoff(teams, { year, schedule: dates });
    const final = { ...playoff.createSeries({ ...teams[0], wins: 100 }, { ...teams[1], wins: 70 }, 'final'), startDate: '2026-10-07' };
    let s = final;
    for (let n = 0; n < 7; n++) {
      s = playoff.recordSeriesGame(s, { score: n < 4 ? { my: 0, opp: 1 } : { my: 1, opp: 0 } }, playoff.nextPlayoffFixture(s));
    }
    // Seven decisive games can finish a two-win-advantage final at 5-4.
    expect(s).toMatchObject({ done: true, winner: 0, wins: [5, 4] });
    expect(s.games).toHaveLength(7);
    expect(s.games[6].date).toBe('2026-10-13');
    const js = { ...playoff.createSeries(teams[0], teams[6], 'japan'), startDate: '2026-10-15' };
    let j = js;
    for (let n = 1; n <= 11; n++) {
      j = playoff.recordSeriesGame(j, { score: n <= 7 ? { my: 0, opp: 0 } : { my: 1, opp: 0 } }, playoff.nextPlayoffFixture(j));
    }
    expect(j.games.map(g => g.date)).toEqual(['2026-10-15', '2026-10-16', '2026-10-18', '2026-10-19',
      '2026-10-20', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-26', '2026-10-27', '2026-10-28']);
    expect(j).toMatchObject({ done: true, winner: 0 });
    expect(p.cs1_se.startDate).toBe('2026-10-03');
  });

  it('rejects removed/partial calendar evidence instead of treating it as undated legacy', () => {
    for (const corrupt of [q => { delete q.calendar; }, q => { q.calendar = null; },
      q => { q.calendar.version = 99; }, q => { delete q.cs1_se.startDate; },
      q => { q.cs1_se.games[0].date = '2027-01-01'; }]) {
      const p = finish(start()); corrupt(p);
      expect(() => validatePlayoffCalendar(p, { year, schedule })).toThrow();
    }
  });

  it('requires the actual source schedule when validating a resumed save', () => {
    expect(() => validatePlayoffCalendar(start(), { year, schedule: undefined })).toThrow();
  });

  it('retains the canonical fixture when a dated game is recorded through the existing optional-fixture API', () => {
    let p = start();
    p.cs1_se = playoff.recordSeriesGame(p.cs1_se, { score: { my: 0, opp: 0 } });
    p = finish(p);
    expect(playoff.postseasonClosingDate(p, { year, schedule })).toBe(p.jpSeries.games.at(-1).date);
  });

  it('rejects extra dated games outside the supported series instead of generating arbitrary future dates', () => {
    const p = start();
    expect(() => playoff.nextPlayoffFixture({ ...p.cs1_se, games: [{}, {}, {}] })).toThrow();
    const j = { ...playoff.createSeries(teams[0], teams[6], 'japan'), startDate: '2026-10-15' };
    expect(() => playoff.nextPlayoffFixture({ ...j, games: Array(11).fill({}) })).toThrow();
  });
});
