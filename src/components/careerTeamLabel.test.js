import { describe, expect, it } from 'vitest';
import { TEAM_DEFS } from '../constants';
import { careerTeamLabel } from './careerTeamLabel';

describe('yearly career team labels (display only)', () => {
  it.each(TEAM_DEFS)('normalizes full and short names for $short', team => {
    expect(careerTeamLabel({ year: 2026, teamName: team.name, teamId: team.id })).toBe(team.short);
    expect(careerTeamLabel({ year: 2025, teamName: team.short, teamId: team.id })).toBe(team.short);
  });

  it('shows the same team across historical and game-play seasons', () => {
    const rows = [
      { year: 2023, teamName: '阪神' },
      { year: 2024, teamName: '阪神' },
      { year: 2025, teamName: '阪神' },
      { year: 2026, teamName: '阪神タイガース', teamId: 3 },
      { year: 2027, teamName: '阪神タイガース', teamId: 3 },
    ];
    const before = structuredClone(rows);
    expect(rows.map(careerTeamLabel)).toEqual(['阪神', '阪神', '阪神', '阪神', '阪神']);
    expect(rows).toEqual(before);
  });

  it('uses historical name over a potentially incorrect current teamId', () => {
    expect(careerTeamLabel({ year: 2024, teamName: '読売ジャイアンツ', teamId: 3 })).toBe('巨人');
    expect(careerTeamLabel({ year: 2025, teamName: '阪神', teamId: 4 })).toBe('阪神');
    expect(careerTeamLabel({ year: 2027, teamName: '横浜DeNAベイスターズ', teamId: 1 })).toBe('DeNA');
  });

  it('accepts common aliases and variations in whitespace and punctuation', () => {
    expect(careerTeamLabel({ teamName: ' 読 売 ' })).toBe('巨人');
    expect(careerTeamLabel({ teamName: '横浜ＤｅＮＡベイスターズ' })).toBe('DeNA');
    expect(careerTeamLabel({ teamName: '福岡ソフトバンクホークス' })).toBe('ソフトバンク');
    expect(careerTeamLabel({ teamName: 'オリックス・バファローズ' })).toBe('オリックス');
    expect(careerTeamLabel({ teamName: '日ハム' })).toBe('日本ハム');
  });

  it('uses a stable team ID only when the historical name is missing', () => {
    expect(careerTeamLabel({ teamId: 3 })).toBe('阪神');
    expect(careerTeamLabel({ teamId: '4', teamName: '' })).toBe('巨人');
    expect(careerTeamLabel({ teamId: 999 })).toBe('—');
    expect(careerTeamLabel({})).toBe('—');
  });

  it('does not rewrite or guess unknown or historical non-current franchises', () => {
    expect(careerTeamLabel({ teamName: '大阪近鉄バファローズ', teamId: 11 })).toBe('大阪近鉄バファローズ');
    expect(careerTeamLabel({ teamName: '2球団', teamId: 3 })).toBe('2球団');
  });
});
