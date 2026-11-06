import { it, expect, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createInitialTeams } from '../bootstrapTeams';
import { getFaProgress, getFaThreshold } from '../contract';
import { initializePlayerEligibility, exerciseFaRights, accrueFaService } from '../playerEligibility';
import { migrateEligibilityWorld } from '../eligibilityMigration';
import { openingEligibilityFacts, OPENING_FA_FACTS } from '../../data/openingEligibility2026';
import { applyRegularSeasonTeamUpdate } from '../regularGameUpdates';
import { applyDraftAcquisitions } from '../draftRules';
import { addMarketSigning } from '../../components/hub/faMarket';
import { realBatterToPlayer } from '../realplayer';
import { TEAM_DEFS } from '../../constants';
import legacyRecontract from './fixtures/legacyFaRecontract.json';
import { validateEconomySave } from '../economyPersistence';
import legacyPendingMarket from './fixtures/legacyFaPendingMarket.json';
import legacyPendingRecontract from './fixtures/legacyFaPendingRecontract.json';
import { reduceEconomyCommand, fromAnnualState, toAnnualState } from '../contractEconomy';
import { envelope } from './fixtures/faDeclarations';

it('preserves the entire pre-fix 1059-player new game, all eligibility balances and RNG consumption', () => {
  let seed = 42, calls = 0;
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { calls++; seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; });
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1791508062000);
  try {
    const teams = createInitialTeams(), players = teams.flatMap(t => [...t.players, ...t.farm]);
    const progress = players.map(p => ({ id: p.realPlayerId, eligibility: p.eligibility, progress: getFaProgress(p) }))
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(players).toHaveLength(1059);
    expect(progress.filter(p => p.progress.domestic.eligible)).toHaveLength(79);
    expect(progress.filter(p => p.progress.overseas.eligible)).toHaveLength(51);
    expect(calls).toBe(18400);
    // Captured by running the unchanged e63b622c factory with the same seed/date.
    expect(createHash('sha256').update(JSON.stringify(teams)).digest('hex'))
      .toBe('8594364a6628db06c9757bcdd47da4d33c21db025dd0abe73bf9ca72cc913811');
    expect(createHash('sha256').update(JSON.stringify(progress)).digest('hex'))
      .toBe('fd3b6b1e66e068b0d13d2ef7151a1b165375ec02bb582d17174cb8aef469e136');
  } finally { random.mockRestore(); clock.mockRestore(); }
});

it('initializes every actual roster player once and matches 2025 official rights after exercises', () => {
  const players = createInitialTeams().flatMap(t => [...t.players, ...t.farm]);
  expect(players).toHaveLength(1059);
  for (const p of players) {
    expect(p.eligibility.version).toBe(2); expect(p.proStartYear).toBeGreaterThan(1900);
    expect(getFaProgress(p)).toMatchObject({ recorded: true, domestic: { eligible: expect.any(Boolean) }, overseas: { eligible: expect.any(Boolean) } });
    const facts = openingEligibilityFacts({ playerId: p.realPlayerId });
    const actual = getFaProgress(p);
    expect(actual.domestic.eligible, p.realPlayerId).toBe(Boolean(facts.qualified));
    expect(actual.overseas.eligible, p.realPlayerId).toBe(facts.qualified === 'overseas');
  }
  expect(OPENING_FA_FACTS.qualified).toHaveLength(104);
  expect(OPENING_FA_FACTS.filed2025).toHaveLength(8);
  const filed = players.filter(p => OPENING_FA_FACTS.filed2025.includes(p.realPlayerId));
  expect(filed).toHaveLength(8);
  for (const p of filed) expect(getFaProgress(p)).toMatchObject({ domestic: { eligible: false, remainingDays: 580 }, overseas: { eligible: false, remainingDays: 580 } });
});

it('preserves supplied local counters and first-pro year without applying a roster journal it does not cover', () => {
  const p = realBatterToPlayer({ playerId: 'local:123', name: 'local', birthDate: '1990-01-01', pos: '一塁手',
    entryType: '高卒', proStartYear: 2009, daysOnActiveRoster: 1080, serviceYears: 9, history: [], salary: 500,
    dataQuality: { serviceTime: 'provided' } }, TEAM_DEFS[0]);
  expect(p.proStartYear).toBe(2009);
  expect(p.eligibility.fa.days).toBe(1305);
  expect(getFaProgress(p)).toMatchObject({ domestic: { eligible: true }, overseas: { eligible: true } });
  expect(p.eligibility.birth.kind).toBe('game-history');
});

