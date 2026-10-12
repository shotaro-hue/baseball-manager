import { describe, expect, it } from 'vitest';
import { buildTeamComparisonRows, buildTeamMetrics } from '../analysisComparison';
import { emptyStats } from '../playerCore';

const player = (id, stats = {}, extra = {}) => ({ id, salary: 0, stats: { ...emptyStats(), ...stats }, ...extra });
const team = (players = [], farm = [], extra = {}) => ({ id: 0, name: '球団', league: 'セ', players, farm, rotation: [], lineup: [], wins: 1, losses: 0, ...extra });

describe('FIX-S2 club comparison populations and missing values', () => {
  it('retains recorded starter and relief ERA zero while no innings are missing', () => {
    const metrics = buildTeamMetrics(team([
      player(0, { IP: 9, ER: 0 }, { isPitcher: true, subtype: '先発' }),
      player(1, { IP: 3, ER: 0 }, { isPitcher: true, subtype: '中継ぎ' }),
    ]));
    expect(metrics.starterEra).toBe(0); expect(metrics.bullpenEra).toBe(0);
    const empty = buildTeamMetrics(team([player(0, {}, { isPitcher: true, subtype: '先発' })]));
    expect(empty.starterEra).toBeNull(); expect(empty.bullpenEra).toBeNull();
  });
  it('keeps computable OPS zero apart from absent or unestablished denominators', () => {
    expect(buildTeamMetrics(team([player(0, { AB: 4, PA: 4 })])).ops).toBe(0);
    expect(buildTeamMetrics(team([player(0)])).ops).toBeNull();
    expect(buildTeamMetrics(team([player(0, { BB: 1, PA: 1 })])).ops).toBeNull();
    expect(buildTeamMetrics(team([player(0, { AB: 4, PA: 4, H: null })])).ops).toBeNull();
    expect(buildTeamMetrics(team([player(0, { AB: 3, H: 1, PA: 3 })])).ops).toBe(0.67); // FIX-S3 stays separate
  });
  it('does not invent missing or invalid earned runs and batted-ball numerators', () => {
    for (const ER of [null, undefined, -1, '0', NaN, Infinity]) {
      expect(buildTeamMetrics(team([player(0, { IP: 9, ER }, { isPitcher: true, subtype: '先発' })])).starterEra).toBeNull();
    }
    const hitter = player(0, { AB: 4, PA: 4, battedBallProfile: { bip: 4, hardHit: null } });
    expect(buildTeamMetrics(team([hitter])).hardHitRate).toBeNull();
  });
  it('sums fractional innings and earned runs by zero-out appearances', () => {
    const pitchers = [
      player(0, { IP: 1 / 3, ER: 0 }, { isPitcher: true, subtype: '中継ぎ' }),
      player(1, { IP: 2 / 3, ER: 0 }, { isPitcher: true, subtype: '中継ぎ' }),
      player(2, { IP: 0, ER: 1 }, { isPitcher: true, subtype: '中継ぎ' }),
    ];
    expect(buildTeamMetrics(team(pitchers)).bullpenEra).toBe(9);
  });
  it('keeps incomplete individual records missing even beside valid contributors', () => {
    for (const stats of [{ AB: null, PA: 4 }, { AB: 4, PA: 4, H: null }]) {
      expect(buildTeamMetrics(team([player(0, { AB: 4, PA: 4, H: 1 }), player(1, stats)])).ops).toBeNull();
    }
    expect(buildTeamMetrics(team([
      player(0, { IP: 9, ER: 0 }, { isPitcher: true, subtype: '先発' }),
      player(1, { IP: 9, ER: null }, { isPitcher: true, subtype: '先発' }),
    ])).starterEra).toBeNull();
  });
  it('retains demoted batting, batted-ball and pitching stats without mixing stats2', () => {
    const hitter = player(0, { AB: 4, PA: 4, H: 2, battedBallProfile: { bip: 4, hardHit: 2 } });
    const starter = player(1, { IP: 9, ER: 1 }, { isPitcher: true, subtype: '先発' });
    const relief = player(2, { IP: 3, ER: 0 }, { isPitcher: true, subtype: '抑え' });
    const farmOnly = player(3, {}, { stats2: { AB: 100, H: 100, IP: 100, ER: 100 }, subtype: '先発' });
    const before = buildTeamMetrics(team([hitter, starter, relief]));
    const after = buildTeamMetrics(team([], [hitter, starter, relief, farmOnly]));
    for (const key of ['ops', 'hardHitRate', 'starterEra', 'bullpenEra']) expect(after[key]).toBe(before[key]);
    expect(after.ops).toBe(1); expect(after.hardHitRate).toBe(0.5);
  });
  it('uses current active lineup for defense and deduplicates ID zero season records', () => {
    const active = player(0, { AB: 4, PA: 4 }, { batting: { defense: 60 } });
    const demoted = player(1, { AB: 4, PA: 4, H: 4 }, { batting: { defense: 100 } });
    const input = team([active], [{ ...active, stats: { ...emptyStats(), AB: 4, H: 4 } }, demoted], { lineup: [0, 1] });
    const before = structuredClone(input); const metrics = buildTeamMetrics(input);
    expect(metrics.ops).toBe(1); expect(metrics.defense).toBe(60);
    expect(input).toEqual(before);
  });
  it('uses full owned annual payroll, including development, once per ID or object', () => {
    const active = player(0, {}, { salary: 100 }), farm = player(1, {}, { salary: 200 }), development = player(2, {}, { salary: 50, 育成: true });
    expect(buildTeamMetrics(team([active], [active, { ...active, salary: 999 }, farm, development])).payroll).toBe(350);
    expect(buildTeamMetrics(team([player(0)])).payroll).toBe(0);
  });
  it.each([null, undefined, -1, NaN, Infinity, '200'])('never presents incomplete payroll as a confirmed total: %s', salary => {
    const metrics = buildTeamMetrics(team([player(0, {}, { salary: 100 })], [player(1, {}, { salary })]));
    expect(metrics.payroll).toBeNull();
    expect(metrics.payrollSummary.amount).toBe(100);
    expect(metrics.payrollSummary.missing + metrics.payrollSummary.invalid).toBe(1);
  });
  it('ranks real zero ahead of positive ERA and excludes unavailable data', () => {
    const myTeam = team([player(0, { IP: 9 }, { isPitcher: true, subtype: '先発' }), player(3, { AB: 4, PA: 4 })]);
    const opponent = team([player(1, { IP: 9, ER: 2 }, { isPitcher: true, subtype: '先発' })], [], { id: 1 });
    const unavailable = team([], [], { id: 2 });
    const rows = buildTeamComparisonRows({ myTeam, opponent, allTeams: [myTeam, opponent, unavailable] });
    const era = rows.find(r => r.key === 'starterEra');
    expect(era).toMatchObject({ myValue: 0, myRank: 1, opponentRank: 2, population: 2 });
    expect(era.format(0)).toBe('0.00'); expect(era.format(null)).toBe('---');
    expect(rows.find(r => r.key === 'ops')).toMatchObject({ myValue: 0, myRank: 1, opponentRank: null, population: 1 });
  });
});
