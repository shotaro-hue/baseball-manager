import { applyAnnualTransaction } from '../annualTransactions';
import { winter, departureCommand as command } from './fixtures/winterDepartures';
import { prepareEconomyMigration } from '../economyMigration';
import { createSeasonContract } from '../seasonContract';
import { describe, expect, it } from 'vitest';
import { economyFixture, freezeEconomy, renewalEnvelope } from './fixtures/economyWorld';
import { toAnnualState, fromAnnualState, reduceEconomyCommand, quoteEconomyCommand } from '../contractEconomy';
import { contractLiabilityRows, contractEmploymentAt } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';

const apply = (w, c = command(w)) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const spending = w => toAnnualState(w).spending;

describe('A1-2c-1 winter departures', () => {
  it('expires naturally without a ledger end, resolves the renewal plan and cleans placement once', () => {
    const w = freezeEconomy(winter()), before = structuredClone(w), c = command(w);
    expect(quoteEconomyCommand(w, c).ok).toBe(true);
    expect(w).toEqual(before);
    const next = apply(w, c), s = spending(next);
    expect(s.ledger).toEqual(spending(w).ledger);
    expect(s.renewalPlans).toEqual(spending(w).renewalPlans);
    expect(quoteAnnualSpendingPlan(s).find(r => r.teamId === 0 && r.season === 2027))
      .toMatchObject({ renewalPlanReserveManYen: 0, minimumRosterReserveManYen: 420, remainingManYen: 49580 });
    expect(next.teams[0]).toMatchObject({ players: [], lineup: [], rotation: [], fieldingDh: {}, pitchingPattern: { closerId: null, middleOrder: [] } });
    expect(next.faPool.find(p => p.id === 0)).toMatchObject({ stats: { hr: 20 }, contractYearsLeft: 0,
      marketEntry: { kind: 'released', originTeamId: 0, enteredDate: '2026-12-01' } });
    expect(next.contractEconomy.engine.offseasonDepartures).toHaveLength(1);
    expect(next.teams[0].history).toHaveLength(1);
    expect(validateEconomySave(next)).toBe('annual');
    expect(economyOverwriteIssue(w, next)).toBeNull();
    const loaded = JSON.parse(JSON.stringify(next)), replay = reduceEconomyCommand(loaded, c);
    expect(replay.ok, replay.error).toBe(true); expect(replay.replayed).toBe(true); expect(replay.world).toBe(loaded);
  });

  it('retains all guaranteed future liability while releasing a continuing contract on next February 1', () => {
    const w = freezeEconomy(winter(3)), before = contractLiabilityRows(spending(w).ledger), next = apply(w, command(w, 'release'));
    const ledger = spending(next).ledger, after = contractLiabilityRows(ledger);
    expect(after.filter(r => r.season === 2026)).toEqual(before.filter(r => r.season === 2026));
    expect(after.filter(r => r.playerId === 0 && r.season > 2026)).toEqual([
      expect.objectContaining({ season: 2027, kind: 'guarantee', amountManYen: 1000 }),
      expect.objectContaining({ season: 2028, kind: 'guarantee', amountManYen: 1000 }),
    ]);
    expect(ledger.records[0].changes).toEqual([expect.objectContaining({ type: 'end', reason: 'release', settlement: 'retain', effectiveDate: '2027-02-01' })]);
    expect(contractEmploymentAt(ledger, '2026-11-30').some(e => e.contract.playerId === 0)).toBe(true);
    expect(contractEmploymentAt(ledger, '2027-02-01').some(e => e.contract.playerId === 0)).toBe(false);
    expect(() => toAnnualState(next)).not.toThrow();
    expect(validateEconomySave(next)).toBe('annual');
  });

  it.each(['expiry', 'release'])('cancels pending renewal holds on %s without erasing proposal history', reason => {
    const w = winter(), offer = renewalEnvelope(w); offer.transaction.proposal.contract.agreementPhase = 'offseason';
    const offered = apply(w, offer), next = apply(offered, command(offered, reason));
    expect(spending(next).reservations).toHaveLength(0);
    expect(spending(next).resolvedReservations).toHaveLength(1);
    expect(quoteAnnualSpendingPlan(spending(next)).find(r => r.teamId === 0 && r.season === 2027)).toMatchObject({ reservedManYen: 0, renewalPlanReserveManYen: 0 });
  });

  it('rejects departure after an accepted future renewal, preserving both contracts', () => {
    const w = winter(), offer = renewalEnvelope(w); offer.transaction.proposal.contract.agreementPhase = 'offseason';
    const offered = apply(w, offer), accepted = apply(offered, { ...offer, baseRevision: 1,
      transaction: { id: 'accept', type: 'accept-renewal', proposalId: 'renewal', contractId: offer.transaction.contractId } });
    const result = reduceEconomyCommand(accepted, command(accepted));
    expect(result.ok).toBe(false); expect(result.world).toBe(accepted);
  });

  it.each([
    ['orphan', w => { w.contractEconomy.engine.transactions = []; }],
    ['missing departure', w => { w.contractEconomy.engine.offseasonDepartures = []; }],
    ['receipt changes', w => { w.contractEconomy.engine.transactions.at(-1).signature = '{}'; }],
    ['snapshot changes', w => { w.contractEconomy.engine.offseasonDepartures[0].player.stats.hr = 99; }],
    ['missing action', w => { w.contractEconomy.engine.spending.ledger.records[0].changes = []; }],
    ['wrong action date', w => { w.contractEconomy.engine.spending.ledger.records[0].changes[0].effectiveDate = '2027-03-01'; }],
    ['duplicate', w => { w.contractEconomy.engine.offseasonDepartures.push(w.contractEconomy.engine.offseasonDepartures[0]); }],
  ])('rejects %s at reload without changing the malformed save', (_, edit) => {
    const w = structuredClone(apply(winter(3), command(winter(3), 'release'))); edit(w);
    const snapshot = structuredClone(w); freezeEconomy(w);
    expect(() => validateEconomySave(w)).toThrow(); expect(w).toEqual(snapshot);
  });

  it.each([
    ['wrong owner', { teamId: 1 }], ['wrong contract', { contractId: 'other' }],
    ['continued expiry', { reason: 'expiry' }], ['invented FA', { reason: 'domestic-fa' }],
    ['waiver override', { settlement: 'waive' }],
  ])('rejects %s with identical input', (_, overrides) => {
    const w = freezeEconomy(winter(3)), r = reduceEconomyCommand(w, command(w, 'release', overrides));
    expect(r.ok).toBe(false); expect(r.world).toBe(w);
  });

  it('keeps in-season departures disabled until playability checks are connected', () => {
    const w = freezeEconomy(economyFixture()), r = reduceEconomyCommand(w, command(w, 'release'));
    expect(r.ok).toBe(false); expect(r.world).toBe(w);
  });
});

