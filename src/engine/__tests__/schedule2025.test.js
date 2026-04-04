import { describe, it, expect } from 'vitest';
import { generateSeasonSchedule } from '../scheduleGen.js';
import { TEAM_DEFS } from '../../constants.js';
import { schedule2025 } from '../../data/schedule2025.js';

describe('generateSeasonSchedule(2025)', () => {
  it('2025は実日程データを返す', () => {
    const schedule = generateSeasonSchedule(2025, TEAM_DEFS);

    expect(schedule).toEqual(schedule2025);
    expect(schedule).not.toBe(schedule2025);
    expect(schedule[1]).not.toBe(schedule2025[1]);
  });

  it('開幕日(3/28)のカードが実データと一致する', () => {
    const schedule = generateSeasonSchedule(2025, TEAM_DEFS);
    const openingDay = schedule.find((day) => day && day.date.month === 3 && day.date.day === 28);

    expect(openingDay).toBeTruthy();
    const pairSet = new Set(
      openingDay.matchups.map((m) => `${m.homeId}-${m.awayId}`)
    );

    expect(pairSet).toEqual(new Set([
      '0-5', // ヤクルト-中日
      '1-4', // DeNA-巨人
      '2-3', // 広島-阪神
      '6-11', // ソフトバンク-オリックス
      '7-10', // 楽天-日本ハム
      '8-9', // 西武-ロッテ
    ]));
  });
});
