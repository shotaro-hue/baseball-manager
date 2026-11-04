import { describe, expect, it } from 'vitest';
import { inSeasonWorld, playableClub, atDate, releaseCommand } from './fixtures/inSeasonDepartures';
import { freezeEconomy, renewalEnvelope } from './fixtures/economyWorld';
import { toAnnualState, fromAnnualState, quoteEconomyCommand, reduceEconomyCommand } from '../contractEconomy';
import { applyAnnualTransaction } from '../annualTransactions';
import { contractLiabilityRows, contractEmploymentAt, applyContractLedgerAction } from '../contractLedger';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { createSeasonContract } from '../seasonContract';
import { renewalRequest, reduceRenewalRequest } from '../renewalDecisions';
import { prepareEconomyMigration } from '../economyMigration';
import { createInitialTeams } from '../bootstrapTeams';

const spending = w => w.contractEconomy.engine.spending;
const apply = (w, c = releaseCommand(w)) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const reject = (w, c = releaseCommand(w)) => {
  const before = structuredClone(w); freezeEconomy(w);
  expect(quoteEconomyCommand(w, c).ok).toBe(false);
  const r = reduceEconomyCommand(w, c); expect(r.ok).toBe(false); expect(r.world).toBe(w); expect(w).toEqual(before);
};

