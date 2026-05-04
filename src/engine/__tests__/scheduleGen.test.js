import { describe, expect, it } from 'vitest';
import { generateSeasonSchedule, calcAllStarTriggerDay } from '../scheduleGen';
import { SEASON_PARAMS } from '../../data/scheduleParams';

const teams = [
  { id: 0, league: 'セ' },
  { id: 1, league: 'セ' },
  { id: 2, league: 'セ' },
  { id: 3, league: 'セ' },
  { id: 4, league: 'セ' },
  { id: 5, league: 'セ' },
  { id: 6, league: 'パ' },
  { id: 7, league: 'パ' },
  { id: 8, league: 'パ' },
  { id: 9, league: 'パ' },
  { id: 10, league: 'パ' },
  { id: 11, league: 'パ' },
];

function getTeamMatchup(day, teamId) {
  const m = day?.matchups?.find(x => x.homeId === teamId || x.awayId === teamId);
  if (!m) return null;

  return {
    oppId: m.homeId === teamId ? m.awayId : m.homeId,
    isHome: m.homeId === teamId,
  };
}

describe('scheduleGen regular league cards', () => {
  it('リーグ戦区間で同一対戦は3日連続（端数のみ2日）になる', () => {
    const schedule = generateSeasonSchedule(2025, teams);

    const leagueByTeamId = new Map(teams.map(t => [t.id, t.league]));

    const isRegularLeagueDay = (day) => {
      if (!day) return false;
      if (day.isInterleague) return false;
      if (day.isAllStar) return false;
      if (!Array.isArray(day.matchups) || day.matchups.length === 0) return false;

      return day.matchups.every(m => {
        const homeLeague = leagueByTeamId.get(m.homeId);
        const awayLeague = leagueByTeamId.get(m.awayId);
        return homeLeague && awayLeague && homeLeague === awayLeague;
      });
    };

    const regularDays = [];
    for (let dayNo = 1; dayNo < schedule.length; dayNo++) {
      if (isRegularLeagueDay(schedule[dayNo])) {
        regularDays.push(dayNo);
      }
    }

    for (const teamId of teams.map(t => t.id)) {
      let streak = 0;
      let prev = null;

      for (const dayNo of regularDays) {
        const cur = getTeamMatchup(schedule[dayNo], teamId);

        if (!cur) {
          if (streak > 0) {
            expect([2, 3]).toContain(streak);
          }
          streak = 0;
          prev = null;
          continue;
        }

        const sameCard =
          prev &&
          prev.oppId === cur.oppId &&
          prev.isHome === cur.isHome;

        if (sameCard) {
          streak++;
        } else {
          if (streak > 0) {
            expect([2, 3]).toContain(streak);
          }
          streak = 1;
        }

        prev = cur;
      }

      if (streak > 0) {
        expect([2, 3]).toContain(streak);
      }
    }
  });
});

describe('calcAllStarTriggerDay', () => {
  it('2025年のトリガー日がスキップ日7/22より前の最終試合になる', () => {
    const schedule = generateSeasonSchedule(2025, teams);
    const triggerDay = calcAllStarTriggerDay(schedule, SEASON_PARAMS[2025].allStarSkipDates);
    const triggerDate = schedule[triggerDay]?.date;

    expect(triggerDate).toBeDefined();

    const triggerNum = triggerDate.month * 100 + triggerDate.day;
    expect(triggerNum).toBeLessThan(722);
  });

  it('72ではなく実際の試合日が返る', () => {
    const schedule = generateSeasonSchedule(2025, teams);
    const triggerDay = calcAllStarTriggerDay(schedule, SEASON_PARAMS[2025].allStarSkipDates);

    expect(triggerDay).not.toBe(72);
    expect(triggerDay).toBeGreaterThan(80);
  });

  it('allStarSkipDates が空なら 72 を返す', () => {
    const schedule = generateSeasonSchedule(2025, teams);

    expect(calcAllStarTriggerDay(schedule, [])).toBe(72);
  });
});

describe('allstar entries in generated schedule', () => {
  it('2026年のオールスターは7月で、通常試合の後ろに配置される', () => {
    const schedule = generateSeasonSchedule(2026, teams);
    const asEntries = schedule.filter(day => day?.isAllStar);

    expect(asEntries.length).toBe(2);
    expect(schedule.indexOf(asEntries[0])).toBeGreaterThan(143);
    expect(asEntries[0].date.month).toBe(7);
    expect(asEntries[1].date.month).toBe(7);
  });
});