it('preserves unknown legacy guarantees and never invents signature history', () => {
  let w = winter(3);
  const teams = structuredClone(w.teams);
  for (const t of teams) for (const p of t.players) p.contractSignedYear = 2025;
  while (teams.length < 12) teams.push({ id: teams.length, players: [], farm: [], budget: 0 });
  const migration = prepareEconomyMigration({ ...w, teams, phase: 'season', contractEconomy: undefined },
    { season: 2026, stage: 'unstarted-offseason', legacyOffseasonStarted: false });
  expect(migration.ok, JSON.stringify(migration.issues)).toBe(true);
  w.contractEconomy.engine.spending.ledger = migration.candidate.ledger;
  delete w.contractEconomy.engine.faExerciseOrigins; // Real migration has no native-game origin.
  w = fromAnnualState(w, toAnnualState(w));
  const original = structuredClone(spending(w).ledger.records[0].contract);
  const next = apply(w, command(w, 'release')), ledger = spending(next).ledger;
  expect(ledger.records[0].contract).toEqual(original);
  expect(original.guaranteeStatus).toBe('unknown'); expect(original).not.toHaveProperty('signedSeason');
  expect(contractLiabilityRows(ledger).filter(r => r.playerId === 0)).toEqual([
    expect.objectContaining({ season: 2027, kind: 'guarantee', amountManYen: 1000 }),
    expect.objectContaining({ season: 2028, kind: 'guarantee', amountManYen: 1000 }),
  ]);
  expect(validateEconomySave(next)).toBe('annual');
});

