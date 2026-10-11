import { describe, it, expect } from 'vitest';
import { selectFarmTeam, validateFarmTeams } from '../farmSelection';
import { batter, pitcher, team, teams, freeze } from './farmFixtures';

describe('farm selection', () => {
  it('uniquely assigns nine actual healthy farm batters and flexible pitchers without mutation', () => {
    const t = team(); t.farm[0].id = 0;
    t.farm.push(batter('injured', '捕手', { injuryDaysLeft: 1 }));
    t.players.push(batter('active', '捕手'));
    const s = selectFarmTeam(freeze(t), { round: 5 });
    expect(s.status).toBe('ready');
    expect(s.lineup).toHaveLength(9);
    expect(new Set(s.lineup.map(x => x.player.id)).size).toBe(9);
    expect(new Set(s.lineup.map(x => x.position)).size).toBe(9);
    expect(s.lineup.some(x => x.player.id === 0)).toBe(true);
    expect(s.lineup.some(x => ['active','injured'].includes(x.player.id))).toBe(false);
    expect(s.pitchers).toHaveLength(6);
    expect(s.warnings).toHaveLength(0);
    expect(selectFarmTeam({ ...t, farm: [...t.farm].reverse() }, { round: 5 })).toEqual(s);
  });
  it('supports real secondary catchers and warns on alternative fielding', () => {
    const t = team(); t.farm[0] = batter('secondary', '一塁手', { positions: { 捕手: 1 } });
    t.farm.filter(p => !p.isPitcher).forEach(p => { if(p.id !== 'secondary') { p.pos = '一塁手'; p.positions = {}; } });
    const s = selectFarmTeam(t, { round: 1 });
    expect(s.status).toBe('ready');
    expect(s.lineup.find(x => x.position === '捕手').player.id).toBe('secondary');
    expect(s.warnings.some(x => x.code === 'alternative-defense')).toBe(true);
    expect(s.defensePenalty).toBeGreaterThan(0);
  });
  it.each(['batters','pitchers','catcher'])('returns explicit shortage: %s', (kind) => {
    const t = team();
    if (kind === 'batters') t.farm = t.farm.filter(p => p.id !== '0-dh');
    if (kind === 'pitchers') t.farm = t.farm.filter(p => !p.isPitcher);
    if (kind === 'catcher') t.farm = t.farm.filter(p => p.pos !== '捕手').concat(batter('extra'));
    const s = selectFarmTeam(t, { round: 1 });
    expect(s.status).toBe('unplayed');
    expect(s.reasons.some(x => x.code === `insufficient-${kind}`)).toBe(true);
  });
  it('uses rest/history and allows warning-only single pitcher rescue', () => {
    const t = team(); t.farm = t.farm.filter(p => !p.isPitcher).concat(pitcher('only', { condition: 20, recentPitchingDays: [4] }));
    const s = selectFarmTeam(t, { round: 5 });
    expect(s.status).toBe('ready');
    expect(s.pitchers[0].player.id).toBe('only');
    expect(s.warnings.some(x => x.code === 'pitcher-rescue')).toBe(true);
    const normal = team();
    const rested = selectFarmTeam(normal, { round: 6, usage: { '0-p0': { lastPitchedRound: 5 } } });
    expect(rested.pitchers[0].player.id).not.toBe('0-p0');
    expect(rested.pitchers.at(-1).player.id).toBe('0-p0');
  });
  it('rejects duplicate, missing or cross-roster player IDs rather than converting errors to shortages', () => {
    const t = team(); t.players.push(t.farm[0]);
    expect(() => validateFarmTeams([t])).toThrow(/duplicate/);
    const input = teams(); input[1].farm[0].id = input[0].farm[0].id;
    expect(() => validateFarmTeams(input)).toThrow(/duplicate/);
    t.players = []; delete t.farm[0].id;
    expect(() => selectFarmTeam(t, { round: 1 })).toThrow();
  });
});

it('fresh pitchers need no rescue on round one, regardless of role labels', () => {
  const t=team(); t.farm.filter(p=>p.isPitcher).forEach(p=>p.subtype='中継ぎ');
  const s=selectFarmTeam(t,{round:1});
  expect(s.warnings.filter(w=>w.code==='pitcher-rescue')).toHaveLength(0);
  expect(s.pitchers.every(p=>!p.rescue)).toBe(true);
});
