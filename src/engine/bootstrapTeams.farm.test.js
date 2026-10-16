import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialTeams } from './bootstrapTeams';
import { selectFarmTeam } from './farmSelection';
import { isIkuseiPlayer, optimizeTeamForGameStart, validateTeamRoster } from './rosterAutomation';
import { buildTeam, makePlayer, makeInitialFarmBatters } from './playerCore';
import { rng } from '../utils';
import { FIELDING_POSITIONS, TEAM_DEFS } from '../constants';
import { NPB2025_ROSTERS } from '../data/npb2025';

function seedRandom(seed) {
  let n = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  });
}
afterEach(() => { vi.restoreAllMocks(); vi.doUnmock('../data/npb2025'); vi.resetModules(); });

function checkTeams(teams, real) {
  for (const team of teams) {
    const all = [...team.players, ...team.farm];
    const expected = real
      ? NPB2025_ROSTERS[team.id].batters.length + NPB2025_ROSTERS[team.id].pitchers.length + 18
      : 47;
    expect(all.length, `team ${team.id}: total`).toBe(expected);
    expect(new Set(all.map(p => p.id)).size).toBe(expected);
    const catchers = team.players.filter(p => !p.isPitcher && p.pos === '捕手'
      && !isIkuseiPlayer(p) && Number(p.injuryDaysLeft || 0) === 0);
    expect(catchers.length, `team ${team.id}: active catchers`).toBeGreaterThanOrEqual(3);
    expect(all.filter(p => !p.isPitcher && p.pos === '捕手' && !isIkuseiPlayer(p)).length).toBeGreaterThanOrEqual(6);
    expect(validateTeamRoster(team).errors, `team ${team.id}: roster`).toEqual([]);
    expect(selectFarmTeam(team, { round: 1 }).status, `team ${team.id}: farm`).toBe('ready');
  }
}

describe('initial catcher coverage', () => {
  it('preserves generated abilities and RNG consumption when reserving catcher slots', () => {
    for (const seed of [1, 3, 42]) {
      seedRandom(seed);
      const reference = Array.from({ length: 12 }, () =>
        makePlayer(FIELDING_POSITIONS[rng(0, 7)], 50, false, rng(18, 25)));
      const nextRandom = Math.random();
      vi.restoreAllMocks();
      seedRandom(seed);
      const farm = makeInitialFarmBatters(12, 50, []);
      expect(Math.random()).toBe(nextRandom);
      const changed = reference.filter((p, i) => farm[i].pos !== p.pos);
      const otherPositions = new Set(reference.filter(p => p.pos !== '捕手').map(p => p.pos)).size;
      const target = Math.min(6, reference.length - otherPositions);
      expect(changed.length).toBe(Math.max(0, target - reference.filter(p => p.pos === '捕手').length));
      expect(farm).toEqual(reference.map((p, i) => farm[i].pos !== p.pos
        ? { ...p, pos: '捕手', positions: { 捕手: 100 } } : p));
      for (const pos of FIELDING_POSITIONS) {
        if (reference.some(p => p.pos === pos)) expect(farm.some(p => p.pos === pos)).toBe(true);
      }
      vi.restoreAllMocks();
    }
  });
  it('does not bypass a cooldown already present before initial optimization', () => {
    seedRandom(3);
    const raw = buildTeam(TEAM_DEFS[0]);
    const keeper = raw.players.find(p => p.pos === '捕手');
    const moved = raw.players.filter(p => p.pos === '捕手' && p !== keeper);
    const team = { ...raw,
      players: raw.players.filter(p => p.pos !== '捕手' || p === keeper),
      farm: [...raw.farm, ...moved].map(p => p.pos === '捕手'
        ? { ...p, registrationCooldownDays: 10 } : p),
    };
    const blockedIds = team.farm.filter(p => p.pos === '捕手').map(p => p.id);
    const result = optimizeTeamForGameStart(team);
    expect(result.players.filter(p => blockedIds.includes(p.id))).toEqual([]);
    for (const id of blockedIds) {
      expect(result.farm.find(p => p.id === id).registrationCooldownDays).toBe(10);
    }
  });
  it('keeps three active catchers and a playable farm without increasing real-team headcounts', () => {
    for (let seed = 1; seed <= 100; seed++) {
      seedRandom(seed);
      checkTeams(createInitialTeams(), true);
      vi.restoreAllMocks();
    }
  }, 60000);
  it('also covers the generated-team fallback with unchanged headcounts', async () => {
    vi.doMock('../data/npb2025', async importOriginal => ({ ...await importOriginal(), NPB2025_ROSTERS: {} }));
    const { createInitialTeams: createFallback } = await import('./bootstrapTeams');
    for (let seed = 1; seed <= 100; seed++) {
      seedRandom(seed);
      checkTeams(createFallback(), false);
      vi.restoreAllMocks();
    }
  }, 60000);
});
