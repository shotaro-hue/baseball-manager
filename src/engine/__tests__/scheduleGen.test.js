import { describe, expect, it } from 'vitest';
import { generateSeasonSchedule } from '../scheduleGen';

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
  const m = day.matchups.find(x => x.homeId === teamId || x.awayId === teamId);
  if (!m) return null;
  return {
    oppId: m.homeId === teamId ? m.awayId : m.homeId,
    isHome: m.homeId === teamId,
  };
}

describe('scheduleGen regular league cards', () => {
  it('リーグ戦区間で同一対戦は3日連続（端数のみ2日）になる', () => {
    const schedule = generateSeasonSchedule(2025, teams);

    const regularDays = [];
    for (let dayNo = 1; dayNo < schedule.length; dayNo++) {
      if (!schedule[dayNo].isInterleague) regularDays.push(dayNo);
    }

    for (const teamId of teams.map(t => t.id)) {
      let streak = 1;
      for (let i = 1; i < regularDays.length; i++) {
        const prevNo = regularDays[i - 1];
        const curNo = regularDays[i];
        const prev = getTeamMatchup(schedule[prevNo], teamId);
        const cur = getTeamMatchup(schedule[curNo], teamId);

        if (prev && cur && prev.oppId === cur.oppId && prev.isHome === cur.isHome) {
          streak++;
        } else {
          expect([2, 3]).toContain(streak);
          streak = 1;
        }
      }
      expect([2, 3]).toContain(streak);
    }
  });

  it('オールスター休止は4日で中2日が試合日に設定される', () => {
    const schedule = generateSeasonSchedule(2025, teams);
    const info = getAllStarBreakInfo(2025, schedule);
    expect(info.breakDates.length).toBe(4);
    expect(info.gameDates.length).toBe(2);
    expect(info.restDates.length).toBe(2);
    expect(info.gameDates[0].month).toBe(7);
    expect(info.gameDates[1].month).toBe(7);
  });
});
