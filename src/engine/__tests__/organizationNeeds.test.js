import { afterEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { evaluateOrganizationNeeds } from '../organizationNeeds';
import { saveGame, loadGame } from '../saveload';

const player = (id, extra = {}) => ({ id, age: 22, potential: 70, isPitcher: false,
  pos: '捕手', batting: { contact: 60, power: 60, eye: 60 }, ...extra });
const pitcher = (id, subtype = '先発', extra = {}) => player(id, { isPitcher: true, subtype,
  pitching: { velocity: 60, control: 60, breaking: 60, stamina: 60 }, ...extra });
const team = (players = [], farm = []) => ({ id: 0, players, farm });
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('separates operating shortage from first/farm/development ownership and accepted picks', () => {
  const t = team([pitcher(0), pitcher(1, '先発', { injuryDaysLeft: 1 })],
    [pitcher(2), pitcher(3), pitcher(4, '先発', { isIkusei: true })]);
  const result = evaluateOrganizationNeeds(t, { draftPool: [pitcher(5)], drafted: { 5: 0 } });
  expect(result.ok).toBe(true);
  expect(result.roles.starter).toMatchObject({ activeCount: 1, ownedActiveCount: 2,
    farmCount: 2, developmentCount: 1, availableFarmCount: 2, directlyPromotableFarmCount: 2, ownedCount: 5,
    acceptedPickCount: 1, organizationCount: 6, activeShortage: 3,
    organizationShortage: 0, classification: 'active-shortage-with-farm' });
  expect(result.roles.starter.reasons).toContain('eligible-farm-promotion');
  expect(result.registeredCount).toBe(4);
  expect(result.remainingRegisteredSlots).toBe(65);
});

it('reports all requested roles against existing operating and depth minima', () => {
  const t = team([pitcher(0, '中継ぎ'), pitcher(1, '抑え'), player(2),
    player(3, { pos: '遊撃手' }), player(4, { pos: '二塁手' }), player(5, { pos: '三塁手' })]);
  const { roles } = evaluateOrganizationNeeds(t);
  expect(Object.keys(roles)).toEqual(['starter', 'reliever', 'closer', 'catcher', 'shortstop', 'secondBase', 'thirdBase']);
  expect(roles.reliever.activeShortage).toBe(2);
  expect(roles.closer.activeShortage).toBe(0);
  expect(roles.catcher).toMatchObject({ activeShortage: 1, organizationMinimum: 6, organizationShortage: 5 });
  for (const role of ['shortstop', 'secondBase', 'thirdBase']) {
    expect(roles[role]).toMatchObject({ activeCount: 1, activeShortage: 0, organizationShortage: 1 });
  }
});

it('counts promotion eligibility separately from ability and excludes unavailable farm players', () => {
  const t = team([], [player(0, { batting: { contact: 1 } }),
    player(1, { injuryDaysLeft: 1 }), player(2, { registrationCooldownDays: 1 }),
    player(3, { 育成: true }), player(4, { isIkusei: true })]);
  expect(evaluateOrganizationNeeds(t).roles.catcher).toMatchObject({ availableFarmCount: 1,
    farmCount: 3, developmentCount: 2, organizationCount: 5 });
});

it('uses the actual foreign total and pitcher/batter composition promotion restrictions', () => {
  const foreigners = [0, 1, 2].map(id => pitcher(id, '先発', { isForeign: true }));
  const t = team(foreigners, [pitcher(3, '中継ぎ', { isForeign: true }), player(4, { isForeign: true })]);
  expect(evaluateOrganizationNeeds(t).roles.reliever).toMatchObject({ availableFarmCount: 1, directlyPromotableFarmCount: 0 });
  expect(evaluateOrganizationNeeds(t).roles.catcher.directlyPromotableFarmCount).toBe(1);
  const fullForeign = { ...t, players: [...foreigners, player(5, { isForeign: true })] };
  expect(evaluateOrganizationNeeds(fullForeign).roles.catcher.directlyPromotableFarmCount).toBe(0);
});

it('reports unavailable organizational depth when the active roster has no promotion slot', () => {
  const t = team(Array.from({ length: 28 }, (_, id) => player(id, { pos: '一塁手' })),
    [player(28), player(29), player(30)]);
  expect(evaluateOrganizationNeeds(t).roles.catcher).toMatchObject({ activeCount: 0,
    availableFarmCount: 3, directlyPromotableFarmCount: 0, organizationShortage: 3, classification: 'active-shortage-with-farm' });
  expect(evaluateOrganizationNeeds(t).roles.catcher.reasons).toContain('farm-promotion-requires-roster-change');
});

it('does not let picks erase an operating shortage or include refused, other-club, owned or duplicate picks', () => {
  const t = team([player('owned')]);
  const other = { id: 1, players: [player('other-owned')], farm: [] };
  const draftPool = [player(0, { _drafted: true, _r1winner: 0 }), player('later'),
    player('refused', { _drafted: true, _r1winner: 0 }), player('elsewhere'),
    player('owned'), player('other-owned'), player('later'), player(null),
    player('conflict', { _drafted: true, _r1winner: 1 })];
  const drafted = { later: 0, refused: 'refused', elsewhere: 1, owned: 0,
    'other-owned': 0, conflict: 0 };
  const result = evaluateOrganizationNeeds(t, { teams: [t, other], draftPool, drafted });
  expect(result.roles.catcher).toMatchObject({ acceptedPickCount: 2, organizationCount: 3,
    activeShortage: 1, organizationShortage: 3 });
  expect(result.acceptedPickIds).toEqual([0, 'later']);
  expect(result.remainingRegisteredSlots).toBe(67);
});

it.each([69, 70])('reports controlled roster remaining slots at %i without counting development', count => {
  const t = team([], [...Array.from({ length: count }, (_, id) => player(id)), player('development', { 育成: true })]);
  expect(evaluateOrganizationNeeds(t).remainingRegisteredSlots).toBe(70 - count);
  expect(evaluateOrganizationNeeds(t, { draftPool: [player('pick')], drafted: { pick: 0 } }).remainingRegisteredSlots)
    .toBe(Math.max(0, 69 - count));
});

it('rejects ambiguous ownership and missing owned IDs rather than inventing depth', () => {
  const t = team([player(0)], [player(0)]);
  expect(evaluateOrganizationNeeds(t)).toMatchObject({ ok: false, reason: 'invalid-owned-ids' });
  const valid = team([player(0)]), other = { ...team([player(0)]), id: 1 };
  expect(evaluateOrganizationNeeds(valid, { teams: [valid, other] })).toMatchObject({ ok: false, reason: 'invalid-owned-ids' });
  expect(evaluateOrganizationNeeds(team([player(null)]))).toMatchObject({ ok: false, reason: 'invalid-owned-ids' });
});

it('uses existing starter age boundaries and leaves undefined future position rules unassessed', () => {
  const t = team([pitcher(0, '先発', { age: 31 })],
    [pitcher(1, '先発', { age: 24 }), pitcher(2, '先発', { age: 25 }),
      pitcher(3, '先発', { age: 30 }), pitcher(4, '先発', { age: 23, 育成: true })]);
  const result = evaluateOrganizationNeeds(t, { draftPool: [pitcher(5, '先発', { age: 18 })], drafted: { 5: 0 } });
  expect(result.roles.starter.futureDepth).toMatchObject({ youngCount: 3, primeCount: 5, youngShortage: 0, primeShortage: 0 });
  expect(result.roles.catcher.futureDepth).toBeNull();
  expect(result.roles.catcher.reasons).toContain('future-depth-unassessed');
  expect(evaluateOrganizationNeeds(team([pitcher(0, '先発', { age: 31 })])).roles.starter.futureDepth)
    .toMatchObject({ youngCount: 0, primeCount: 0, youngShortage: 2, primeShortage: 3 });
});

it('is deterministic, accepts deeply frozen inputs and never draws randomness or alters saves', () => {
  const t = team([pitcher(0)], [player(1)]), options = { draftPool: [player(2)], drafted: { 2: 0 } };
  const before = JSON.stringify({ t, options });
  freeze(t); freeze(options);
  vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('unexpected random draw'); });
  const result = evaluateOrganizationNeeds(t, options);
  expect(result.ok).toBe(true);
  expect(evaluateOrganizationNeeds(t, options)).toEqual(result);
  expect(JSON.stringify({ t, options })).toBe(before);
});

