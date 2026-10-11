import { afterEach, expect, it, vi } from 'vitest';
import { createInitialTeams } from '../bootstrapTeams';
import { applyManagementPolicy, buildAutoManagedRoster, buildFullRosterPlan, proficiencyAt, validateTeamRoster } from '../rosterAutomation';

function seedRandom(seed) {
  let n = seed;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  });
}
const activeCatchers = team => team.players.filter(p => !p.isPitcher && p.pos === '捕手'
  && !p.育成 && !p.isIkusei && !(p.injuryDaysLeft > 0));
const farmCatchers = team => team.farm.filter(p => !p.isPitcher
  && !(p.injuryDaysLeft > 0) && proficiencyAt(p, '捕手') > 0);
afterEach(() => vi.restoreAllMocks());

it('keeps a healthy farm catcher through daily full roster management across all clubs', () => {
  for (let seed = 1; seed <= 10; seed++) {
    seedRandom(seed);
    for (const source of createInitialTeams()) {
      const before = structuredClone(source);
      const result = applyManagementPolicy(source, { force: true, gameDay: 7, automationMode: 'full' });
      expect(activeCatchers(result).length, `seed ${seed}, club ${source.id}: active`).toBeGreaterThanOrEqual(2);
      expect(farmCatchers(result).length, `seed ${seed}, club ${source.id}: farm`).toBeGreaterThanOrEqual(1);
      expect(validateTeamRoster(result).errors).toEqual([]);
      expect([...result.players, ...result.farm].map(p => p.id).sort())
        .toEqual([...source.players, ...source.farm].map(p => p.id).sort());
      expect(source).toEqual(before);
    }
    vi.restoreAllMocks();
  }
});

it('returns a surplus active catcher to the farm without changing abilities', () => {
  seedRandom(1);
  const team = createInitialTeams()[0];
  const catcher = farmCatchers(team)[0];
  team.farm = team.farm.filter(p => p.id !== catcher.id);
  team.players.push(catcher);
  const before = structuredClone(team);
  const result = buildFullRosterPlan(team).team;
  expect(activeCatchers(result).length).toBeGreaterThanOrEqual(2);
  expect(farmCatchers(result).length).toBeGreaterThanOrEqual(1);
  for (const p of [...result.players, ...result.farm]) {
    const original = [...before.players, ...before.farm].find(x => x.id === p.id);
    expect(p.positions).toEqual(original.positions);
    expect(p.batting).toEqual(original.batting);
  }
});

