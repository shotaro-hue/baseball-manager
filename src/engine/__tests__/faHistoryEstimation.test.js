import { describe, it, expect } from 'vitest';
import { initializePlayerEligibility, getPlayerFaProgress } from '../playerEligibility';
import { migrateEligibilityWorld } from '../eligibilityMigration';

const row = (year, G = 125, teamName) => ({ year, ...(teamName ? { teamName } : {}), stats: { G } });
const full = () => [2021, 2022, 2023, 2024, 2025].map(year => row(year));
const player = extra => ({ id: 'legacy-history', age: 25, entryAge: 20, entryType: '高卒',
  daysOnActiveRoster: 0, serviceYears: 0, dataQuality: { serviceTime: 'game-baseline-unknown' }, ...extra });
const estimate = (extra, options) => initializePlayerEligibility(player(extra), { year: 2026, ...options });

describe('FA history estimation before the first eligibility initialization', () => {
  it.each([
    ['empty history', { history: [], careerLog: full() }, 725],
    ['partial history', { history: [{ year: 2025, G: 125 }], careerLog: full() }, 725],
    ['recent only', { recentCareerLog: full().slice(-3) }, 435],
    ['no history', {}, 500],
    ['malformed containers', { history: {}, careerLog: null, recentCareerLog: 'none' }, 500],
    ['two clubs in one season', { history: [{ year: 2025, teamName: 'A', G: 50 }, { year: 2025, teamName: 'B', G: 75 }] }, 145],
    ['missing stint in partial history', { history: [{ year: 2025, teamName: 'A', G: 40 }], careerLog: [row(2025, 40, 'A'), row(2025, 60, 'B')] }, 116],
    ['flat and nested copies', { history: [{ year: 2025, teamName: 'A', G: 50 }], careerLog: [row(2025, 50, 'A'), row(2025, 25, 'B')], recentCareerLog: [row(2025, 50, 'A'), row(2025, 25, 'B')] }, 87],
    ['same-source correction', { careerLog: [row(2025, 25, 'A'), row(2025, 50, 'A')] }, 58],
    ['raw source wins over the cache', { history: [{ year: 2025, teamName: 'A', G: 25 }], careerLog: [row(2025, 100, 'A')], recentCareerLog: [row(2025, 125, 'A')] }, 29],
    ['full career wins over its recent copy', { careerLog: [row(2025, 50, 'A')], recentCareerLog: [row(2025, 100, 'A')] }, 58],
    ['anonymous legacy split', { history: [{ year: 2025, G: 20 }, { year: 2025, G: 30 }], careerLog: [row(2025, 20, 'A'), row(2025, 30, 'B')] }, 58],
    ['anonymous copies', { history: [{ year: 2025, G: 50 }, { year: 2025, G: 50 }], careerLog: [row(2025, 50)], recentCareerLog: [row(2025, 50)] }, 58],
    ['anonymous split with equal games and different stats', { history: [{ year: 2025, G: 20, PA: 55 }, { year: 2025, G: 20, PA: 86 }] }, 46],
    ['team name overrides an imported current-club ID', { history: [{ year: 2025, teamName: '読 売', G: 25 }], careerLog: [row(2025, 25, '読売ジャイアンツ'), row(2025, 50, '東京ヤクルトスワローズ')].map(r => ({ ...r, teamId: 0 })) }, 87],
    ['ID-only team zero', { careerLog: [{ year: 2025, teamId: 0, stats: { G: 25 } }, { year: 2025, teamId: 0, stats: { G: 25 } }] }, 29],
    ['observed zero', { history: [{ year: 2025, teamName: 'A', G: 0, PA: 500 }], careerLog: [row(2025, 125, 'A')] }, 0],
    ['flat PA fallback', { history: [{ year: 2025, PA: 500 }] }, 145],
    ['flat pitcher W fallback', { isPitcher: true, history: [{ year: 2025, W: 45 }] }, 145],
    ['published total is not a third club', { history: [{ year: 2025, teamName: '2球団', G: 125 }, { year: 2025, teamName: 'A', G: 50 }, { year: 2025, teamName: 'B', G: 75 }] }, 145],
    ['invalid rows cannot mask a usable lower source', { history: [null, {}, { year: '2025', G: 125 }, { year: 2025.5, G: 125 }, { year: 2026, G: 125 }, { year: -1, G: 125 }, { year: 2025, G: -1 }, { year: 2025, G: Infinity }, { year: 2025, G: '125' }], careerLog: [row(2025, 125)] }, 145],
  ])('%s', (_name, data, days) => {
    const original = structuredClone(data), p = estimate(data);
    expect(p.eligibility.fa.days).toBe(days);
    expect(p.eligibility.fa.basis.kind).toBe('game-estimate');
    expect(data).toEqual(original);
  });

  it('uses normalized complete history again when selecting seasons after an exercise', () => {
    const p = estimate({ history: [], careerLog: full() }, { opening: { exercises: [2024] } });
    expect(p.eligibility.fa).toMatchObject({ days: 725, cycleStartDays: 580, exerciseCount: 1 });
    expect(getPlayerFaProgress(p)).toMatchObject({ days: 145, overseas: { eligible: false, remainingDays: 435 } });
  });

  it('does not re-estimate or mutate initialized eligibility even when history becomes more complete', () => {
    const fixed = estimate({ history: [] });
    expect(fixed.eligibility.fa.days).toBe(500);
    const p = { ...fixed, careerLog: full() }, before = structuredClone(p);
    expect(initializePlayerEligibility(p, { year: 2026, registrationHistory: full() })).toBe(p);
    expect(p).toEqual(before);
    expect(getPlayerFaProgress(p).days).toBe(500);
  });

  it('does not discard anonymous stints before processing a selected save-generation history', () => {
    const p = player({ history: [{ year: 2025, G: 10 }, { year: 2025, G: 20 }] });
    const world = { year: 2026, gameDay: 1, teams: [{ id: 0, players: [p], farm: [] }], faPool: [] };
    const next = migrateEligibilityWorld(world, { registrationHistoryByPlayerId: new Map([[p.id, [row(2024)]]]) });
    expect(next.teams[0].players[0].eligibility.fa.days).toBe(180);
    expect(migrateEligibilityWorld(JSON.parse(JSON.stringify(next)))).toEqual(next);
  });
});