it('recomputes the same derived evaluation after a real save/load without persisting a report', async () => {
  const rows = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: k => rows.get(k) ?? null,
    setItem: (k, v) => rows.set(k, String(v)), removeItem: k => rows.delete(k) });
  const t = team([pitcher(0, '先発', { injuryDaysLeft: 2 })], [player(1, { isIkusei: true })]);
  const state = { teams: [t], myId: 0, year: 2026, gameDay: 1, saveId: 'organization-needs',
    offseasonPlan: { version: 1, year: 2026, myId: 0, stage: 'results', resumeScreen: 'draft',
      draftPool: [player(2, { _drafted: true, _r1winner: 0 })], drafted: {} } };
  const result = evaluateOrganizationNeeds(t, state.offseasonPlan);
  expect(result.roles.catcher.acceptedPickCount).toBe(1);
  expect((await saveGame(state, { skipCompression: true })).ok).toBe(true);
  const savedBefore = rows.get('baseball_manager_v1');
  const restored = await loadGame();
  expect(evaluateOrganizationNeeds(restored.teams[0], restored.offseasonPlan)).toEqual(result);
  expect(rows.get('baseball_manager_v1')).toBe(savedBefore);
  expect(restored.teams[0]).not.toHaveProperty('organizationNeeds');
});
it('uses the validated record of an accepted duplicate ID rather than an earlier other-club role',()=>{
 const t=team(),draftPool=[pitcher('duplicate','先発',{_drafted:true,_r1winner:1}),player('duplicate',{pos:'遊撃手',_drafted:true,_r1winner:0})];
 const r=evaluateOrganizationNeeds(t,{draftPool});expect(r.ok).toBe(true);
 expect(r.roles.starter.acceptedPickCount).toBe(0);expect(r.roles.shortstop.acceptedPickCount).toBe(1);
});