function twoCatcherTeam() {
  seedRandom(4);
  const team = createInitialTeams()[0];
  const ids = new Set(activeCatchers(team).slice(0, 2).map(p => p.id));
  team.players = team.players.filter(p => proficiencyAt(p, '捕手') <= 0 || ids.has(p.id));
  team.farm = team.farm.filter(p => proficiencyAt(p, '捕手') <= 0);
  return team;
}
it('prioritizes two active catchers when only two are available', () => {
  const team = twoCatcherTeam();
  const catcher = activeCatchers(team)[1];
  team.players = team.players.filter(p => p.id !== catcher.id);
  team.farm.push({ ...catcher, registrationCooldownDays: 0 });
  const result = buildFullRosterPlan(team).team;
  expect(activeCatchers(result)).toHaveLength(2);
  expect(farmCatchers(result)).toHaveLength(0);
  expect(validateTeamRoster(result).errors).toEqual([]);
});
it('does not clear an existing catcher registration cooldown to meet the active target', () => {
  const team = twoCatcherTeam();
  const catcher = activeCatchers(team)[1];
  team.players = team.players.filter(p => p.id !== catcher.id);
  team.farm.push({ ...catcher, registrationCooldownDays: 10 });
  const result = buildFullRosterPlan(team).team;
  expect(activeCatchers(result)).toHaveLength(1);
  expect(result.farm.find(p => p.id === catcher.id).registrationCooldownDays).toBe(10);
});
it('counts a healthy developmental secondary catcher as valid farm coverage', () => {
  const team = twoCatcherTeam();
  const p = team.farm.find(p => !p.isPitcher);
  Object.assign(p, { positions: { ...p.positions, 捕手: 50 }, 育成: true });
  const result = buildFullRosterPlan(team).team;
  expect(result.farm.some(x => x.id === p.id)).toBe(true);
  expect(activeCatchers(result)).toHaveLength(2);
  expect(farmCatchers(result).length).toBeGreaterThanOrEqual(1);
});
it('keeps secondary catcher coverage when the farm catcher is also the strongest DH candidate', () => {
  const team = twoCatcherTeam();
  const p = team.farm.find(p => !p.isPitcher);
  Object.assign(p, { pos: 'DH', positions: { 捕手: 50 }, condition: 100, potential: 99,
    batting: Object.fromEntries(Object.keys(p.batting).map(key => [key, 99])) });
  const result = buildFullRosterPlan(team).team;
  expect(activeCatchers(result)).toHaveLength(2);
  expect(farmCatchers(result).length).toBeGreaterThanOrEqual(1);
  expect(validateTeamRoster(result).errors).toEqual([]);
  expect(result.farm.find(x => x.id === p.id).registrationCooldownDays || 0).toBe(0);
});
it('returns an already-active secondary catcher when the two primary catchers are needed in the first team', () => {
  const team = twoCatcherTeam();
  const p = team.farm.find(p => !p.isPitcher);
  Object.assign(p, { pos: 'DH', positions: { 捕手: 50 }, condition: 100 });
  team.farm = team.farm.filter(x => x.id !== p.id);
  team.players.push(p);
  const result = buildFullRosterPlan(team).team;
  expect(activeCatchers(result)).toHaveLength(2);
  expect(farmCatchers(result).length).toBeGreaterThanOrEqual(1);
  expect(validateTeamRoster(result).errors).toEqual([]);
});
for (const mode of ['manual', 'emergency']) it(`keeps healthy ${mode} roster membership unchanged`, () => {
  seedRandom(4);
  const team = createInitialTeams()[0];
  const result = applyManagementPolicy(team, { force: true, gameDay: 7, automationMode: mode });
  expect(result.players).toEqual(team.players);
  expect(result.farm).toEqual(team.farm);
});
it('does not change roster membership during a lineup-only refresh', () => {
  seedRandom(4);
  const team = createInitialTeams()[0];
  const result = applyManagementPolicy(team, {
    force: true, gameDay: 7, automationMode: 'full', includeRosterChanges: false,
  });
  expect(result.players.map(p => p.id)).toEqual(team.players.map(p => p.id));
  expect(result.farm.map(p => p.id)).toEqual(team.farm.map(p => p.id));
});

function unscheduledFarmShortage() {
  const team = twoCatcherTeam();
  const p = team.farm.find(p => !p.isPitcher);
  Object.assign(p, { pos: 'DH', positions: { 捕手: 50 }, condition: 100 });
  team.farm = team.farm.filter(x => x.id !== p.id);
  team.players.push(p);
  team.managementMeta = { lastRosterDay: 0, lastLineupDay: 0 };
  return buildAutoManagedRoster(team);
}
it('repairs farm catcher coverage before the next scheduled roster day', () => {
  const team = unscheduledFarmShortage();
  expect(validateTeamRoster(team).errors).toEqual([]);
  const before = structuredClone(team);
  const result = applyManagementPolicy(team, { gameDay: 2, automationMode: 'full' });
  expect(activeCatchers(result)).toHaveLength(2);
  expect(farmCatchers(result).length).toBeGreaterThanOrEqual(1);
  expect(validateTeamRoster(result).errors).toEqual([]);
  expect([...result.players, ...result.farm].map(p => p.id).sort())
    .toEqual([...team.players, ...team.farm].map(p => p.id).sort());
  expect(team).toEqual(before);
});
it('does not repair farm coverage when roster changes are disabled', () => {
  const team = unscheduledFarmShortage();
  const result = applyManagementPolicy(team, {
    gameDay: 2, automationMode: 'full', includeRosterChanges: false,
  });
  expect(result.players.map(p => p.id)).toEqual(team.players.map(p => p.id));
  expect(result.farm.map(p => p.id)).toEqual(team.farm.map(p => p.id));
});
