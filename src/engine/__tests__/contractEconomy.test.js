import { describe, expect, it, vi } from 'vitest';
import { ANNUAL_ECONOMY_RELEASE_ENABLED, contractEconomyMode, createAnnualNewGameWorld,
  toAnnualState, fromAnnualState, quoteEconomyCommand, reduceEconomyCommand } from '../contractEconomy';
import { economyClockFor } from '../economyCalendar';
import { contractEmploymentAt } from '../contractLedger';
import { createInitialTeams } from '../bootstrapTeams';
import { applyAnnualTransaction } from '../annualTransactions';
import { economyPolicy, economyFixture, renewalEnvelope, freezeEconomy } from './fixtures/economyWorld';

describe('A1-1a single contract economy world (release disabled)', () => {
  it('quotes without changing the world, generating IDs or consuming randomness', () => {
    const world = freezeEconomy(economyFixture()), command = freezeEconomy(renewalEnvelope(world));
    const snapshot = JSON.stringify(world), random = vi.spyOn(Math, 'random').mockImplementation(() => { throw new Error('quote drew randomness'); });
    try {
      const quote = quoteEconomyCommand(world, command);
      expect(quote.ok, quote.error).toBe(true); expect(quote.world).toBeUndefined();
      expect(quote.rows.find(r => r.teamId === 0 && r.season === 2027)).toMatchObject({ reservedManYen: 1600, salaryManYen: 0 });
      expect(quote.effects).toEqual({ transactionId: 0, nextRevision: 1 });
      expect(JSON.stringify(world)).toBe(snapshot); expect(random).not.toHaveBeenCalled();
    } finally { random.mockRestore(); }
  });

  it('keeps current salary separate from accepted future terms and replays once through JSON reload', () => {
    const world = economyFixture(), command = renewalEnvelope(world), offered = reduceEconomyCommand(freezeEconomy(world), command);
    expect(offered.ok, offered.error).toBe(true); expect(offered.world.contractEconomy.revision).toBe(1);
    const accepted = reduceEconomyCommand(offered.world, { ...command, baseRevision: 1,
      transaction: { id: 'answer', type: 'accept-renewal', proposalId: 'renewal', contractId: command.transaction.contractId } });
    expect(accepted.ok, accepted.error).toBe(true);
    expect(accepted.world.teams[0].players[0]).toMatchObject({ id: 0, salary: 1000, contractYearsLeft: 1, contractYears: 1 });
    expect(contractEmploymentAt(accepted.world.contractEconomy.engine.spending.ledger, '2027-02-01')[0])
      .toMatchObject({ annualSalaryManYen: 1600, contract: { endSeason: 2029 } });
    const reloaded = JSON.parse(JSON.stringify(accepted.world)), replay = reduceEconomyCommand(reloaded, command);
    expect(replay.ok, replay.error).toBe(true); expect(replay.replayed).toBe(true); expect(replay.world).toBe(reloaded);
    expect(replay.world.contractEconomy.revision).toBe(2);
    const changed = reduceEconomyCommand(reloaded, renewalEnvelope(reloaded, { salary: 1800 }));
    expect(changed.ok).toBe(false); expect(changed.world).toBe(reloaded);
  });

  it.each([
    ['stale revision', c => { c.baseRevision = 7; }],
    ['missing revision', c => { delete c.baseRevision; }],
    ['wrong epoch', c => { c.epoch = 'old-epoch'; }],
    ['wrong save', c => { c.saveId = 'other-save'; }],
    ['unknown fields', c => { c.extra = true; }],
    ['non-guaranteed terms', c => { c.transaction.proposal.contract.guaranteed = false; }],
  ])('rejects %s without changing the input reference or content', (_, edit) => {
    const world = freezeEconomy(economyFixture()), snapshot = JSON.stringify(world), command = renewalEnvelope(world); edit(command);
    expect(quoteEconomyCommand(world, command).ok).toBe(false);
    const result = reduceEconomyCommand(world, command);
    expect(result.ok).toBe(false); expect(result.world).toBe(world); expect(JSON.stringify(world)).toBe(snapshot);
  });

  it('rejects numeric/string receipt collisions but accepts the typed ID zero', () => {
    const world = economyFixture(), command = renewalEnvelope(world), first = reduceEconomyCommand(world, command);
    expect(first.ok, first.error).toBe(true);
    const alias = renewalEnvelope(first.world, { id: '0' }), result = reduceEconomyCommand(first.world, alias);
    expect(result.ok).toBe(false); expect(result.world).toBe(first.world);
    expect(first.world.contractEconomy.engine.transactions).toMatchObject([{ id: 0 }]);
  });

  it.each(['0', 0])('rejects contract ID reuse (%s) across distinct pending offers before either can be accepted', conflictingId => {
    const world = economyFixture(), first = renewalEnvelope(world);
    first.transaction.proposal.contract.contractId = 0;
    const offered = reduceEconomyCommand(world, first); expect(offered.ok, offered.error).toBe(true);
    const other = renewalEnvelope(offered.world, { id: 'other-offer' });
    other.transaction.contractId = world.teams[1].players[0].contractId;
    other.transaction.proposal = { ...other.transaction.proposal, id: 'other-proposal', teamId: 1,
      contract: { ...other.transaction.proposal.contract, contractId: conflictingId, playerId: 'b' } };
    const rejected = reduceEconomyCommand(offered.world, other);
    expect(quoteEconomyCommand(offered.world, other).ok).toBe(false);
    expect(rejected.ok).toBe(false); expect(rejected.world).toBe(offered.world);
  });

  it('revalidates current budget after a quote instead of applying a previously accepted quote', () => {
    const world = economyFixture(), command = renewalEnvelope(world);
    expect(quoteEconomyCommand(world, command).ok).toBe(true);
    const latest = structuredClone(world); latest.contractEconomy.engine.spending.authorizations.find(a => a.teamId === 0 && a.season === 2029).approvedManYen = 1500;
    const result = reduceEconomyCommand(freezeEconomy(latest), command);
    expect(result.ok).toBe(false); expect(result.world).toBe(latest); expect(result.error).toMatch(/余力/);
  });

  it('does not reuse a cancelled contract identity for a different player or promise', () => {
    const world = economyFixture(), first = renewalEnvelope(world);
    const offered = reduceEconomyCommand(world, first);
    const cancelled = reduceEconomyCommand(offered.world, { ...first, baseRevision: 1,
      transaction: { id: 'cancel', type: 'cancel-renewal', proposalId: 'renewal' } });
    expect(cancelled.ok, cancelled.error).toBe(true);
    const other = renewalEnvelope(cancelled.world, { id: 'new-offer' });
    other.transaction.contractId = world.teams[1].players[0].contractId;
    other.transaction.proposal = { ...other.transaction.proposal, id: 'new-proposal', teamId: 1,
      contract: { ...other.transaction.proposal.contract, playerId: 'b' } };
    const result = reduceEconomyCommand(cancelled.world, other);
    expect(quoteEconomyCommand(cancelled.world, other).ok).toBe(false);
    expect(result.ok).toBe(false); expect(result.world).toBe(cancelled.world);
  });

  it('adapts one roster/market and roundtrips without storing a second draft or team snapshot', () => {
    const world = freezeEconomy(economyFixture()), state = toAnnualState(world);
    expect(state.version).toBe(2); expect(state.teams).toBe(world.teams); expect(state.faPool).toBe(world.faPool);
    const next = fromAnnualState(world, state);
    expect(toAnnualState(next)).toEqual(state); expect(next.mailbox).toBe(world.mailbox);
    expect(next.contractEconomy.engine).not.toHaveProperty('teams'); expect(next.contractEconomy.engine).not.toHaveProperty('faPool');
    expect(next.contractEconomy.engine).not.toHaveProperty('draftContext');
    expect(next.teams[0].budget).toBe(49000); expect(next.teams[0].players[0].salary).toBe(1000);
  });

  it('projects a draft refusal back into the existing offseason plan', () => {
    const world = economyFixture();
    world.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
    world.contractEconomy.engine.spending.budgetSeason = 2027;
    world.offseasonPlan = { year: 2026, draftResult: { pool: [{ id: 'rookie', name: '新人', salary: 500, _drafted: true, _r1winner: 0 }], drafted: {} }, marker: 'preserved' };
    const command = { saveId: world.saveId, epoch: world.contractEconomy.epoch, baseRevision: 0,
      transaction: { id: 'decline', type: 'decline-rookie', teamId: 0, playerId: 'rookie' } };
    const next = reduceEconomyCommand(freezeEconomy(world), command);
    expect(next.ok, next.error).toBe(true); expect(next.world.offseasonPlan.draftResult.drafted.rookie).toBe('refused');
    expect(next.world.offseasonPlan.marker).toBe('preserved'); expect(world.offseasonPlan.draftResult.drafted).toEqual({});
  });

  it.each([
    ['unknown schema', w => { w.contractEconomy.schemaVersion = 2; }],
    ['unknown mode', w => { w.contractEconomy.mode = 'future'; }],
    ['missing engine', w => { delete w.contractEconomy.engine; }],
    ['missing decisions', w => { delete w.contractEconomy.decisions; }],
    ['missing offseason plan', w => { delete w.offseasonPlan; }],
    ['unknown random version', w => { w.contractEconomy.randomRoot.algorithmVersion = 2; }],
    ['negative revision', w => { w.contractEconomy.revision = -1; }],
    ['year mismatch', w => { w.year = 2027; }],
    ['invalid date', w => { w.contractEconomy.clock.date = '2026-02-30'; }],
    ['missing schedule', w => { w.schedule = null; }],
    ['schedule date mismatch', w => { w.schedule[1].date.day = 17; }],
    ['duplicate team snapshot', w => { w.contractEconomy.engine.teams = w.teams; }],
    ['non-guaranteed ledger', w => { w.contractEconomy.engine.spending.ledger.records[0].contract.guaranteed = false; }],
  ])('rejects malformed annual world: %s, preserving it for recovery', (_, edit) => {
    const world = economyFixture(); edit(world); const snapshot = JSON.stringify(world), result = reduceEconomyCommand(freezeEconomy(world), renewalEnvelope(economyFixture()));
    expect(result.ok).toBe(false); expect(result.world).toBe(world); expect(JSON.stringify(world)).toBe(snapshot);
  });

  it('does not treat unknown or incomplete annual metadata as a legacy game', () => {
    expect(ANNUAL_ECONOMY_RELEASE_ENABLED).toBe(false); expect(contractEconomyMode({})).toBe('legacy');
    expect(contractEconomyMode({ contractEconomy: { schemaVersion: 1, mode: 'legacy' } })).toBe('legacy');
    expect(() => contractEconomyMode({ contractEconomy: { mode: 'future' } })).toThrow();
    expect(() => contractEconomyMode({ contractEconomy: { mode: 'annual' } })).toThrow();
    const world = {}; expect(reduceEconomyCommand(world, {}).world).toBe(world);
  });
});

