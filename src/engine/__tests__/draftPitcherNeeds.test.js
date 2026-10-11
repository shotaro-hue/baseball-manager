import { afterEach, expect, it, vi } from 'vitest';
import { analyzeTeamNeeds } from '../trade';
import { chooseDraftProspect } from '../draftRules';

const pitcher = (id, subtype) => ({ id, isPitcher: true, subtype, pos: subtype,
  age: 22, potential: 70, readinessScore: 50, pitching: { velocity: 70 } });
const batter = (id, pos = 'DH') => ({ id, isPitcher: false, pos, age: 22, potential: 70,
  readinessScore: 50, batting: { contact: 70 } });
function fixture(role) {
  const players = [ ...Array.from({ length: 4 }, (_, i) => pitcher(`sp-${i}`, '先発')),
    ...Array.from({ length: 3 }, (_, i) => pitcher(`rp-${i}`, '中継ぎ')), pitcher('cl', '抑え'),
    ...Array.from({ length: 3 }, (_, i) => batter(`c-${i}`, '捕手')),
    ...['遊撃手', '二塁手', '三塁手'].flatMap(pos => [batter(`${pos}-1`, pos), batter(`${pos}-2`, pos)]) ];
  const missing = players.find(p => p.subtype === role);
  return { team: { id: 0, players: players.filter(p => p.id !== missing.id), farm: [] }, missing,
    pool: [batter('best-batter'), pitcher('another-pitcher', role)] };
}
afterEach(() => vi.restoreAllMocks());
for (const [role, label] of [['先発', '先発投手が不足'], ['中継ぎ', '中継ぎ不足'], ['抑え', '抑え不在']]) {
  it(`counts an accepted ${role} prospect in next-round draft needs without acquiring it`, () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    const { team, missing, pool } = fixture(role);
    const accepted = [{ ...missing, id: 0 }];
    const before = structuredClone({ team, pool, accepted });
    expect(chooseDraftProspect(team, pool, 2).id).toBe('another-pitcher');
    expect(chooseDraftProspect(team, pool, 2, accepted).id).toBe('best-batter');
    expect({ team, pool, accepted }).toEqual(before);
  });
  it(`counts an owned farm ${role} for drafting while preserving active roster shortage`, () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    const { team, missing, pool } = fixture(role);
    team.farm = [missing];
    expect(analyzeTeamNeeds(team).some(n => n.type === label)).toBe(true);
    expect(chooseDraftProspect(team, pool, 2).id).toBe('best-batter');
    expect(analyzeTeamNeeds(team).some(n => n.type === label)).toBe(true);
  });
}
it('keeps the active velocity weakness despite stronger farm pitchers', () => {
  const { team, missing } = fixture('先発');
  team.players = team.players.map(p => p.isPitcher ? { ...p, pitching: { velocity: 40 } } : p);
  team.farm = [{ ...missing, pitching: { velocity: 99 } }];
  expect(analyzeTeamNeeds(team, { includeFarmPitchers: true }).some(n => n.type === '投手陣の球威強化')).toBe(true);
});
it('includes farm and accepted young starters in the future rotation depth', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team, pool } = fixture('先発');
  team.players = team.players.map(p => p.subtype === '先発' ? { ...p, age: 35 } : p);
  team.farm = [pitcher('young-farm-1', '先発'), pitcher('young-farm-2', '先発')];
  const accepted = [pitcher(0, '先発')];
  expect(chooseDraftProspect(team, pool, 2).id).toBe('another-pitcher');
  expect(chooseDraftProspect(team, pool, 2, accepted).id).toBe('best-batter');
  expect(analyzeTeamNeeds(team).some(n => n.type === '将来の先発候補を育成したい')).toBe(true);
});