describe('A1-2c-2b in-season release', () => {
  it('atomically removes ID zero, retains debt and existing placements, and replays after reload', () => {
    const w = freezeEconomy(inSeasonWorld()), before = structuredClone(w), c = releaseCommand(w, 0, { id: 0 });
    expect(quoteEconomyCommand(w, c).ok).toBe(true); expect(w).toEqual(before);
    const next = apply(w, c), d = next.contractEconomy.engine.offseasonDepartures[0];
    expect(d).toMatchObject({ phase: 'season', gameDay: 100, notifiedDate: '2026-07-16', effectiveDate: '2026-07-16',
      endAction: { type: 'end', reason: 'release', settlement: 'retain' } });
    expect(next.teams[0].players).toEqual(w.teams[0].players.filter(p => p.id !== 0));
    expect(next.teams[0].farm).toEqual(w.teams[0].farm);
    expect(next.teams[0].lineup).toEqual([1]); expect(next.teams[0].fieldingDh).toEqual({ 1: '捕手' });
    expect(next.faPool).toHaveLength(1); expect(next.faPool[0]).toMatchObject({ id: 0, registrationCooldownDays: 0, isFA: true,
      isWaiverReleased: true, marketEntry: { kind: 'released' } });
    expect(next.contractEconomy.engine).not.toHaveProperty('gameDay');
    expect(toAnnualState(next).gameDay).toBe(100);
    const ledger = spending(next).ledger;
    expect(contractEmploymentAt(ledger, '2026-07-16').some(e => e.contract.playerId === 0)).toBe(false);
    expect(contractLiabilityRows(ledger).filter(r => r.playerId === 0)).toEqual([
      expect.objectContaining({ season: 2026, kind: 'salary', amountManYen: 548 }),
      expect.objectContaining({ season: 2026, kind: 'guarantee', amountManYen: 452 }),
      expect.objectContaining({ season: 2027, kind: 'guarantee', amountManYen: 1000 }),
      expect.objectContaining({ season: 2028, kind: 'guarantee', amountManYen: 1000 }),
    ]);
    expect(validateEconomySave(next)).toBe('annual'); expect(economyOverwriteIssue(w, next)).toBeNull();
    const loaded = JSON.parse(JSON.stringify(next)); expect(reduceEconomyCommand(loaded, c).world).toBe(loaded);
    const later = atDate(loaded, '2026-07-17', 101); later.teams[0].farm[0].injuryDaysLeft = 10;
    const replay = reduceEconomyCommand(later, c); expect(replay.ok, replay.error).toBe(true); expect(replay.world).toBe(later);
  });

  it.each(['2026-07-31', '2026-08-01'])('permits safe release on %s', date => {
    const w = inSeasonWorld({ date }); expect(validateEconomySave(apply(w))).toBe('annual');
  });

  it.each([
    ['catcher', t => { t.players[0].pos = '捕手'; t.players[1].pos = '一塁手'; }],
    ['pitcher', t => { t.players[0].isPitcher = true; t.players[0].pos = '投手'; t.farm = t.farm.filter(p => !p.isPitcher); }],
    ['batter', t => { t.farm = t.farm.filter(p => p.id !== 18); }],
    ['injury', t => { t.farm[0].injuryDaysLeft = 1; }],
    ['ikusei catcher', t => { t.players[1].isIkusei = true; t.farm.find(p => p.id === 10).isIkusei = true; }],
    ['recall cooldown', t => { t.farm.filter(p => !p.isPitcher).forEach(p => { p.registrationCooldownDays = 3; }); }],
    ['bad pitching history', t => { t.farm.find(p => p.isPitcher).recentPitchingDays = {}; }],
  ])('rejects %s shortages or corrupt evidence without mutation', (_, edit) => {
    const t = playableClub(); edit(t); reject(inSeasonWorld({ teams: [t, playableClub(1)] }));
  });

  it.each([{ reason: 'expiry' }, { teamId: 1 }, { contractId: 'wrong' }, { gameDay: 1 }, { date: '2026-01-01' }])(
    'rejects invalid command %j', overrides => { const w = inSeasonWorld(); reject(w, releaseCommand(w, 0, overrides)); },
  );

  it('requires an actual round, rejects duplicate persisted round and protects the projection', () => {
    const w = inSeasonWorld(), c = releaseCommand(w), state = toAnnualState(w);
    const { gameDay, ...missing } = state;
    expect(applyAnnualTransaction(missing, c.transaction).ok).toBe(false);
    expect(() => fromAnnualState(w, { ...state, gameDay: 99 })).toThrow();
    const duplicate = structuredClone(w); duplicate.contractEconomy.engine.gameDay = 100;
    expect(() => toAnnualState(duplicate)).toThrow();
    const badDate = structuredClone(w); badDate.contractEconomy.clock.date = '2026-07-15'; reject(badDate, c);
  });

  it('does not replay a direct engine state whose current round is missing', () => {
    const w = apply(inSeasonWorld()), state = toAnnualState(w); delete state.gameDay;
    expect(applyAnnualTransaction(state, releaseCommand(inSeasonWorld()).transaction).ok).toBe(false);
  });

  it('preserves a released farm player existing cooldown and does not add a new wait', () => {
    const w = inSeasonWorld(); const p = w.teams[0].farm.find(p => p.id === 18); p.registrationCooldownDays = 3;
    const next = apply(w, releaseCommand(w, p.id)); expect(next.faPool[0].registrationCooldownDays).toBe(3);
  });

  it('cancels engine renewal holds while preserving the estimate and restoring the vacancy floor', () => {
    const w = inSeasonWorld({ years: 1 }), s = spending(w), contractId = w.teams[0].players[0].contractId;
    s.renewalPlans = [{ teamId: 0, playerId: 0, sourceContractId: contractId, season: 2027, amountManYen: 1200, basis: 'recorded-plan' }];
    w.contractEconomy.engine.rosterRequirements.forEach(r => { if (r.teamId === 0) r.requiredControlledCount = 21; });
    const canonical = fromAnnualState(w, toAnnualState(w)), offered = apply(canonical, renewalEnvelope(canonical));
    const next = apply(offered);
    expect(spending(next).reservations).toHaveLength(0);
    expect(spending(next).resolvedReservations[0].resolution).toBe('cancelled');
    expect(spending(next).renewalPlans).toEqual(s.renewalPlans);
    expect(next.teams[0].budget).toBe(canonical.teams[0].budget - 420);
  });

  it('rejects release with an accepted future renewal', () => {
    const w = inSeasonWorld({ years: 1 }), offer = renewalEnvelope(w), offered = apply(w, offer);
    const accepted = apply(offered, { ...offer, baseRevision: 1,
      transaction: { id: 'accept', type: 'accept-renewal', proposalId: 'renewal', contractId: offer.transaction.contractId } });
    reject(accepted);
  });

  it('rejects a human pending renewal without leaving its decision/mail inconsistent', () => {
    const w = inSeasonWorld({ years: 1 });
    const offer = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 2000, years: 1 }));
    expect(offer.ok, offer.error).toBe(true); expect(validateEconomySave(offer.world)).toBe('annual');
    reject(offer.world);
  });

  it('preserves past costs, transfers and raises while ending current employment', () => {
    let w = inSeasonWorld(), ledger = spending(w).ledger, record = ledger.records[0];
    record.contract = createSeasonContract({ ...record.contract, signedSeason: 2025, termYears: 4 });
    record.effectiveDate = '2025-02-01';
    ledger = applyContractLedgerAction(ledger, { id: 'transfer', type: 'transfer', teamId: 0, toTeamId: 1,
      contractId: record.contract.contractId, effectiveDate: '2026-07-01' });
    ledger = applyContractLedgerAction(ledger, { id: 'raise', type: 'increase', teamId: 1,
      contractId: record.contract.contractId, effectiveDate: '2026-07-10', annualSalaryManYen: 2000 });
    spending(w).ledger = ledger;
    const player = w.teams[0].players.shift(); w.teams[1].players.push(player); w.teams.reverse();
    w = fromAnnualState(w, toAnnualState(w));
    const before = contractLiabilityRows(ledger), next = apply(w, releaseCommand(w, 0)), after = contractLiabilityRows(spending(next).ledger);
    expect(after.filter(r => r.season < 2026)).toEqual(before.filter(r => r.season < 2026));
    expect(after.filter(r => r.playerId === 0 && r.season === 2026)).toEqual([
      expect.objectContaining({ teamId: 0, kind: 'salary', amountManYen: 500 }),
      expect.objectContaining({ teamId: 1, kind: 'salary', amountManYen: 68 }),
      expect.objectContaining({ teamId: 1, kind: 'guarantee', amountManYen: 903 }),
    ]);
    expect(spending(next).ledger.records[0].contract).toEqual(record.contract);
    expect(validateEconomySave(next)).toBe('annual');
  });

  it('retains unknown guarantees from the real migration producer without inventing signed terms', () => {
    const teams = [playableClub(), playableClub(1), ...Array.from({ length: 10 }, (_, i) => ({ id: i + 2, players: [], farm: [] }))];
    let w = inSeasonWorld({ teams }); const source = structuredClone(w.teams);
    for (const t of source) for (const p of [...t.players, ...t.farm]) {
      p.contractSignedYear = 2024; p.contractYearsLeft = p.id === 0 ? 4 : 2; p.contractYears = p.contractYearsLeft;
    }
    const migration = prepareEconomyMigration({ ...w, phase: 'season', teams: source, year: 2025, contractEconomy: undefined },
      { season: 2025, stage: 'unstarted-offseason', legacyOffseasonStarted: false });
    expect(migration.ok, JSON.stringify(migration.issues)).toBe(true);
    spending(w).ledger = migration.candidate.ledger;
    delete w.contractEconomy.engine.faExerciseOrigins; // Migration replaces the native fixture source.
    w = fromAnnualState(w, toAnnualState(w));
    const original = structuredClone(spending(w).ledger.records[0].contract), next = apply(w);
    expect(original.guaranteeStatus).toBe('unknown'); expect(original).not.toHaveProperty('signedSeason');
    expect(spending(next).ledger.records[0].contract).toEqual(original);
    expect(contractLiabilityRows(spending(next).ledger).filter(r => r.playerId === 0 && r.season > 2026))
      .toEqual([2027, 2028].map(season => expect.objectContaining({ season, kind: 'guarantee', amountManYen: 1000 })));
    expect(validateEconomySave(next)).toBe('annual');
  });

  it('allows formal re-acquisition on July 31, preserves evidence through winter, and blocks August acceptance', () => {
    const original = inSeasonWorld({ date: '2026-07-31' }), originalCommand = releaseCommand(original);
    let w = apply(original);
    const command = transaction => ({ saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: w.contractEconomy.revision, transaction });
    const proposal = { id: 'rehire', type: 'sign', teamId: 0, offeredDate: '2026-07-31', effectiveDate: '2026-07-31',
      marketEntry: w.faPool[0].marketEntry, contract: createSeasonContract({ contractId: 'new-employment', playerId: 0,
        signedSeason: 2026, agreementPhase: 'season', purpose: 'acquisition', termYears: 1,
        annualSalaryManYen: 800, guaranteed: true, registrationType: 'controlled' }) };
    w = apply(w, command({ id: 'bid', type: 'offer-fa', proposal }));
    const accept = command({ id: 'accept', type: 'accept-fa', proposalId: proposal.id });
    reject(atDate(w, '2026-08-01', 101), accept);
    w = apply(w, accept); expect(w.faPool).toEqual([]);
    expect(contractEmploymentAt(spending(w).ledger, '2026-07-31').find(e => e.contract.playerId === 0).teamId).toBe(0);
    expect(validateEconomySave(JSON.parse(JSON.stringify(w)))).toBe('annual');
    const newOffer = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 2000, years: 1 }));
    expect(newOffer.ok, newOffer.error).toBe(true);
    const replay = reduceEconomyCommand(newOffer.world, originalCommand);
    expect(replay.ok, replay.error).toBe(true); expect(replay.world).toBe(newOffer.world);
    w.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
    spending(w).budgetSeason = 2027;
    w = fromAnnualState(w, toAnnualState(w)); expect(validateEconomySave(w)).toBe('annual');
    expect(contractLiabilityRows(spending(w).ledger).filter(r => r.playerId === 0 && r.season > 2026))
      .toEqual([2027, 2028].map(season => expect.objectContaining({ teamId: 0, season, kind: 'guarantee', amountManYen: 1000 })));
  });

  it('handles current bundled new-game data and rejects a paired loss of both catcher alternatives', () => {
    const teams = createInitialTeams(), w = inSeasonWorld({ teams }), c = releaseCommand(w);
    expect(validateEconomySave(apply(freezeEconomy(w), c))).toBe('annual');
    const blocked = structuredClone(w);
    for (const p of [...blocked.teams[0].players, ...blocked.teams[0].farm]) if (!p.isPitcher) {
      if (p.pos === '捕手') p.pos = '一塁手'; p.positions = { ...p.positions, 捕手: 0 };
    }
    reject(blocked, c);
  }, 20000);

  it.each([
    ['orphan', w => { w.contractEconomy.engine.transactions = []; }],
    ['missing record', w => { w.contractEconomy.engine.offseasonDepartures = []; }],
    ['paired history removal', w => {
      w.contractEconomy.engine.offseasonDepartures = [];
      w.contractEconomy.engine.transactions = [];
    }],
    ['changed snapshot', w => { w.contractEconomy.engine.offseasonDepartures[0].player.age++; }],
    ['missing end', w => { spending(w).ledger.records[0].changes = []; }],
    ['changed phase', w => { delete w.contractEconomy.engine.offseasonDepartures[0].phase; }],
    ['changed round', w => { w.contractEconomy.engine.offseasonDepartures[0].gameDay = 0; }],
    ['missing listing', w => { w.faPool = []; }],
  ])('rejects %s after cold reload', (_, edit) => {
    const w = JSON.parse(JSON.stringify(apply(inSeasonWorld()))); edit(w); const before = structuredClone(w); freezeEconomy(w);
    expect(() => validateEconomySave(w)).toThrow(); expect(w).toEqual(before);
  });
});
