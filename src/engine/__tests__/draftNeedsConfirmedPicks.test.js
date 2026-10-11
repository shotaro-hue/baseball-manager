import { afterEach, expect, it, vi } from 'vitest';
import { createInitialTeams } from '../bootstrapTeams';
import { chooseDraftProspect } from '../draftRules';
import { draftPicksForTeam } from '../offseasonResume';

const prospect = (id, pos = '捕手', extra = {}) => ({ id, pos, isPitcher: false,
  age: 22, potential: 70, readinessScore: 50,
  batting: { contact: 60, power: 60, eye: 60 }, ...extra });
function fixture() {
  let seed = 4;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  const team = createInitialTeams()[0];
  const keep = new Set(team.players.filter(p => p.pos === '捕手').slice(0, 2).map(p => p.id));
  team.players = team.players.filter(p => p.pos !== '捕手' || keep.has(p.id));
  team.farm = team.farm.filter(p => p.pos !== '捕手');
  Math.random.mockReturnValue(.5);
  return { team, available: [prospect('best-DH', 'DH'), prospect('another-C')] };
}
afterEach(() => vi.restoreAllMocks());
it('removes the catcher shortage bonus after an accepted pick without acquiring it early', () => {
  const { team, available } = fixture();
  const accepted = [prospect(0, '捕手', { _drafted: true, _r1winner: team.id })];
  const before = structuredClone({ team, available, accepted });
  expect(chooseDraftProspect(team, available, 2).id).toBe('another-C');
  expect(chooseDraftProspect(team, available, 2, accepted).id).toBe('best-DH');
  expect({ team, available, accepted }).toEqual(before);
});
it('uses accepted first and later picks after serialized reload, excluding refused and other clubs', () => {
  const { team, available } = fixture();
  const pool = [prospect(0, '捕手', { _drafted: true, _r1winner: 1 }),
    prospect('refused'), prospect('accepted')];
  const saved = JSON.parse(JSON.stringify({ pool, drafted: { refused: 'refused', accepted: team.id } }));
  const accepted = draftPicksForTeam(saved.pool, saved.drafted, team.id);
  expect(accepted.map(p => p.id)).toEqual(['accepted']);
  expect(chooseDraftProspect(team, available, 3, accepted).id).toBe('best-DH');
  expect(chooseDraftProspect(team, available, 3,
    draftPicksForTeam(saved.pool, { refused: 'refused', accepted: 1 }, team.id)).id).toBe('another-C');
});
it('does not count a pick already present in the roster twice', () => {
  const { team, available } = fixture();
  const catcher = team.players.find(p => p.pos === '捕手');
  expect(chooseDraftProspect(team, available, 2, [catcher]).id).toBe('another-C');
});