describe('native initial conditions and civil economy clock', () => {
  it('constructs one native contract for each of 780 valid fresh players without changing seed terms', () => {
    // Deliberate valid native seeds, not a repair of legacy initial salaries.
    const teams = Array.from({ length: 12 }, (_, id) => ({ id, players: Array.from({ length: 30 }, (_, i) =>
      ({ id: `${id}-active-${i}`, salary: 1000, contractYearsLeft: 3 })), farm: Array.from({ length: 35 }, (_, i) =>
      ({ id: `${id}-farm-${i}`, salary: 420, contractYearsLeft: 1 })) })), before = structuredClone(teams);
    const world = createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'bootstrap', season: 2026,
      policy: economyPolicy(teams, 2026, 1000000), randomRoot: { algorithmVersion: 1, seed: 'bootstrap' } });
    const records = world.contractEconomy.engine.spending.ledger.records;
    expect(records).toHaveLength(780); expect(new Set(records.map(r => r.contract.playerId)).size).toBe(780);
    for (const team of teams) for (const player of [...team.players, ...team.farm]) {
      const record = records.find(r => r.contract.playerId === player.id);
      expect(record).toMatchObject({ initialTeamId: team.id, effectiveDate: '2026-02-01',
        contract: { guaranteed: true, annualSalaryManYen: player.salary, termYears: player.contractYearsLeft } });
    }
    expect(teams).toEqual(before);
  });
  it('rejects the current legacy bootstrap below native salary minimums instead of silently raising or reclassifying it', () => {
    const teams = createInitialTeams(), before = structuredClone(teams);
    expect(teams.flatMap(t => [...t.players, ...t.farm]).some(p => !p.育成 && !p.isIkusei && p.salary < 420)).toBe(true);
    expect(() => createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'bootstrap', season: 2026,
      policy: economyPolicy(teams, 2026, 1000000), randomRoot: { algorithmVersion: 1, seed: 'bootstrap' } })).toThrow();
    expect(teams).toEqual(before);
  });
  it('rejects non-guaranteed new terms even when the shared v2 engine is called directly', () => {
    const world = economyFixture(), state = toAnnualState(world), command = renewalEnvelope(world, { guaranteed: false }).transaction;
    const result = applyAnnualTransaction(state, command);
    expect(result.ok).toBe(false); expect(result.state).toBe(state);
  });
  it('starts every active/farm contract on February 1 using seed salary and remaining term, with explicit policies', () => {
    const teams = [{ id: 0, budget: 1, players: [{ id: 0, salary: 1000, contractYearsLeft: 3, contractYears: 7 }],
      farm: [{ id: 'dev', salary: 240, contractYearsLeft: 1, isIkusei: true }] }];
    const params = { teams: freezeEconomy(teams), faPool: [{ id: 'free', isForeign: true }], myId: 0, saveId: 0, season: 2026,
      policy: economyPolicy(teams), randomRoot: { algorithmVersion: 1, seed: 'seed' } };
    const world = createAnnualNewGameWorld(params), records = world.contractEconomy.engine.spending.ledger.records;
    expect(world.contractEconomy.clock).toEqual({ season: 2026, phase: 'preseason', date: '2026-02-01', offseasonTurn: 0 });
    expect(records).toHaveLength(2); expect(records.every(r => r.effectiveDate === '2026-02-01' && r.contract.guaranteed)).toBe(true);
    expect(records[0].contract).toMatchObject({ playerId: 0, startSeason: 2026, endSeason: 2028, termYears: 3, annualSalaryManYen: 1000 });
    expect(world.teams[0].players[0]).toMatchObject({ contractYears: 3, contractYearsLeft: 3, salary: 1000 });
    expect(world.teams[0].farm[0]).toMatchObject({ 育成: true, isIkusei: true });
    expect(world.faPool[0].marketEntry).toMatchObject({ kind: 'released', enteredDate: '2026-02-01' });
    expect(world.faPool[0].marketEntry).not.toHaveProperty('originTeamId'); expect(teams[0].budget).toBe(1);
    expect(createAnnualNewGameWorld(params)).toEqual(world);
  });
  it.each([undefined, 0, -1, 1.5, 8])('rejects invalid initial remaining years %s without clamping or inventing terms', years => {
    const teams = [{ id: 0, players: [{ id: 0, salary: 1000, contractYearsLeft: years }], farm: [] }];
    expect(() => createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'save', season: 2026,
      policy: economyPolicy(teams), randomRoot: { algorithmVersion: 1, seed: 'seed' } })).toThrow();
  });
  it('requires explicit budget rows through season+7 and rejects missing/zero seed salaries without a fallback', () => {
    for (const salary of [undefined, 0]) {
      const teams = [{ id: 0, players: [{ id: 0, salary, contractYearsLeft: 1 }], farm: [] }];
      expect(() => createAnnualNewGameWorld({ teams, faPool: [], myId: 0, saveId: 'save', season: 2026,
        policy: economyPolicy(teams), randomRoot: { algorithmVersion: 1, seed: 'seed' } })).toThrow();
    }
    const world = economyFixture(), policy = economyPolicy(world.teams); policy.authorizations.pop();
    expect(() => createAnnualNewGameWorld({ teams: world.teams, faPool: [], myId: 0, saveId: 'save', season: 2026,
      policy, randomRoot: { algorithmVersion: 1, seed: 'seed' } })).toThrow();
  });
  it('uses actual schedule dates and an explicit offseason turn instead of round-based date guesses', () => {
    expect(economyClockFor({ season: 2028, phase: 'season', schedule: [null, { date: { month: 2, day: 29 } }], gameDay: 1 }))
      .toEqual({ season: 2028, phase: 'season', date: '2028-02-29', offseasonTurn: 0 });
    expect(economyClockFor({ season: 2026, phase: 'offseason', offseasonTurn: 3 }))
      .toEqual({ season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 3 });
    expect(() => economyClockFor({ season: 2026, phase: 'season', gameDay: 100, schedule: [] })).toThrow();
    expect(() => economyClockFor({ season: 2026, phase: 'season', gameDay: 1, schedule: [null, { date: { month: 2, day: 29 } }] })).toThrow();
    expect(() => economyClockFor({ season: 2026, phase: 'offseason' })).toThrow();
  });
});
