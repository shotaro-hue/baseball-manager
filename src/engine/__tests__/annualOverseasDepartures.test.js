import { describe, expect, it } from 'vitest';
import { overseasMarket, overseasDeparture } from './fixtures/overseasDepartures';
import { faWinter, declaration, envelope } from './fixtures/faDeclarations';
import { freezeEconomy } from './fixtures/economyWorld';
import { reduceEconomyCommand, quoteEconomyCommand, toAnnualState, fromAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { contractLiabilityRows } from '../contractLedger';
import { createSeasonContract } from '../seasonContract';
import { createInitialTeams } from '../bootstrapTeams';
import { acquisitionRequest, reduceAcquisitionRequest } from '../acquisitionDecisions';
import { applyAnnualTransaction } from '../annualTransactions';

const e = w => w.contractEconomy.engine;
const apply = (w, c = overseasDeparture(w)) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const reject = (w, c) => {
  const before = structuredClone(w); freezeEconomy(w);
  expect(quoteEconomyCommand(w, c).ok).toBe(false);
  const r = reduceEconomyCommand(w, c); expect(r.ok).toBe(false); expect(r.world).toBe(w); expect(w).toEqual(before);
};
const offer = w => envelope(w, { id: 'offer', type: 'offer-fa', proposal: { id: 'bid', type: 'sign', teamId: 1,
  offeredDate: '2026-12-01', effectiveDate: '2027-02-01', marketEntry: w.faPool[0].marketEntry,
  contract: createSeasonContract({ contractId: 'npb-next', playerId: 0, signedSeason: 2026, agreementPhase: 'offseason',
    purpose: 'acquisition', termYears: 1, annualSalaryManYen: 12000, guaranteed: true, registrationType: 'controlled' }) } });

describe('A1-2c-4a overseas FA departure', () => {
  it('removes ID zero from the NPB market while preserving all contract costs and declaration evidence', () => {
    const w = freezeEconomy(overseasMarket()), before = structuredClone(w), c = overseasDeparture(w, { id: 0 });
    expect(quoteEconomyCommand(w, c).ok).toBe(true); expect(w).toEqual(before);
    const next = apply(w, c), d = e(next).overseasDepartures[0];
    expect(d).toMatchObject({ id: 0, playerId: 0, teamId: 0, declarationId: 'declare-0', kind: 'overseas-fa',
      season: 2026, notifiedDate: '2026-12-01', effectiveDate: '2026-12-01' });
    expect(next.faPool).toEqual([]); expect(next.teams).toEqual(w.teams);
    expect(e(next).spending).toEqual(e(w).spending); expect(next.contractEconomy.incomeReceipts).toEqual(w.contractEconomy.incomeReceipts);
    expect(contractLiabilityRows(e(next).spending.ledger)).toEqual(contractLiabilityRows(e(w).spending.ledger));
    expect(e(next).faDeclarations).toEqual(e(w).faDeclarations); expect(e(next).faExerciseOrigins).toEqual(e(w).faExerciseOrigins);
    expect(e(next).transactions.at(-1).overseasDeparture).toEqual(d);
    expect(validateEconomySave(next)).toBe('annual'); expect(economyOverwriteIssue(w, next)).toBeNull();
  });

  it('replays after JSON reload and a later offseason turn, without a second exit', () => {
    const w = overseasMarket(), c = overseasDeparture(w), loaded = JSON.parse(JSON.stringify(apply(w, c)));
    loaded.contractEconomy.clock.offseasonTurn = 12;
    const r = reduceEconomyCommand(freezeEconomy(loaded), c);
    expect(r).toMatchObject({ ok: true, replayed: true }); expect(r.world).toBe(loaded);
    reject(structuredClone(loaded), { ...c, transaction: { ...c.transaction, id: 'second' }, baseRevision: loaded.contractEconomy.revision });
  });

  it.each([{ teamId: 1 }, { playerId: 1 }, { declarationId: 'wrong' }, { marketEntryId: 'wrong' },
    { date: '2026-11-30' }, { settlement: 'waive' }, { destination: 'MLB' }])('rejects foreign source or extra input %j', change => {
    const w = overseasMarket(); reject(w, overseasDeparture(w, change));
  });

  it('rejects domestic declarations and ordinary released listings', () => {
    const w = faWinter(), next = apply(w, declaration(w));
    reject(next, envelope(next, { id: 'exit', type: 'depart-overseas', teamId: 0, playerId: 0,
      declarationId: 'declare-0', marketEntryId: next.faPool[0].marketEntry.id }));
    const source = faWinter(), normal = apply(source, envelope(source, { id: 'release', type: 'enter-market', reason: 'expiry',
      teamId: 0, playerId: 0, contractId: source.teams[0].players[0].contractId }));
    reject(normal, envelope(normal, { id: 'exit', type: 'depart-overseas', teamId: 0, playerId: 0,
      declarationId: 'release', marketEntryId: normal.faPool[0].marketEntry.id }));
  });

  it('blocks outstanding NPB offers, permits cancellation, and blocks accepted NPB promises', () => {
    const w = overseasMarket(), pending = apply(w, offer(w));
    reject(structuredClone(pending), overseasDeparture(pending));
    const cancelled = apply(pending, envelope(pending, { id: 'cancel', type: 'cancel-fa', proposalId: 'bid' }));
    expect(validateEconomySave(apply(cancelled))).toBe('annual');
    const accepted = apply(structuredClone(pending), envelope(pending, { id: 'accept', type: 'accept-fa', proposalId: 'bid' }));
    reject(accepted, overseasDeparture(accepted));
  });

  it.each([
    ['record removal', w => { e(w).overseasDepartures = []; }],
    ['receipt removal', w => { e(w).transactions.pop(); }],
    ['paired removal', w => { e(w).overseasDepartures = []; e(w).transactions.pop(); }],
    ['orphan declaration', w => { e(w).faDeclarations = []; }],
    ['changed record', w => { e(w).overseasDepartures[0].playerId = 1; }],
    ['paired date change', w => { e(w).overseasDepartures[0].notifiedDate = e(w).transactions.at(-1).overseasDeparture.notifiedDate = '2026-11-30'; }],
    ['market restored', (w, old) => { w.faPool = old.faPool; }],
    ['non-array history', w => { e(w).overseasDepartures = {}; }],
  ])('rejects %s after cold reload', (_, edit) => {
    const old = overseasMarket(), bad = JSON.parse(JSON.stringify(apply(old))); edit(bad, old);
    expect(() => validateEconomySave(freezeEconomy(bad))).toThrow();
  });

  it('keeps an older v2 without the optional array readable', () => {
    const w = overseasMarket(); expect(e(w)).not.toHaveProperty('overseasDepartures');
    expect(validateEconomySave(JSON.parse(JSON.stringify(w)))).toBe('annual');
  });

  it('rejects explicit null history instead of treating corrupt input as an old missing field', () => {
    const w = overseasMarket(); e(w).overseasDepartures = null;
    expect(() => validateEconomySave(w)).toThrow();
  });

  it('rejects a human pending acquisition without changing its decision or hold', () => {
    const w = overseasMarket(), r = reduceAcquisitionRequest(w, acquisitionRequest(w, { type: 'offer', playerId: 0, salary: 12000, years: 1 }));
    expect(r.ok, r.error).toBe(true); expect(r.world.contractEconomy.decisions[0].status).toBe('pending');
    reject(r.world, overseasDeparture(r.world));
  });

  it('refuses legacy/v1 and a stale epoch without changing the source', () => {
    const w = overseasMarket(), c = overseasDeparture(w), legacy = structuredClone(w);
    delete legacy.contractEconomy; reject(legacy, c);
    reject(structuredClone(w), { ...c, epoch: 'stale' });
    const state = toAnnualState(w); expect(applyAnnualTransaction({ ...state, version: 1 }, c.transaction).ok).toBe(false);
  });

  it('proves qualification on actual new-game data before allowing an overseas exit', () => {
    const teams = createInitialTeams(); let player, club;
    for (const t of teams) {
      const peers = [...t.players, ...t.farm].filter(p => !p.isIkusei && !p.育成 && !p.isForeign);
      player = peers.find(p => p.contractYearsLeft === 1 && peers.filter(q => q.salary === p.salary).length === 1);
      if (player) { club = t; break; }
    }
    expect(player).toBeTruthy(); expect(player.daysOnActiveRoster).toBe(0);
    const w = faWinter({ teams: [club, ...teams.filter(t => t !== club)] }), c = declaration(w, player.id, { kind: 'overseas-fa' });
    reject(structuredClone(w), c);
    [...w.teams[0].players, ...w.teams[0].farm].find(p => p.id === player.id).daysOnActiveRoster = 1080;
    const market = apply(w, c), rows = contractLiabilityRows(e(market).spending.ledger);
    const exited = apply(market);
    expect(validateEconomySave(JSON.parse(JSON.stringify(exited)))).toBe('annual');
    expect(contractLiabilityRows(e(exited).spending.ledger)).toEqual(rows); expect(exited.faPool).toEqual([]);
  });

  it('keeps legitimate history and replay after the year changes', () => {
    let w = overseasMarket();
    // All other one-year contracts naturally expire; this focused transition
    // retains the declared player's source ledger and historical snapshots.
    w = apply(w);
    const c = overseasDeparture(w), d = structuredClone(e(w).overseasDepartures);
    w.year = 2027; w.contractEconomy.clock = { season: 2027, phase: 'preseason', date: '2027-02-01', offseasonTurn: 0 };
    w.contractEconomy.cycle.season = 2027; e(w).spending.budgetSeason = 2027;
    w.teams = w.teams.map(t => ({ ...t, players: t.players.filter(p => p.id === 'other'), farm: [] }));
    w = fromAnnualState(w, toAnnualState(w));
    expect(validateEconomySave(JSON.parse(JSON.stringify(w)))).toBe('annual');
    expect(e(w).overseasDepartures).toEqual(d); expect(reduceEconomyCommand(w, c).replayed).toBe(true);
  });
});
