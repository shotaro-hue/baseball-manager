import { describe, expect, it } from 'vitest';
import { inSeasonWorld, playableClub, atDate, releaseCommand, nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { freezeEconomy } from './fixtures/economyWorld';
import { reduceEconomyCommand, toAnnualState } from '../contractEconomy';
import { validateEconomySave } from '../economyPersistence';
import { createSeasonContract } from '../seasonContract';
import { contractLiabilityRows } from '../contractLedger';
import { createInitialTeams } from '../bootstrapTeams';
import { generateSeasonSchedule } from '../scheduleGen';
import { economyClockFor } from '../economyCalendar';

function releasedWorld() {
  const teams = [playableClub(), playableClub(1)];
  teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 3; }));
  const world = inSeasonWorld({ teams });
  world.schedule[99] = { gameNo: 99, date: { month: 7, day: 15 } };
  const result = reduceEconomyCommand(world, releaseCommand(world));
  expect(result.ok, result.error).toBe(true);
  return atDate(result.world, '2026-07-17', 101);
}
const departure = world => world.contractEconomy.engine.offseasonDepartures[0];
const receipt = world => world.contractEconomy.engine.transactions.find(r => r.id === departure(world).id).departure;

describe('in-season departure calendar evidence', () => {
  it('accepts an actual notification round after JSON reload and later progression', () => {
    const world = freezeEconomy(JSON.parse(JSON.stringify(releasedWorld())));
    expect(validateEconomySave(world)).toBe('annual');
    expect(departure(world)).toMatchObject({ gameDay: 100, notifiedDate: '2026-07-16' });
  });

  it.each([false, true])('rejects a changed round (receipt also changed=%s)', paired => {
    const world = releasedWorld();
    departure(world).gameDay = 99;
    if (paired) receipt(world).gameDay = 99;
    const loaded = freezeEconomy(JSON.parse(JSON.stringify(world))), before = JSON.stringify(loaded);
    expect(() => validateEconomySave(loaded)).toThrow();
    expect(() => toAnnualState(loaded)).toThrow();
    const replay = reduceEconomyCommand(loaded, { saveId: loaded.saveId, epoch: loaded.contractEconomy.epoch,
      baseRevision: 0, transaction: JSON.parse(loaded.contractEconomy.engine.transactions[0].signature) });
    expect(replay.ok).toBe(false); expect(replay.world).toBe(loaded);
    expect(JSON.stringify(loaded)).toBe(before);
  });

  it.each([0, -1, 1.5, 144, null])('rejects invalid paired gameDay %s', round => {
    const world = releasedWorld();
    departure(world).gameDay = receipt(world).gameDay = round;
    expect(() => validateEconomySave(world)).toThrow();
  });

  it.each([
    ['missing entry', w => { delete w.schedule[100]; }],
    ['missing schedule', w => { delete w.schedule; }],
    ['wrong date', w => { w.schedule[100].date.day = 15; }],
    ['missing date', w => { delete w.schedule[100].date; }],
    ['invalid date', w => { w.schedule[100].date = { month: 2, day: 30 }; }],
    ['wrong game number', w => { w.schedule[100].gameNo = 99; }],
    ['All-Star slot', w => { w.schedule[100].isAllStar = true; }],
  ])('rejects %s in the calendar even during winter', (_, edit) => {
    const world = releasedWorld();
    world.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
    world.contractEconomy.engine.spending.budgetSeason = 2027;
    edit(world);
    expect(() => toAnnualState(freezeEconomy(world))).toThrow();
  });

  it('uses the archived calendar after rollover and preserves historical liabilities', () => {
    const original = releasedWorld(), rows = contractLiabilityRows(original.contractEconomy.engine.spending.ledger);
    const world = JSON.parse(JSON.stringify(nextSeasonForDepartureTest(original)));
    expect(world.schedule).toEqual([]);
    expect(validateEconomySave(freezeEconomy(world))).toBe('annual');
    expect(contractLiabilityRows(world.contractEconomy.engine.spending.ledger)).toEqual(rows);
    const altered = structuredClone(world);
    departure(altered).gameDay = receipt(altered).gameDay = 99;
    expect(() => validateEconomySave(altered)).toThrow('退団通知日と公式戦日程が一致しません。');
  });

  it.each([undefined, null, [], [{ year: 2025, schedule: [] }], [{ year: 2026 }], [{ year: 2026, schedule: null }]])(
    'retains legitimate older histories when their calendar is unavailable (%j)', archive => {
      const world = nextSeasonForDepartureTest(releasedWorld());
      world.scheduleArchive = archive;
      expect(validateEconomySave(JSON.parse(JSON.stringify(world)))).toBe('annual');
    },
  );

  it.each([
    ['malformed archive', w => { w.scheduleArchive = {}; }],
    ['missing historical entry', w => { w.scheduleArchive[0].schedule = []; }],
    ['malformed historical schedule', w => { w.scheduleArchive[0].schedule = {}; }],
    ['wrong historical date', w => { w.scheduleArchive[0].schedule[100].date.day = 15; }],
    ['conflicting duplicate year', w => {
      const copy = structuredClone(w.scheduleArchive[0]); copy.schedule[100].date.day = 15;
      w.scheduleArchive.push(copy);
    }],
  ])('rejects %s when past calendar evidence is provided', (_, edit) => {
    const world = nextSeasonForDepartureTest(releasedWorld()); edit(world);
    expect(() => validateEconomySave(freezeEconomy(world))).toThrow();
  });

  it.each([false, true])('preserves the departure through legal rehire (later day=%s)', later => {
    let world = releasedWorld();
    if (!later) world = atDate(world, '2026-07-16', 100);
    const before = structuredClone(departure(world)), ledger = world.contractEconomy.engine.spending.ledger;
    const debt = contractLiabilityRows(ledger).filter(r => r.contractId === before.sourceContractId);
    const proposal = { id: 'rehire', type: 'sign', teamId: 0, offeredDate: world.contractEconomy.clock.date,
      effectiveDate: world.contractEconomy.clock.date, marketEntry: world.faPool[0].marketEntry,
      contract: createSeasonContract({ contractId: 'rehire-contract', playerId: 0, signedSeason: 2026,
        agreementPhase: 'season', purpose: 'acquisition', termYears: 1, annualSalaryManYen: 800,
        guaranteed: true, registrationType: 'controlled' }) };
    for (const transaction of [{ id: 'bid', type: 'offer-fa', proposal }, { id: 'accept', type: 'accept-fa', proposalId: 'rehire' }]) {
      const result = reduceEconomyCommand(world, { saveId: world.saveId, epoch: world.contractEconomy.epoch,
        baseRevision: world.contractEconomy.revision, transaction });
      expect(result.ok, result.error).toBe(true); world = result.world;
    }
    expect(validateEconomySave(JSON.parse(JSON.stringify(world)))).toBe('annual');
    expect(departure(world)).toEqual(before);
    expect(contractLiabilityRows(world.contractEconomy.engine.spending.ledger)
      .filter(r => r.contractId === before.sourceContractId)).toEqual(debt);
  });

  it('validates actual new-game rosters against the generated season schedule', () => {
    const world = inSeasonWorld({ teams: createInitialTeams() });
    world.schedule = generateSeasonSchedule(world.year, world.teams);
    world.contractEconomy.clock = economyClockFor({ season: world.year, phase: 'season', schedule: world.schedule, gameDay: world.gameDay });
    const result = reduceEconomyCommand(freezeEconomy(world), releaseCommand(world));
    expect(result.ok, result.error).toBe(true);
    const saved = JSON.parse(JSON.stringify(result.world));
    expect(validateEconomySave(saved)).toBe('annual');
    departure(saved).gameDay = receipt(saved).gameDay = 99;
    expect(() => validateEconomySave(saved)).toThrow('退団通知日と公式戦日程が一致しません。');
  });
});