it.each([1, 3])('allows a released player to use the existing formal market acquisition route (old years=%s)', years => {
  let w = apply(winter(years), command(winter(years), 'release'));
  const listing = w.faPool.find(p => p.id === 0);
  const proposal = { id: 'market-bid', type: 'sign', teamId: 1, offeredDate: '2026-12-01',
    effectiveDate: '2027-02-01', marketEntry: listing.marketEntry,
    contract: createSeasonContract({ contractId: 'market-contract', playerId: 0, signedSeason: 2026,
      agreementPhase: 'offseason', purpose: 'acquisition', termYears: 1, annualSalaryManYen: 800,
      guaranteed: true, registrationType: 'controlled' }) };
  const wrap = transaction => ({ saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: w.contractEconomy.revision, transaction });
  w = apply(w, wrap({ id: 'market-offer', type: 'offer-fa', proposal }));
  w = apply(w, wrap({ id: 'market-accept', type: 'accept-fa', proposalId: proposal.id }));
  expect(w.faPool.some(p => p.id === 0)).toBe(false);
  expect(w.contractEconomy.engine.acquisitions).toHaveLength(1);
  expect(w.contractEconomy.engine.spending.faCompensations ?? []).toHaveLength(0);
  expect(contractEmploymentAt(spending(w).ledger, '2027-02-01').find(e => e.contract.playerId === 0)).toMatchObject({ teamId: 1, annualSalaryManYen: 800 });
  expect(validateEconomySave(w)).toBe('annual');
});

it('keeps an unchanged old contract and prevents historical departure erasure on later saves', () => {
  const w = apply(winter(3), command(winter(3), 'release')), dropped = structuredClone(w);
  dropped.contractEconomy.revision++;
  dropped.contractEconomy.engine.transactions = [];
  dropped.contractEconomy.engine.offseasonDepartures = [];
  expect(economyOverwriteIssue(w, dropped)).toBe('economy_history_conflict');
});

it('shared engine supports a November 30 notice without losing current-year expenses', () => {
  const w = winter(3), state = toAnnualState(w); state.date = '2026-11-30';
  const result = applyAnnualTransaction(state, command(w, 'release').transaction);
  expect(result.ok, result.error).toBe(true);
  expect(contractLiabilityRows(result.state.spending.ledger).filter(r => r.season === 2026))
    .toEqual(contractLiabilityRows(state.spending.ledger).filter(r => r.season === 2026));
});

