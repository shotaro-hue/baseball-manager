import { afterEach, expect, it, vi } from 'vitest';
import { chooseDraftProspect, remainingDraftSlots } from '../draftRules';
import { evaluateOrganizationNeeds } from '../organizationNeeds';

const pitcher = (id, subtype, extra = {}) => ({ id, name: String(id), isPitcher: true, pos: subtype,
  subtype, age: 22, potential: 70, readinessScore: 50, pitching: { velocity: 70 }, ...extra });
const batter = (id, pos = 'DH', extra = {}) => ({ id, name: String(id), isPitcher: false, pos,
  age: 22, potential: 70, readinessScore: 50, batting: { contact: 70 }, ...extra });
const roleKeys = { '先発': 'starter', '中継ぎ': 'reliever', '抑え': 'closer' };
function fixture(role) {
  const players = [...Array.from({ length: 4 }, (_, i) => pitcher(`sp-${i}`, '先発')),
    ...Array.from({ length: 3 }, (_, i) => pitcher(`rp-${i}`, '中継ぎ')), pitcher('cl', '抑え'),
    ...Array.from({ length: 3 }, (_, i) => batter(`c-${i}`, '捕手')),
    ...['遊撃手', '二塁手', '三塁手'].flatMap(pos => [batter(`${pos}-1`, pos), batter(`${pos}-2`, pos)])];
  const missing = players.find(p => p.subtype === role);
  const team = { id: 0, players: missing ? players.filter(p => p.id !== missing.id) : players, farm: [] };
  return { team, missing };
}
afterEach(() => vi.restoreAllMocks());
for (const role of Object.keys(roleKeys)) {
  for (const round of [1, 2]) it(`${round} round rewards only missing ${role}, retaining candidate order and randomness`, () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(.5);
    const { team } = fixture(role);
    const wrong = role === '先発' ? '中継ぎ' : '先発';
    const pool = [pitcher('wrong-role', wrong), pitcher('needed-role', role)];
    const before = structuredClone({ team, pool });
    expect(chooseDraftProspect(team, pool, round).id).toBe('needed-role');
    expect(random).toHaveBeenCalledTimes(1);
    expect({ team, pool }).toEqual(before);
  });
}
it('does not grant unnecessary role bonus to a covered staff', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team } = fixture();
  expect(chooseDraftProspect(team, [pitcher('relief', '中継ぎ'), pitcher('starter', '先発')], 2).id).toBe('relief');
});
it('uses healthy farm depth as coverage even if promotion requires a roster change', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team, missing } = fixture('先発');
  team.farm = [missing, pitcher('farm2', '先発'), pitcher('farm3', '先発')];
  while (team.players.length < 28) team.players.push(batter(`filler-${team.players.length}`));
  expect(evaluateOrganizationNeeds(team).roles.starter).toMatchObject({ availableFarmCount: 3, directlyPromotableFarmCount: 0 });
  expect(chooseDraftProspect(team, [pitcher('relief', '中継ぎ'), pitcher('starter', '先発')], 2).id).toBe('relief');
});
for (const unavailable of [{ injuryDaysLeft: 3 }, { registrationCooldownDays: 3 }, { isIkusei: true }]) {
  it(`keeps a reduced draft need when farm coverage is unavailable: ${JSON.stringify(unavailable)}`, () => {
    vi.spyOn(Math, 'random').mockReturnValue(.5);
    const { team, missing } = fixture('先発');
    team.farm = [{ ...missing, ...unavailable }];
    expect(chooseDraftProspect(team, [pitcher('relief', '中継ぎ'), pitcher('starter', '先発')], 2).id).toBe('starter');
    // A 14-point base rank advantage exceeds the reduced 12 points, preserving best-available balance.
    const pool = [pitcher('relief', '中継ぎ'), ...Array.from({ length: 6 }, (_, i) => pitcher(`other-${i}`, '中継ぎ')),
      pitcher('starter', '先発')];
    expect(chooseDraftProspect(team, pool, 2).id).toBe('relief');
  });
}
it('targets future starter age layers rather than unrelated young relievers', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team } = fixture();
  team.players = team.players.map(p => p.subtype === '先発' ? { ...p, age: 35 } : p);
  expect(chooseDraftProspect(team, [pitcher('young-relief', '中継ぎ'), pitcher('young-SP', '先発')], 2).id).toBe('young-SP');
  expect(chooseDraftProspect(team, [pitcher('old-SP', '先発', { age: 35 }), pitcher('young-SP', '先発')], 2).id).toBe('young-SP');
});
for (const round1 of [true, false]) it(`canonical ${round1 ? 'first' : 'later'} picks stop repeat-role bonuses without becoming active`, () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team, missing } = fixture('先発');
  const picked = { ...missing, id: 0, ...(round1 ? { _drafted: true, _r1winner: 0 } : {}) };
  const context = { draftPool: [picked], drafted: round1 ? {} : { 0: 0 }, teams: [team] };
  const report = evaluateOrganizationNeeds(team, context);
  expect(report.roles.starter).toMatchObject({ activeShortage: 1, acceptedPickCount: 1, organizationShortage: 0 });
  expect(chooseDraftProspect(team, [pitcher('relief', '中継ぎ'), pitcher('starter', '先発')], 3, [], context).id).toBe('relief');
});
it('canonical picks exclude refusal, other teams, conflicts, already owned and duplicates including ID 0', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team, missing } = fixture('先発');
  const other = { id: 1, players: [pitcher('else-owned', '先発')], farm: [] };
  const draftPool = [{ ...missing, id: 0, _drafted: true, _r1winner: 0 },
    { ...missing, id: 'conflict', _drafted: true, _r1winner: 1 },
    { ...missing, id: 'refused', _drafted: true, _r1winner: 0 },
    { ...missing, id: 'elsewhere' }, other.players[0], team.players[0]];
  const drafted = { 0: 'refused', conflict: 0, refused: 'refused', elsewhere: 1,
    'else-owned': 0, [team.players[0].id]: 0 };
  const pool = [pitcher('relief', '中継ぎ'), pitcher('starter', '先発')];
  expect(chooseDraftProspect(team, pool, 3, [], { teams: [team, other], draftPool, drafted }).id).toBe('starter');
  drafted[0] = 0; draftPool.push(draftPool[0]);
  expect(chooseDraftProspect(team, pool, 3, [], { teams: [team, other], draftPool, drafted }).id).toBe('relief');
});
it('accepted-array adapter excludes another first-round owner and owned players', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team, missing } = fixture('先発');
  expect(chooseDraftProspect(team, [pitcher('relief', '中継ぎ'), pitcher('starter', '先発')], 2,
    [{ ...missing, _drafted: true, _r1winner: 1 }, team.players[0]]).id).toBe('starter');
});
it('preserves independent global velocity needs', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team } = fixture();
  team.players = team.players.map(p => p.isPitcher ? { ...p, pitching: { velocity: 40 } } : p);
  expect(chooseDraftProspect(team, [batter('batter'), pitcher('relief', '中継ぎ')], 2).id).toBe('relief');
});
it('keeps potential versus readiness base evaluation and can choose a stronger unrelated role', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team } = fixture('先発');
  const pool = [pitcher('potential', '先発', { potential: 99, readinessScore: 1 }),
    pitcher('ready', '先発', { potential: 1, readinessScore: 99 })];
  expect(chooseDraftProspect(team, pool, 2).id).toBe('ready');
  const covered = fixture().team;
  covered.players = covered.players.map(p => p.subtype === '先発' ? { ...p, age: 35 } : p);
  expect(chooseDraftProspect(covered, pool, 2).id).toBe('potential');
  const ranked = [pitcher('best-relief', '中継ぎ'), ...Array.from({ length: 12 }, (_, i) => pitcher(`rp-${i}`, '中継ぎ')),
    pitcher('weak-starter', '先発', { readinessScore: 1 })];
  expect(chooseDraftProspect(team, ranked, 2).id).toBe('best-relief');
});
it.each([69, 70])('does not change roster capacity at %i and counts the reservation once', count => {
  const { team } = fixture();
  while (team.players.length + team.farm.length < count) team.farm.push(batter(`filler-${team.farm.length}`));
  const pick = pitcher(0, '先発', { _drafted: true, _r1winner: 0 });
  expect(remainingDraftSlots(team)).toBe(70 - count);
  expect(remainingDraftSlots(team, [pick], {})).toBe(Math.max(0, 69 - count));
});

it('fills only the remaining two-starter gap across successive confirmed rounds', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team } = fixture('先発');
  team.players = team.players.filter(p => p.id !== 'sp-1');
  const picked = pitcher(0, '先発');
  const pool = [pitcher('relief', '中継ぎ'), pitcher('starter', '先発')];
  expect(chooseDraftProspect(team, pool, 3, [picked]).id).toBe('starter');
  expect(chooseDraftProspect(team, pool, 4, [picked, pool[1], pool[1]]).id).toBe('relief');
});

it.each([true, false])('projects the valid pick entity before deduplication (canonical=%s)', canonical => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const { team, missing } = fixture('先発');
  team.players = team.players.filter(p => p.id !== 'c-2');
  const draftPool = [batter(0, '捕手', { _drafted: true, _r1winner: 1 }),
    { ...missing, id: 0, _drafted: true, _r1winner: 0 }];
  const context = { teams: [team], draftPool, drafted: { 0: 0 } };
  expect(evaluateOrganizationNeeds(team, context).roles.catcher.organizationShortage).toBe(1);
  expect(chooseDraftProspect(team, [batter('best-DH'), batter('needed-C', '捕手')], 2,
    canonical ? [] : draftPool, canonical ? context : {}).id).toBe('needed-C');
});