it('does not match by display name or change old saves from new opening facts', () => {
  expect(openingEligibilityFacts({ playerId: 'npb:absent', name: '坂本 勇人' }).qualified).toBeUndefined();
  const p = { id: 'old', realPlayerId: 'npb:51955114', age: 37, daysOnActiveRoster: 240, serviceYears: 2, entryType: '高卒' };
  const original = { saveId: 'same', year: 2028, gameDay: 22, teams: [{ id: 0, players: [p], farm: [{ ...p, id: 'farm' }], history: [p] }], faPool: [{ ...p, id: 'free' }] };
  const next = migrateEligibilityWorld(original);
  expect(next.teams[0].players[0].eligibility.fa.days).toBe(290);
  expect(next.teams[0].farm[0].eligibility).toBeTruthy(); expect(next.faPool[0].eligibility).toBeTruthy();
  expect(next.teams[0].history).toEqual(original.teams[0].history); expect(next.saveId).toBe('same');
  expect(getFaProgress(next.teams[0].players[0]).domestic.eligible).toBe(false);
  expect(migrateEligibilityWorld(JSON.parse(JSON.stringify(next)))).toEqual(next);
});

it('preserves legacy acquired rights before and after migration and recognizes positive in-game counters despite an unknown opening baseline', () => {
  const p = { id: 'legacy-held', age: 30, daysOnActiveRoster: 840 };
  const oldProgress = getFaProgress(p);
  const world = { year: 2026, gameDay: 1, teams: [{ players: [p], farm: [] }], faPool: [] };
  const migrated = migrateEligibilityWorld(world).teams[0].players[0];
  expect(getFaProgress(migrated).domestic.eligible).toBe(true);
  expect(getFaProgress(migrated)).toEqual(oldProgress);
  const accrued = initializePlayerEligibility({ id: 'old-real', age: 30, entryType: '高卒', daysOnActiveRoster: 240,
    dataQuality: { serviceTime: 'game-baseline-unknown' } });
  expect(accrued.eligibility.fa.days).toBe(290);
  expect(accrued.eligibility.fa.basis.method).toBe('legacy-120-to-145');
});

it('migrates a real base548 declaration→accepted NPB contract→joined save into the repeat cycle without changing history', () => {
  const original = structuredClone(legacyRecontract);
  expect(validateEconomySave(original)).toBe('annual');
  const next = migrateEligibilityWorld(original);
  const p = next.teams[0].farm.find(p => p.id === 0);
  expect(p.eligibility.fa.exerciseCount).toBe(1);
  expect(getFaProgress(p)).toMatchObject({ domestic: { eligible: false, remainingDays: 580 }, overseas: { eligible: false, remainingDays: 580 } });
  expect(next.contractEconomy).toEqual(original.contractEconomy);
  expect(validateEconomySave(next)).toBe('annual');
  expect(migrateEligibilityWorld(JSON.parse(JSON.stringify(next)))).toEqual(next);
});

it('restores a consumed legacy FA cycle recorded only in serviceYears and retains fractional progress', () => {
  const p = { id: 'legacy-returned', age: 31, entryType: '高卒', serviceYears: 9.5 };
  const h = { ...p, serviceYears: 9, exitYear: 2025, exitReason: 'FA宣言' };
  const original = { year: 2026, gameDay: 1, teams: [{ id: 0, players: [p], farm: [], history: [h] }], faPool: [] };
  const before = structuredClone(original), next = migrateEligibilityWorld(original), returned = next.teams[0].players[0];
  expect(returned.eligibility.fa).toMatchObject({ exerciseCount: 1, cycleStartDays: 1305, days: 1377.5 });
  expect(getFaProgress(returned)).toMatchObject({ days: 72.5, overseas: { eligible: false, remainingDays: 508 } });
  let accrued = returned;
  for (let year = 2026; year <= 2028; year++) for (let gameDay = 1; gameDay <= 143; gameDay++) accrued = accrueFaService(accrued, { year, gameDay });
  for (let gameDay = 1; gameDay <= 71; gameDay++) accrued = accrueFaService(accrued, { year: 2029, gameDay });
  expect(getFaProgress(accrued).overseas).toMatchObject({ eligible: false, remainingDays: 2 });
  accrued = accrueFaService(accrued, { year: 2029, gameDay: 72 });
  expect(getFaProgress(accrued).overseas).toMatchObject({ eligible: true, remainingDays: 0 });
  expect(next.teams[0].history).toEqual(before.teams[0].history);
  expect(original).toEqual(before);
  expect(migrateEligibilityWorld(JSON.parse(JSON.stringify(next)))).toEqual(next);
});

it('does not infer a recontract for an unowned legacy market player or an unrelated release', () => {
  const p = { id: 'legacy-market', age: 31, entryType: '高卒', serviceYears: 9 };
  for (const world of [
    { teams: [{ players: [], farm: [], history: [{ ...p, exitYear: 2025, exitReason: 'FA宣言' }] }], faPool: [p] },
    { teams: [{ players: [p], farm: [], history: [{ ...p, exitYear: 2025, exitReason: '戦力外' }] }], faPool: [] },
  ]) {
    const next = migrateEligibilityWorld({ ...world, year: 2026, gameDay: 1 });
    expect((next.faPool[0] ?? next.teams[0].players[0]).eligibility.fa.exerciseCount).toBe(0);
  }
});