it('permits a second winter expiry after a prior guaranteed release and formal re-acquisition', () => {
  const w = winter(3), other = w.contractEconomy.engine.spending.ledger.records[1].contract;
  other.termYears = 3; other.endSeason = 2028;
  let state = toAnnualState(apply(w, command(w, 'release')));
  const proposal = { id: 'rebid', type: 'sign', teamId: 1, offeredDate: '2026-12-01', effectiveDate: '2027-02-01',
    marketEntry: state.faPool.find(p => p.id === 0).marketEntry,
    contract: createSeasonContract({ contractId: 'second-employment', playerId: 0, signedSeason: 2026,
      agreementPhase: 'offseason', purpose: 'acquisition', termYears: 1, annualSalaryManYen: 800,
      guaranteed: true, registrationType: 'controlled' }) };
  const transact = c => { const r = applyAnnualTransaction(state, c); expect(r.ok, r.error).toBe(true); state = r.state; };
  transact({ id: 'rebid-offer', type: 'offer-fa', proposal });
  transact({ id: 'rebid-accept', type: 'accept-fa', proposalId: 'rebid' });
  state = { ...state, season: 2027, phase: 'preseason', date: '2027-02-01' };
  transact({ id: 'rejoin', type: 'join-fa', proposalId: 'rebid' });
  state = { ...state, phase: 'offseason', date: '2027-12-01', spending: { ...state.spending, budgetSeason: 2028 } };
  transact({ id: 'second-expiry', type: 'enter-market', teamId: 1, playerId: 0, contractId: 'second-employment', reason: 'expiry' });
  expect(state.offseasonDepartures).toHaveLength(2);
  expect(state.faPool.find(p => p.id === 0).marketEntry.originTeamId).toBe(1);
  expect(contractLiabilityRows(state.spending.ledger).filter(r => r.playerId === 0 && r.season === 2028))
    .toEqual([expect.objectContaining({ teamId: 0, amountManYen: 1000, kind: 'guarantee' })]);
});

it.each([
  ['missing listing', w => { w.faPool = w.faPool.filter(p => p.id !== 0); }],
  ['missing market evidence', w => { delete w.faPool.find(p => p.id === 0).marketEntry; }],
  ['changed origin', w => { w.faPool.find(p => p.id === 0).marketEntry.originTeamId = 1; }],
  ['changed listing ID', w => { w.faPool.find(p => p.id === 0).marketEntry.id = 'forged'; }],
  ['missing history', w => { w.teams[0].history = []; }],
  ['changed history', w => { w.teams[0].history[0].stats.hr = 99; }],
  ['shortened source contract', w => { const c = w.contractEconomy.engine.spending.ledger.records[0].contract; c.termYears = 2; c.endSeason = 2027; }],
])('rejects %s on cold validation without depending on a previous root', (_, edit) => {
  const next = JSON.parse(JSON.stringify(apply(winter(3), command(winter(3), 'release'))));
  edit(next); freezeEconomy(next);
  expect(() => toAnnualState(next)).toThrow();
});

it('does not publish a retiring player as an acquirable released candidate', () => {
  const w = winter(); w.teams[0].players[0]._retireNow = true;
  const result = reduceEconomyCommand(freezeEconomy(w), command(w));
  expect(result.ok).toBe(false); expect(result.world).toBe(w);
});

it.each([
  ['already joined', { isFA: false }],
  ['retired', { isRetired: true }],
  ['retiring', { _retireNow: true }],
  ['departure reason', { departureReason: 'expiry' }],
  ['source contract', { contractId: 'forged' }],
  ['release evidence', { isWaiverReleased: false }],
  ['entry reason', { marketEntryReason: '国内FA' }],
  ['entry year', { faEnteredYear: 2025 }],
  ['origin team', { faOriginTeamId: 1 }],
])('rejects a released listing with changed %s during cold save validation', (_, changes) => {
  const w = JSON.parse(JSON.stringify(apply(winter(3), command(winter(3), 'release'))));
  Object.assign(w.faPool.find(p => p.id === 0), changes);
  const before = structuredClone(w); freezeEconomy(w);
  expect(() => validateEconomySave(w)).toThrow();
  expect(w).toEqual(before);
});

it('allows current market ability and statistics to change while retaining the departure snapshot', () => {
  const w = apply(winter(3), command(winter(3), 'release'));
  const history = structuredClone(w.contractEconomy.engine.offseasonDepartures);
  const p = w.faPool.find(p => p.id === 0);
  Object.assign(p, { age: 27, power: 75, stats: { hr: 23 }, careerStats: { hr: 123 } });
  expect(validateEconomySave(JSON.parse(JSON.stringify(w)))).toBe('annual');
  expect(w.contractEconomy.engine.offseasonDepartures).toEqual(history);
});
