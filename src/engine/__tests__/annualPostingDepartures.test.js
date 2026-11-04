import { describe, expect, it } from 'vitest';
import { postingWinter, postingCommand } from './fixtures/postingDepartures';
import { freezeEconomy, renewalEnvelope, economyPolicy } from './fixtures/economyWorld';
import { envelope, faWinter, declaration } from './fixtures/faDeclarations';
import { inSeasonWorld, playableClub, nextSeasonForDepartureTest, atDate } from './fixtures/inSeasonDepartures';
import { winter, reserve } from './fixtures/annualRetirements';
import { reduceEconomyCommand, quoteEconomyCommand, toAnnualState, fromAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { contractLiabilityRows, contractEmploymentAt, applyContractLedgerAction } from '../contractLedger';
import { prepareEconomyMigration } from '../economyMigration';
import { renewalRequest, reduceRenewalRequest } from '../renewalDecisions';
import { createInitialTeams } from '../bootstrapTeams';
import { createSeasonContract } from '../seasonContract';

const e = w => w.contractEconomy.engine;
const apply = (w, c = postingCommand(w)) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const denied = (w, c = postingCommand(w)) => {
  const before = structuredClone(w); freezeEconomy(w); expect(quoteEconomyCommand(w, c).ok).toBe(false);
  const r = reduceEconomyCommand(w, c); expect(r.ok).toBe(false); expect(r.world).toBe(w); expect(w).toEqual(before);
};

describe('A1-2c-4b posting departures', () => {
  it.each(['retain', 'waive'])('records ID zero and preserves elapsed costs with settlement %s', settlement => {
    const w = freezeEconomy(postingWinter()), rows = contractLiabilityRows(e(w).spending.ledger);
    const c = postingCommand(w, { id: 0, settlement, ...(settlement === 'waive' ? { terminationAgreementId: 0 } : {}) });
    expect(quoteEconomyCommand(w, c).ok).toBe(true);
    const next = apply(w, c), d = e(next).postingDepartures[0];
    expect(d).toMatchObject({ id: 0, player: { id: 0 }, reason: 'posting', settlement, notifiedDate: '2026-12-01', effectiveDate: '2027-02-01',
      endAction: { reason: 'posting', settlement, effectiveDate: '2027-02-01' } });
    expect(next.teams[0].players).toEqual(w.teams[0].players.filter(p => p.id !== 0)); expect(next.teams[0].farm).toEqual(w.teams[0].farm);
    expect(next.teams[0].lineup).toEqual([1]); expect(next.faPool).toEqual(w.faPool);
    expect(next.contractEconomy.incomeReceipts).toEqual(w.contractEconomy.incomeReceipts);
    expect(contractLiabilityRows(e(next).spending.ledger).filter(r => r.season <= 2026)).toEqual(rows.filter(r => r.season <= 2026));
    expect(contractLiabilityRows(e(next).spending.ledger).filter(r => r.playerId === 0 && r.season > 2026))
      .toEqual(settlement === 'retain' ? [2027, 2028].map(season => expect.objectContaining({ season, kind: 'guarantee', amountManYen: 1000 })) : []);
    expect(contractEmploymentAt(e(next).spending.ledger, '2026-11-30').some(x => x.contract.playerId === 0)).toBe(true);
    expect(contractEmploymentAt(e(next).spending.ledger, '2027-02-01').some(x => x.contract.playerId === 0)).toBe(false);
    if (settlement === 'waive') expect(d.endAction.terminationAgreement).toEqual({ id: 0, agreedDate: '2026-12-01' });
    expect(validateEconomySave(next)).toBe('annual'); expect(economyOverwriteIssue(w, next)).toBeNull();
    const loaded = JSON.parse(JSON.stringify(next)); loaded.contractEconomy.clock.offseasonTurn = 15;
    expect(reduceEconomyCommand(loaded, c)).toMatchObject({ ok: true, replayed: true, world: loaded });
  });

  it('preserves natural expiry without a redundant end or meaningless waiver', () => {
    const w = postingWinter({ years: 1 }), next = apply(w);
    expect(e(next).postingDepartures[0]).toMatchObject({ effectiveDate: '2026-12-01', endAction: null });
    expect(e(next).spending.ledger).toEqual(e(w).spending.ledger);
    denied(w, postingCommand(w, { settlement: 'waive', terminationAgreementId: 'unused' }));
  });

  it.each([{ teamId: 1 }, { playerId: 1 }, { contractId: 'wrong' }, { reason: 'release' }, { settlement: 'waive' },
    { terminationAgreementId: 'unused' }, { date: '2027-02-01' }, { settlement: 'waive', terminationAgreementId: '' }])('rejects input %j without mutation', extra => {
    const w = postingWinter(); denied(w, postingCommand(w, extra));
  });

  it('requires a recorded posting request and keeps older v2 without the optional array readable', () => {
    const w = postingWinter(); w.teams[0].players[0].postingRequested = false;
    expect(e(w)).not.toHaveProperty('postingDepartures'); expect(validateEconomySave(w)).toBe('annual'); denied(w);
  });

  it('rejects in-season, development and retirement-reserved requests', () => {
    const season = inSeasonWorld(); season.teams[0].players[0].postingRequested = true; denied(season);
    const club = playableClub(), player = club.players.shift();
    player.isIkusei = true; player.postingRequested = true; club.farm.push(player);
    const development = postingWinter({ teams: [club, playableClub(1)] }); denied(development, postingCommand(development, {}, 0, 0));
    const current = inSeasonWorld(); current.teams[0].players[0].postingRequested = true;
    const pending = apply(current, reserve(current)); denied(winter(pending));
  });

  it('removes a controlled farm player without changing remaining placements', () => {
    const w = postingWinter(); w.teams[0].farm.find(p => p.id === 10).postingRequested = true;
    const next = apply(w, postingCommand(w, {}, 0, 10));
    expect(next.teams[0].players).toEqual(w.teams[0].players);
    expect(next.teams[0].farm).toEqual(w.teams[0].farm.filter(p => p.id !== 10));
    expect(validateEconomySave(next)).toBe('annual');
  });

  it('rejects pending human renewals, permits cancellation, and rejects accepted future promises', () => {
    const w = postingWinter({ years: 1 });
    const r = reduceRenewalRequest(w, renewalRequest(w, { type: 'offer', playerId: 0, salary: 1200, years: 1 }));
    expect(r.ok, r.error).toBe(true); denied(structuredClone(r.world));
    const cancelled = reduceRenewalRequest(r.world, renewalRequest(r.world, { type: 'cancel', proposalId: r.world.contractEconomy.decisions[0].proposalId }));
    expect(cancelled.ok, cancelled.error).toBe(true); expect(validateEconomySave(apply(cancelled.world))).toBe('annual');
    const c = renewalEnvelope(w); c.transaction.proposal.contract = createSeasonContract({ ...c.transaction.proposal.contract, agreementPhase: 'offseason' });
    const held = apply(w, c); denied(structuredClone(held));
    const accepted = apply(held, envelope(held, { id: 'accept', type: 'accept-renewal', proposalId: 'renewal', contractId: c.transaction.contractId }));
    denied(accepted);
  });

  it.each(['retain', 'waive'])('preserves payer and accrued salary after a transfer and raise (%s)', settlement => {
    let w = inSeasonWorld(); w.teams[0].players[0].postingRequested = true;
    w = apply(w, envelope(w, { id: 'transfer', type: 'trade', fromId: 0, toId: 1, outgoingIds: [0], incomingIds: [], cashManYen: 0, mode: 'spend' }));
    const contractId = e(w).spending.ledger.records[0].contract.contractId;
    e(w).spending.ledger = applyContractLedgerAction(e(w).spending.ledger, { id: 'raise', type: 'increase', teamId: 1, contractId,
      effectiveDate: '2026-07-17', annualSalaryManYen: 1600 });
    w = atDate(w, '2026-07-17', 101);
    w = winter(fromAnnualState(w, toAnnualState(w)));
    const before = contractLiabilityRows(e(w).spending.ledger), next = apply(w, postingCommand(w,
      { settlement, ...(settlement === 'waive' ? { terminationAgreementId: 'transfer-agreement' } : {}) }, 1));
    const after = contractLiabilityRows(e(next).spending.ledger);
    expect(after.filter(r => r.season < 2027)).toEqual(before.filter(r => r.season < 2027));
    expect(after.filter(r => r.playerId === 0 && r.season >= 2027)).toEqual(settlement === 'retain'
      ? [2027, 2028].map(season => expect.objectContaining({ teamId: 1, season, kind: 'guarantee', amountManYen: 1600 })) : []);
  });

  it.each(['retain', 'waive'])('keeps genuine legacy unknown terms and uses only a new agreement (%s)', settlement => {
    const teams = [playableClub(), playableClub(1), ...Array.from({ length: 10 }, (_, i) => ({ id: i + 2, players: [], farm: [] }))];
    let w = postingWinter({ teams }); const observed = structuredClone(w.teams);
    for (const t of observed) for (const p of [...t.players, ...t.farm]) {
      p.contractSignedYear = 2024; p.contractYearsLeft = p.id === 0 ? 4 : 2; p.contractYears = p.contractYearsLeft;
    }
    const migration = prepareEconomyMigration({ ...w, phase: 'season', teams: observed, year: 2025, contractEconomy: undefined },
      { season: 2025, stage: 'unstarted-offseason', legacyOffseasonStarted: false });
    expect(migration.ok, JSON.stringify(migration.issues)).toBe(true);
    e(w).spending.ledger = migration.candidate.ledger; delete e(w).faExerciseOrigins; delete w.contractEconomy.faExerciseBirth;
    w = fromAnnualState(w, toAnnualState(w));
    const original = structuredClone(e(w).spending.ledger.records[0].contract), before = contractLiabilityRows(e(w).spending.ledger);
    const next = apply(w, postingCommand(w, { settlement, ...(settlement === 'waive' ? { terminationAgreementId: 'new-consent' } : {}) }));
    expect(original.guaranteeStatus).toBe('unknown'); expect(e(next).spending.ledger.records[0].contract).toEqual(original);
    expect(contractLiabilityRows(e(next).spending.ledger).filter(r => r.season < 2027)).toEqual(before.filter(r => r.season < 2027));
    expect(contractLiabilityRows(e(next).spending.ledger).filter(r => r.playerId === 0 && r.season >= 2027)).toEqual(settlement === 'retain'
      ? [2027, 2028].map(season => expect.objectContaining({ season, kind: 'guarantee', amountManYen: 1000 })) : []);
    expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
  });

  it('keeps empty-roster maintenance costs and rejects a retained exit that worsens a deficit', () => {
    let w = postingWinter();
    for (const list of [e(w).spending.authorizations, w.contractEconomy.budgetPolicies])
      list.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = 1000;
    w = fromAnnualState(w, toAnnualState(w)); denied(structuredClone(w));
    const next = apply(w, postingCommand(w, { settlement: 'waive', terminationAgreementId: 'new' }));
    expect(next.teams[0].budget).toBe(580); expect(next.contractEconomy.incomeReceipts).toEqual([]);
  });

  it('retains the posted salary snapshot when another player declares FA', () => {
    const w = faWinter({ years: 3 }); w.teams[0].players[0].postingRequested = true;
    const posted = apply(w), next = apply(posted, declaration(posted, 3));
    expect(e(next).faDeclarations[0].marketEntry.compensationRank).toBe('B');
    expect(validateEconomySave(next)).toBe('annual');
  });

  it('uses agreement IDs once across source contracts', () => {
    const team = playableClub(); team.players[1].contractYearsLeft = 3; team.players[1].postingRequested = true;
    const w = postingWinter({ teams: [team, playableClub(1)] });
    const first = apply(w, postingCommand(w, { settlement: 'waive', terminationAgreementId: 0 }));
    denied(structuredClone(first), postingCommand(first, { settlement: 'waive', terminationAgreementId: '0' }, 0, 1));
    expect(validateEconomySave(apply(first, postingCommand(first, { settlement: 'waive', terminationAgreementId: 'other' }, 0, 1)))).toBe('annual');
  });

  it('preserves historical source/receipt through the next year and replays without the departed player', () => {
    const teams = [playableClub(), playableClub(1)]; teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 3; }));
    const w = postingWinter({ teams }), c = postingCommand(w), posted = apply(w, c), next = nextSeasonForDepartureTest(posted);
    expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
    expect(e(next).postingDepartures).toEqual(e(posted).postingDepartures);
    expect(reduceEconomyCommand(next, c)).toMatchObject({ ok: true, replayed: true });
  });

  it('handles the real generated rosters with a recorded request, and rejects no request', () => {
    const teams = createInitialTeams(), player = teams[0].players[0], w = postingWinter({ teams, years: player.contractYearsLeft });
    const command = postingCommand(w, {}, w.teams[0].id, player.id);
    w.teams[0].players[0].postingRequested = false; denied(structuredClone(w), command);
    w.teams[0].players[0].postingRequested = true;
    expect(validateEconomySave(JSON.parse(JSON.stringify(apply(w, command))))).toBe('annual');
  });

  it('keeps the original FA history when a legitimately re-signed player later posts', () => {
    let w = faWinter();
    for (const r of e(w).spending.ledger.records) if (r.contract.playerId !== 0) { r.contract.termYears = 3; r.contract.endSeason = 2028; }
    w = fromAnnualState(w, toAnnualState(w)); w = apply(w, declaration(w));
    const proposal = { id: 'resign', type: 'sign', teamId: 0, offeredDate: '2026-12-01', effectiveDate: '2027-02-01', marketEntry: w.faPool[0].marketEntry,
      contract: createSeasonContract({ contractId: 'new-employment', playerId: 0, signedSeason: 2026, agreementPhase: 'offseason',
        purpose: 'acquisition', termYears: 1, annualSalaryManYen: 12000, guaranteed: true, registrationType: 'controlled' }) };
    w = apply(w, envelope(w, { id: 'offer', type: 'offer-fa', proposal }));
    w = apply(w, envelope(w, { id: 'accept', type: 'accept-fa', proposalId: proposal.id }));
    w = nextSeasonForDepartureTest(w); w = apply(w, envelope(w, { id: 'join', type: 'join-fa', proposalId: proposal.id }));
    w.teams[0].farm.find(p => p.id === 0).postingRequested = true;
    w.contractEconomy.clock = { season: 2027, phase: 'offseason', date: '2027-12-01', offseasonTurn: 0 }; e(w).spending.budgetSeason = 2028;
    const policy = economyPolicy(w.teams, 2028, 1000000), tail = rows => rows.filter(r => r.season === 2035);
    e(w).spending.authorizations.push(...tail(policy.authorizations)); e(w).rosterRequirements.push(...tail(policy.rosterRequirements));
    w.contractEconomy.budgetPolicies.push(...tail(policy.budgetPolicies)); w = fromAnnualState(w, toAnnualState(w));
    const next = apply(w);
    expect(next.teams[0].history.filter(p => p.faDeclarationId === 'declare-0')).toHaveLength(1);
    expect(e(next).postingDepartures[0].sourceContractId).toBe('new-employment');
    expect(validateEconomySave(JSON.parse(JSON.stringify(next)))).toBe('annual');
  });

  it.each([
    ['record removed', w => { e(w).postingDepartures = []; }],
    ['receipt removed', w => { e(w).transactions.pop(); }],
    ['paired record/receipt/history removal', w => { e(w).postingDepartures = []; e(w).transactions.pop(); w.teams[0].history = []; }],
    ['end action removed', w => { e(w).spending.ledger.records[0].changes = []; }],
    ['paired notice date changed', w => { e(w).postingDepartures[0].notifiedDate = e(w).transactions.at(-1).postingDeparture.notifiedDate = '2026-11-30'; }],
    ['unbacked waiver', w => { e(w).spending.ledger.records[0].changes[0].settlement = 'waive'; }],
  ])('rejects %s after cold load', (_, edit) => {
    const bad = JSON.parse(JSON.stringify(apply(postingWinter()))); edit(bad);
    expect(() => validateEconomySave(freezeEconomy(bad))).toThrow();
  });
});
