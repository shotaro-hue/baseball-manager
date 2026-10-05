import { describe, it, expect } from 'vitest';
import { calcSeasonAwards } from '../awards';
import { emptyStats } from '../playerCore';

const player = (id, stats = {}, extra = {}) => ({ id, name: `選手${id}`, age: 25, pos: '外野', stats: { ...emptyStats(), ...stats }, ...extra });
const pitcher = (id, stats = {}, extra = {}) => player(id, stats, { isPitcher: true, ...extra });
const team = (id, league, players, extra = {}) => ({ id, name: `球団${id}`, league, wins: 70, losses: 70, draws: 3, players, farm: [], ...extra });
const titles = players => calcSeasonAwards([team(0, 'セ', players)], 2026).titles.central;

describe('season award eligibility and winners', () => {
  it('separates saves and holds and retains IDs including zero', () => {
    const t = titles([pitcher(0, { SV: 30, HLD: 0 }), pitcher(1, { SV: 1, HLD: 40 })]);
    expect(t.sv.playerId).toBe(0);
    expect(t.sv.value).toBe(30);
    expect(t.hld.playerId).toBe(1);
    expect(t.hld.value).toBe(40);
  });
  it('records every tied counting-title winner with legacy first-winner fields', () => {
    const t = titles([player(0, { HR: 20 }), player(1, { HR: 20 }), player(2, { HR: 19 })]);
    expect(t.hr.winners.map(p => p.playerId)).toEqual([0, 1]);
    expect(t.hr.name).toBe('選手0');
  });
  it('uses draws in qualification and calculates OBP from hits, walks and hit-by-pitches', () => {
    const t = titles([player(0, { PA: 442, AB: 400, H: 200 }), player(1, { PA: 443, AB: 400, H: 120, BB: 40, HBP: 2, SF: 1 })]);
    expect(t.avg.playerId).toBe(1);
    expect(t.obp.value).toBeCloseTo(162 / 443);
  });
  it('awards perfect winning percentage only after 13 wins and includes ties', () => {
    const t = titles([pitcher(0, { W: 12, L: 0 }), pitcher(1, { W: 13, L: 0 }), pitcher(2, { W: 26, L: 0 })]);
    expect(t.winPct.value).toBe(1);
    expect(t.winPct.winners.map(p => p.playerId)).toEqual([1, 2]);
  });
  it('compares unrounded rates, preserves measured zero and excludes missing values', () => {
    const a = pitcher(0, { IP: 150, ER: 0 });
    const b = pitcher(1, { IP: 150, ER: 0 });
    const missing = pitcher(2, { IP: 150 }); delete missing.stats.ER; delete missing.stats.SV;
    const t = titles([a, b, missing]);
    expect(t.era.value).toBe(0);
    expect(t.era.winners.map(p => p.playerId)).toEqual([0, 1]);
    expect(t.sv.winners.map(p => p.playerId)).toEqual([0, 1]);
    const rates = titles([player(3, { PA: 500, AB: 500, H: 150 }), player(4, { PA: 501, AB: 501, H: 150 })]);
    expect(rates.avg.winners).toHaveLength(1);
  });
  it('allows a dominant pitcher to win league MVP against qualified batters', () => {
    const awards = calcSeasonAwards([team(0, 'セ', [pitcher(0, { IP: 180, ER: 20 }), player(1, { PA: 500, AB: 450, H: 110, BB: 50 })]), team(1, 'セ', [pitcher(2, { IP: 180, ER: 140 })])], 2026);
    expect(awards.mvp.central.playerId).toBe(0);
    expect(awards.mvp.central.pos).toBe('投手');
    expect(awards.mvp.pacific).toBeNull();
  });
  it('selects rookies independently in each league and excludes players without appearances', () => {
    const awards = calcSeasonAwards([team(0, 'セ', [pitcher(0, { IP: 50, ER: 0 }), pitcher(1)]), team(1, 'パ', [pitcher(2, { IP: 50, ER: 10 })])], 2026);
    expect(awards.rookie.central.playerId).toBe(0);
    expect(awards.rookie.pacific.playerId).toBe(2);
    expect(calcSeasonAwards([team(0, 'セ', [pitcher(1)])], 2026).rookie.central).toBeNull();
  });
  it('excludes rookies at the existing career thresholds', () => {
    const awards = calcSeasonAwards([team(0, 'セ', [pitcher(0, { IP: 60, ER: 0 }, { careerLogSummary: { totalInningsPitched: 30 } })])], 2026);
    expect(awards.rookie.central).toBeNull();
  });
  it('leaves Sawamura vacant when nobody meets all game criteria', () => {
    expect(calcSeasonAwards([team(0, 'セ', [pitcher(0, { IP: 120, ER: 20, W: 20 })])], 2026).sawamura).toBeNull();
    expect(calcSeasonAwards([team(0, 'セ', [pitcher(0, { IP: 130, ER: 20, W: 10 })])], 2026).sawamura.playerId).toBe(0);
  });
  it('uses at-bats rather than plate appearances for farm batting average', () => {
    const a = player(0, {}, { stats2: { PA: 60, AB: 40, H: 20 } });
    const b = player(1, {}, { stats2: { PA: 50, AB: 50, H: 24 } });
    const tied = player(2, {}, { stats2: { PA: 70, AB: 60, H: 30 } });
    const awards = calcSeasonAwards([team(0, 'セ', [], { farm: [a, b, tied] })], 2026);
    expect(awards.farmAwards.eastern.batting.name).toBe(a.name);
    expect(awards.farmAwards.eastern.batting.value).toBe(.5);
    expect(awards.farmAwards.eastern.batting.winners.map(p => p.playerId)).toEqual([0, 2]);
  });
});
