import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
// These fixtures require the legacy generated depth; bundled data is tested separately.
import { createInitialTeams } from '../bootstrapTeams';
import { analyzeTeamNeeds } from '../trade';
import { evaluateOrganizationNeeds } from '../organizationNeeds';
import { applyDraftAcquisitions, rankDraftProspects } from '../draftRules';
import { evaluateRosterCapacity } from '../rosterCapacity';
import { loadGame, saveGame } from '../saveload';
import { applyManagementPolicy, buildFullRosterPlan, proficiencyAt, validateTeamRoster } from '../rosterAutomation';

const fixture = JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/new-game.json.gz', import.meta.url))));
const healthy = p => !(p.injuryDaysLeft > 0);
const activeCatchers = t => t.players.filter(p => !p.isPitcher && p.pos === '捕手' && healthy(p) && !p.育成 && !p.isIkusei);
const farmCatchers = t => t.farm.filter(p => !p.isPitcher && healthy(p) && proficiencyAt(p, '捕手') > 0);
const owned = t => [...t.players, ...t.farm];
const catcherNeed = t => analyzeTeamNeeds(t).find(n => n.type.includes('捕手'));

function teamWithCatchers(count = 6, injured = 0) {
  const team = structuredClone(fixture.teams[0]);
  const template = team.players.find(p => p.pos === '捕手');
  team.players = team.players.filter(p => p.isPitcher || proficiencyAt(p, '捕手') <= 0);
  team.farm = team.farm.filter(p => p.isPitcher || proficiencyAt(p, '捕手') <= 0);
  for (let i = 0; i < count; i++) {
    const p = { ...structuredClone(template), id: `catcher-${i}`, injuryDaysLeft: i >= count - injured ? 15 : 0,
      injury: i >= count - injured ? 'test' : null, registrationCooldownDays: 0 };
    (i < 2 ? team.players : team.farm).push(p);
  }
  return team;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('starts all clubs with at least six controlled catchers and three active catchers', () => {
  let seed = 20261016;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  for (const team of createInitialTeams(null)) {
    expect(owned(team).filter(p => !p.isPitcher && p.pos === '捕手' && !p.育成 && !p.isIkusei).length,
      `club ${team.id}: controlled depth`).toBeGreaterThanOrEqual(6);
    expect(activeCatchers(team).length, `club ${team.id}: active`).toBe(3);
    expect(team.players, `club ${team.id}: active roster`).toHaveLength(28);
    expect(farmCatchers(team).length, `club ${team.id}: farm`).toBeGreaterThanOrEqual(3);
  }
});

it('fills the active bench after returning a surplus catcher to the farm', () => {
  const team = structuredClone(fixture.teams[0]), before = structuredClone(team);
  expect(team.players).toHaveLength(28);
  expect(activeCatchers(team)).toHaveLength(4);
  const { team: result, changes, validation } = buildFullRosterPlan(team);
  expect(result.players).toHaveLength(28);
  expect(activeCatchers(result)).toHaveLength(3);
  expect(farmCatchers(result).length).toBeGreaterThanOrEqual(1);
  expect(validation.errors).toEqual([]);
  expect(changes.some(r => r.type === 'promote' && r.upPlayer.pos !== '捕手')).toBe(true);
  expect(owned(result).map(p => p.id).sort()).toEqual(owned(before).map(p => p.id).sort());
  expect(team).toEqual(before);
});

it.each(['cooldown', 'developmental', 'foreign-limit'])('keeps a vacancy when every replacement is blocked by %s', constraint => {
  const team = structuredClone(fixture.teams[0]);
  if (constraint === 'foreign-limit') {
    team.players.find(p => p.pos !== '捕手' && !p.isForeign).isForeign = true;
  }
  for (const p of team.farm.filter(p => p.pos !== '捕手')) {
    if (constraint === 'cooldown') p.registrationCooldownDays = 10;
    else if (constraint === 'developmental') p.isIkusei = true;
    else p.isForeign = true;
  }
  const before = structuredClone(team);
  const { team: result, validation } = buildFullRosterPlan(team);
  expect(result.players).toHaveLength(27);
  expect(activeCatchers(result)).toHaveLength(3);
  expect(farmCatchers(result).length).toBeGreaterThanOrEqual(1);
  expect(validation.errors).toEqual([]);
  expect(result.players.every(p => before.players.some(q => q.id === p.id))).toBe(true);
  expect(team).toEqual(before);
});

it.each([[0, 3, 3], [1, 3, 2], [2, 3, 1], [3, 2, 1], [4, 2, 0]])(
  'allocates six owned catchers with %i injuries as active=%i, farm=%i', (injured, active, farm) => {
    const team = teamWithCatchers(6, injured), before = structuredClone(team);
    const result = buildFullRosterPlan(team).team;
    expect(activeCatchers(result)).toHaveLength(active);
    expect(farmCatchers(result)).toHaveLength(farm);
    expect(validateTeamRoster(result).errors).toEqual([]);
    expect(owned(result).map(p => p.id).sort()).toEqual(owned(before).map(p => p.id).sort());
    for (const p of owned(result)) {
      const original = owned(before).find(q => q.id === p.id);
      expect(p.batting).toEqual(original.batting);
      expect(p.positions).toEqual(original.positions);
      expect(p.injuryDaysLeft).toBe(original.injuryDaysLeft);
    }
    expect(team).toEqual(before);
  },
);

it('restores the third active catcher on an unscheduled day when healthy depth returns', () => {
  const team = buildFullRosterPlan(teamWithCatchers(6, 3)).team;
  const recovering = team.farm.find(p => p.injuryDaysLeft > 0);
  Object.assign(recovering, { injuryDaysLeft: 0, injury: null, registrationCooldownDays: 0 });
  team.managementMeta = { lastRosterDay: 1, lastLineupDay: 1 };
  const result = applyManagementPolicy(team, { gameDay: 2, automationMode: 'full' });
  expect(activeCatchers(result)).toHaveLength(3);
  expect(farmCatchers(result)).toHaveLength(1);
});

it('does not bypass an existing cooldown to reach the usual three-catcher target', () => {
  const team = teamWithCatchers(6);
  team.farm = team.farm.map(p => p.pos === '捕手' ? { ...p, registrationCooldownDays: 10 } : p);
  const result = buildFullRosterPlan(team).team;
  expect(activeCatchers(result)).toHaveLength(2);
  expect(result.farm.filter(p => p.pos === '捕手').every(p => p.registrationCooldownDays === 10)).toBe(true);
});

it('requests controlled catcher depth below six even with two healthy active catchers', () => {
  expect(catcherNeed(teamWithCatchers(5))).toBeDefined();
  expect(catcherNeed(teamWithCatchers(6))).toBeUndefined();
});

it('detects unavailable depth even when six catchers are owned', () => {
  const need = catcherNeed(teamWithCatchers(6, 4));
  expect(need).toBeDefined();
  expect(need.score).toBeGreaterThan(catcherNeed(teamWithCatchers(5)).score);
});

it.each(['育成', 'isIkusei'])('does not count %s catchers as controlled organizational depth', flag => {
  const team = teamWithCatchers(6);
  team.farm.filter(p => p.pos === '捕手').slice(0, 2).forEach(p => { p[flag] = true; });
  expect(catcherNeed(team)).toBeDefined();
  expect(evaluateOrganizationNeeds(team).roles.catcher.organizationShortage).toBe(2);
});

it.each(['育成', 'isIkusei'])('projects legacy controlled draft signings with %s prospect flags without changing prospects', flag => {
  const team = teamWithCatchers(5);
  const pick = { ...structuredClone(team.players.find(p => p.pos === '捕手')), id: 0, [flag]: true };
  const before = structuredClone({ team, pick });
  const report = evaluateOrganizationNeeds(team, { draftPool: [pick], drafted: { 0: team.id } });
  // Actual development reservations do not consume a controlled slot. This
  // legacy role projection describes the controlled contract created below.
  expect(evaluateRosterCapacity(team, { draftPool: [pick], drafted: { 0: team.id } }).acceptedPickCount).toBe(0);
  expect(report.roles.catcher).toMatchObject({ acceptedPickCount: 1, organizationShortage: 0 });
  const pool = [{ ...pick, id: 'best-DH', pos: 'DH', 育成: false, isIkusei: false },
    { ...pick, id: 'another-C', 育成: false, isIkusei: false }];
  expect(rankDraftProspects(team, pool, 2, [pick]))
    .toEqual(rankDraftProspects(team, pool, 2, [{ ...pick, 育成: false, isIkusei: false }]));
  const acquired = applyDraftAcquisitions([team], [pick], { 0: team.id }, 2026);
  expect(acquired.ok).toBe(true);
  expect(acquired.teams[0].farm.find(p => p.id === 0)).toMatchObject({ 育成: false, isIkusei: false });
  expect(evaluateOrganizationNeeds(acquired.teams[0]).roles.catcher).toMatchObject({ acceptedPickCount: 0, organizationShortage: 0 });
  expect({ team, pick }).toEqual(before);
});

it('loads and resumes an old three-catcher save without generating or rewriting players', async () => {
  const rows = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('IDBKeyRange', IDBKeyRange);
  vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  const team = teamWithCatchers(3);
  team.history = [{ id: 'previous-team', name: '過去所属を保持', exitYear: 2025 }];
  const state = { ...structuredClone(fixture), teams: [team], saveId: 'catcher-depth-legacy', myId: team.id };
  const identity = t => owned(t).map(p => [p.id, p.name, p.pos, p.batting, p.salary, p.injuryDaysLeft]).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  expect((await saveGame(state)).ok).toBe(true);
  const loaded = await loadGame();
  expect(identity(loaded.teams[0])).toEqual(identity(team));
  expect(loaded.teams[0].history).toEqual(team.history);
  const resumed = applyManagementPolicy(loaded.teams[0], { force: true, gameDay: 2, automationMode: 'full' });
  expect(activeCatchers(resumed)).toHaveLength(2);
  expect(farmCatchers(resumed)).toHaveLength(1);
  expect(identity(resumed)).toEqual(identity(team));
  expect(resumed.history).toEqual(team.history);
});