it('preserves an outstanding base548 certificate and reconstructs the prior cycle when a pending old acquisition joins', () => {
  const market = migrateEligibilityWorld(structuredClone(legacyPendingMarket));
  expect(market.faPool[0].eligibility.fa.exerciseCount).toBe(1);
  expect(getFaProgress(market.faPool[0]).domestic.eligible).toBe(true);
  expect(market.contractEconomy).toEqual(legacyPendingMarket.contractEconomy);
  const pending = migrateEligibilityWorld(structuredClone(legacyPendingRecontract));
  expect(pending.contractEconomy).toEqual(legacyPendingRecontract.contractEconomy);
  // This frozen second-declaration fixture already carries the 2035 tail.
  const advanced = structuredClone(pending); advanced.year = 2028; advanced.gameDay = 1;
  advanced.contractEconomy.clock = { season: 2028, phase: 'preseason', date: '2028-02-01', offseasonTurn: 0 };
  advanced.contractEconomy.cycle.season = 2028; advanced.contractEconomy.engine.spending.budgetSeason = 2028;
  const spring = fromAnnualState(advanced, toAnnualState(advanced));
  const r = reduceEconomyCommand(spring, envelope(spring, { id: 'second-join', type: 'join-fa', proposalId: 'second-bid' }));
  expect(r.ok, r.error).toBe(true);
  const p = r.world.teams[0].farm.find(p => p.id === 0);
  expect(p.eligibility.fa.exerciseCount).toBe(2);
  expect(getFaProgress(p).overseas.remainingDays).toBe(580);
  expect(validateEconomySave(r.world)).toBe('annual');
});

it('credits real shared game updates at most once without counting farm players or backfilling absences', () => {
  let active = initializePlayerEligibility({ id: 1, age: 24, entryType: '高卒', daysOnActiveRoster: 0 });
  let team = { id: 0, players: [active], farm: [{ ...active, id: 2 }], budget: 100, wins: 0, losses: 0, popularity: 50 };
  const rules = { tickPositionTraining: p => p, tickInjuries: p => p, checkForInjuries: () => [] };
  const result = { score: { my: 0, opp: 0 }, log: [] };
  for (let gameDay = 1; gameDay <= 143; gameDay++) {
    team = applyRegularSeasonTeamUpdate(team, result, { year: 2026, gameDay, isFirstTeam: true, isHomeTeam: true }, rules).team;
  }
  expect(getFaProgress(team.players[0]).days).toBe(145); expect(getFaProgress(team.farm[0]).days).toBe(0);
  team = applyRegularSeasonTeamUpdate(team, result, { year: 2026, gameDay: 143, isFirstTeam: true, isHomeTeam: true }, rules).team;
  expect(getFaProgress(team.players[0]).days).toBe(145);
  expect(getFaThreshold(team.players[0])).toEqual({ domestic: 1160, overseas: 1305 });
});

it('preserves a consumed certificate across JSON and applies the repeat threshold', () => {
  const p = initializePlayerEligibility({ id: 5, age: 31, entryType: '大卒', draftYear: 2016, daysOnActiveRoster: 1080 });
  const next = exerciseFaRights(p, 2026);
  expect(getFaProgress(JSON.parse(JSON.stringify(next)))).toEqual(getFaProgress(next));
  expect(getFaProgress(next).overseas.remainingDays).toBe(580);
});

it('fixes a fictional first contract year once and consumes human declaration-and-stay rights', () => {
  const team = { id: 0, name: 'club', budget: 100000, players: [], farm: [] };
  const rookie = { id: 'rookie', age: 22, prospectType: '大卒', salary: 420 };
  const signed = applyDraftAcquisitions([team], [rookie], { rookie: 0 }, 2028);
  const p = signed.teams[0].farm[0];
  expect(p.proStartYear).toBe(2028); expect(p.eligibility.entry).toMatchObject({ type: '大卒', draftYear: 2028 });
  expect(initializePlayerEligibility(p, { year: 2032 }).proStartYear).toBe(2028);
  const free = initializePlayerEligibility({ id: 3, age: 30, entryType: '高卒', daysOnActiveRoster: 1080,
    isFA: true, marketEntryReason: '国内FA宣言', faEnteredYear: 2026, faOriginTeamId: 0 });
  const joined = addMarketSigning(team, free, 500, 1, 2026, 'offseason').players[0];
  expect(getFaProgress(joined).overseas.remainingDays).toBe(580);
  expect(joined.proStartYear).toBe(free.proStartYear);
});
