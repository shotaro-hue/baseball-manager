import { describe, expect, it } from 'vitest';
import * as seasonContract from '../seasonContract';
import { validateContractLedger, contractLiabilityRows, contractEmploymentAt, applyContractLedgerAction, isContractLedgerExtension } from '../contractLedger';
import { applyAnnualTransaction, projectAnnualState } from '../annualTransactions';
import { fixture, claim, protect, settle, spring, run, json, freeze } from './faPersonnelFixtures';

const boundary = { season: 2026, stage: 'unstarted-offseason', legacyOffseasonStarted: false };
const legacy = (extra = {}) => ({ id: 'old', name: 'old', pos: '一塁手', salary: 1000, contractYearsLeft: 3, ...extra });
const world = (p = legacy()) => ({ saveId: 'save', year: 2026, phase: 'season', offseasonPlan: null, mailbox: [],
  teams: Array.from({ length: 12 }, (_, id) => ({ id, budget: 12345, players: id === 0 ? [p] : [], farm: [] })), faPool: [] });
const opening = (extra = {}) => ({ kind: 'legacy-opening', openingId: 'opening-old', playerId: 'old', teamId: 0,
  observedSeason: 2026, observedDate: '2026-11-30', observedAnnualSalaryManYen: 1000, observedYearsLeft: 3,
  carriedFutureYears: 2, endSeason: 2028, registrationType: 'controlled', guaranteeStatus: 'unknown',
  sourceFields: { salary: 1000, contractYearsLeft: 3 }, migrationId: 'migration', ...extra });
const ledgerFor = c => ({ version: 2, closedThroughSeason: 2026, records: [{ contract: c, actionId: c.openingId,
  initialTeamId: c.teamId, effectiveDate: c.observedDate, changes: [] }] });
const migrate = async (w, b = boundary) => (await import('../economyMigration')).prepareEconomyMigration(w, b);
const migrated = async p => { const r = await migrate(world(p)); expect(r.ok, JSON.stringify(r.issues)).toBe(true); return r.candidate; };
const end = (extra = {}) => ({ id: 'release', type: 'end', contractId: 'opening-old', teamId: 0,
  effectiveDate: '2027-07-01', reason: 'release', settlement: 'retain', ...extra });

describe('legacy opening balances (no live migration)', () => {
  it('projects an opening without fabricating a native signature or past payroll', () => {
    const l = ledgerFor(opening()); expect(validateContractLedger(l)).toBe(true);
    expect(contractLiabilityRows(l).map(r => [r.season, r.amountManYen])).toEqual([[2027, 1000], [2028, 1000]]);
    expect(contractEmploymentAt(l, '2026-11-29')).toEqual([]);
    expect(contractEmploymentAt(l, '2026-11-30')[0].contract).not.toHaveProperty('signedSeason');
    expect(seasonContract.remainingEmploymentSeasons(opening(), 2027)).toBe(2);
    expect(seasonContract.remainingEmploymentSeasons(opening(), 2029)).toBe(0);
  });
  it('imports unknown guarantee, raw evidence and future balances without writing the input', async () => {
    const w = world(legacy({ contractIncentives: [{ kind: 'old-clause' }] })), before = json(w);
    const r = await migrate(freeze(w)); expect(r.ok, JSON.stringify(r.issues)).toBe(true);
    const c = r.candidate.ledger.records[0].contract;
    expect(c).toMatchObject({ guaranteeStatus: 'unknown', carriedFutureYears: 2, endSeason: 2028 });
    for (const key of ['signedSeason', 'termYears', 'guaranteed', 'agreementPhase']) expect(c).not.toHaveProperty(key);
    expect(c.sourceFields).not.toHaveProperty('contractSignedYear');
    expect(c.sourceFields.contractIncentives).toEqual([{ kind: 'old-clause' }]);
    expect(r.candidate.scope).toBe('contracts-only'); expect(r.candidate).not.toHaveProperty('contractEconomy');
    expect(w).toEqual(before); expect(await migrate(json(w))).toEqual(r);
  });
  it.each([[2026, 3, 2029], [2025, 2, 2028], [undefined, 2, 2028]])('preserves legacy signed=%s F=%i end=%i', async (signed, future, endSeason) => {
    const p = legacy(signed === undefined ? {} : { contractSignedYear: signed });
    const candidate = await migrated(p), c = candidate.ledger.records[0].contract;
    expect(c).toMatchObject({ carriedFutureYears: future, endSeason });
    expect(contractLiabilityRows(candidate.ledger)).toHaveLength(future);
  });
  it('keeps a native three-year contract at three years, and an expiring opening at zero future years', async () => {
    expect(seasonContract.createSeasonContract({ contractId: 'n', playerId: 'p', signedSeason: 2026,
      agreementPhase: 'preseason', purpose: 'acquisition', termYears: 3, annualSalaryManYen: 1000, guaranteed: true }).endSeason).toBe(2028);
    const { ledger } = await migrated(legacy({ contractYearsLeft: 1 }));
    expect(contractLiabilityRows(ledger)).toEqual([]); expect(contractEmploymentAt(ledger, '2026-11-30')).toHaveLength(1);
    expect(contractEmploymentAt(ledger, '2026-12-01')).toEqual([]);
  });
  it.each([['salary', undefined, 'missing'], ['salary', null, 'missing'], ['salary', 0, 'minimum'],
    ['salary', -1, 'invalid'], ['salary', 1.5, 'invalid'], ['contractYearsLeft', undefined, 'missing'],
    ['contractYearsLeft', 0, 'range'], ['contractYearsLeft', -1, 'range'], ['contractYearsLeft', 1.5, 'invalid'],
    ['contractYearsLeft', 8, 'range'], ['contractSignedYear', 2027, 'invalid']])('rejects %s=%s with %s evidence', async (field, value, code) => {
    const w = world(legacy({ [field]: value })), before = json(w), r = await migrate(freeze(w));
    expect(r.ok).toBe(false); expect(r.candidate).toBeUndefined();
    expect(r.issues).toContainEqual(expect.objectContaining({ field, code })); expect(json(w)).toEqual(before);
  });
  it.each(['duplicate-player', 'typed-player', 'typed-team', 'missing-team', 'market-duplicate'])('rejects %s atomically', async kind => {
    const w = world(legacy({ id: 0 }));
    if (kind === 'duplicate-player') w.teams[1].farm.push(legacy({ id: 0 }));
    if (kind === 'typed-player') w.teams[1].farm.push(legacy({ id: '0' }));
    if (kind === 'typed-team') w.teams[1].id = '0';
    if (kind === 'missing-team') w.teams.pop();
    if (kind === 'market-duplicate') w.faPool.push(legacy({ id: 0 }));
    const before = json(w), r = await migrate(freeze(w)); expect(r.ok).toBe(false); expect(r.candidate).toBeUndefined(); expect(w).toEqual(before);
  });
  it.each(['offseason', 'plan', 'unknown-boundary', 'already-annual'])('defers %s without partial migration', async kind => {
    const w = world(); let b = boundary;
    if (kind === 'offseason') w.phase = 'offseason';
    if (kind === 'plan') w.offseasonPlan = { year: 2026, phase: 'postseason' };
    if (kind === 'unknown-boundary') b = { season: 2026 };
    if (kind === 'already-annual') w.contractEconomy = { schemaVersion: 1, mode: 'annual' };
    const r = await migrate(freeze(w), b); expect(r.ok).toBe(false); expect(r.candidate).toBeUndefined(); expect(r.issues.length).toBeGreaterThan(0);
  });
  it('retains unknown guarantees on early release; waiver needs a newly recorded agreement', () => {
    const l = freeze(ledgerFor(opening())), next = applyContractLedgerAction(l, end());
    expect(contractLiabilityRows(next).filter(r => r.kind === 'guarantee').map(r => r.amountManYen)).toEqual([500, 1000]);
    expect(() => applyContractLedgerAction(l, end({ settlement: 'waive' }))).toThrow();
    const waived = applyContractLedgerAction(l, end({ settlement: 'waive', terminationAgreement: { id: 'mutual-release', agreedDate: '2027-07-01' } }));
    expect(contractLiabilityRows(waived).map(r => r.amountManYen)).toEqual([500]);
    expect(waived.records[0].contract.guaranteeStatus).toBe('unknown');
    expect(applyContractLedgerAction(json(waived), end({ settlement: 'waive', terminationAgreement: { id: 'mutual-release', agreedDate: '2027-07-01' } }))).toEqual(waived);
    expect(isContractLedgerExtension(l, waived)).toBe(true);
    expect(() => applyContractLedgerAction(waived, end({ settlement: 'waive', terminationAgreement: { id: 'changed', agreedDate: '2027-07-01' } }))).toThrow();
  });
  it('rejects forged opening balances after JSON reload', () => {
    for (const patch of [{ carriedFutureYears: 1 }, { guaranteeStatus: 'guaranteed' }, { signedSeason: 2025 }, { observedDate: '2026-07-01' }, { sourceFields: { salary: 999, contractYearsLeft: 3 } }]) {
      expect(() => validateContractLedger(json(ledgerFor(opening(patch))))).toThrow();
    }
  });
});

async function importedState({ expiring = false } = {}) {
  const s = fixture(), w = world(); w.teams = [...s.teams, ...w.teams.slice(4)];
  w.teams = w.teams.map(t => ({ ...t, players: t.players.map(p => ({ ...p, contractYearsLeft: expiring && p.id === 'a' ? 1 : 3 })),
    farm: t.farm.map(p => ({ ...p, contractYearsLeft: 3 })) }));
  const r = await migrate(w); expect(r.ok, JSON.stringify(r.issues)).toBe(true);
  return { ...s, teams: w.teams.slice(0, 4), spending: { ...s.spending, ledger: r.candidate.ledger } };
}

describe('opening union in ordinary annual transactions', () => {
  it('renews an expiring opening using native future terms', async () => {
    let s = await importedState({ expiring: true }); const id = s.spending.ledger.records.find(r => r.contract.playerId === 'a').contract.openingId;
    const proposal = { id: 'renew', type: 'sign', teamId: 0, effectiveDate: '2027-02-01', contract: seasonContract.createSeasonContract({
      contractId: 'future-a', playerId: 'a', signedSeason: 2026, agreementPhase: 'offseason', purpose: 'renewal', termYears: 3,
      annualSalaryManYen: 1200, guaranteed: true, registrationType: 'controlled' }) };
    s = run(s, { id: 'offer', type: 'offer-renewal', proposal, contractId: id });
    s = run(json(s), { id: 'accept', type: 'accept-renewal', proposalId: 'renew', contractId: id });
    expect(contractEmploymentAt(s.spending.ledger, '2027-02-01').find(e => e.contract.playerId === 'a').annualSalaryManYen).toBe(1200);
    expect(s.spending.ledger.records[0].contract.guaranteeStatus).toBe('unknown');
  });
  it('trades a continuing opening without fabricating total term or signature year', async () => {
    const s = { ...spring(await importedState()), phase: 'season', date: '2027-07-01' }, before = json(s);
    const next = run(freeze(s), { id: 'trade', type: 'trade', fromId: 0, toId: 1, outgoingIds: ['a'], incomingIds: ['b'], cashManYen: 0, mode: 'spend' });
    const p = [...next.teams[1].players, ...next.teams[1].farm].find(p => p.id === 'a');
    expect(p.contractYearsLeft).toBe(2); expect(p).not.toHaveProperty('contractYears'); expect(p).not.toHaveProperty('contractSignedYear');
    expect(contractLiabilityRows(next.spending.ledger).filter(r => r.playerId === 'a').map(r => [r.teamId, r.season, r.amountManYen])).toEqual([[0, 2027, 500], [1, 2027, 500], [1, 2028, 1000]]);
    expect(projectAnnualState(json(next))).toBeTruthy(); expect(s).toEqual(before);
  });
  it('moves an opening as FA personnel and joins after serialization without changing its evidence', async () => {
    const s = protect(claim(await importedState())), original = json(s.spending.ledger.records.find(r => r.contract.playerId === 'reserve').contract);
    const moved = run(s, settle()), joined = run(spring(json(moved)), { id: 'join-personnel', type: 'join-fa-personnel', proposalId: 'bid' });
    const p = joined.teams[1].farm.find(p => p.id === 'reserve');
    expect(p).toMatchObject({ contractYearsLeft: 2, salary: 1000 }); expect(p).not.toHaveProperty('contractSignedYear'); expect(p).not.toHaveProperty('contractYears');
    expect(joined.spending.ledger.records.find(r => r.contract.playerId === 'reserve').contract).toEqual(original);
  });
});

describe('opening trust boundaries', () => {
  it('rejects typed player and opening ID collisions in restored ledgers', () => {
    const a = opening({ openingId: 0, playerId: 0 }), b = opening({ openingId: '0', playerId: '0', teamId: 1 });
    const l = ledgerFor(a); l.records.push(ledgerFor(b).records[0]);
    expect(() => validateContractLedger(json(l))).toThrow();
  });
  it('does not append newly invented opening balances during an ordinary transaction', () => {
    const l = ledgerFor(opening()), other = opening({ openingId: 'later', playerId: 'later', observedSeason: 2027, observedDate: '2027-11-30', endSeason: 2029 });
    const after = { ...l, records: [...l.records, ...ledgerFor(other).records] };
    expect(isContractLedgerExtension(l, after)).toBe(false);
  });
  it.each([240, 239, 0])('checks development minimum %i without replacing zero or moving the roster', async salary => {
    const w = world(); w.teams[0].farm = [legacy({ id: 'development', isIkusei: true, salary })];
    const r = await migrate(freeze(w)); expect(r.ok).toBe(salary === 240);
    if (r.ok) expect(r.candidate.ledger.records[1].contract.registrationType).toBe('development');
    else expect(r.issues).toContainEqual(expect.objectContaining({ field: 'salary', code: 'minimum' }));
  });
});

it('roundtrips opening employment through the annual world without enabling live migration', async () => {
  const { economyFixture } = await import('./fixtures/economyWorld');
  const { toAnnualState, fromAnnualState, ANNUAL_ECONOMY_RELEASE_ENABLED } = await import('../contractEconomy');
  const w = economyFixture();
  // This is an explicit test world; migration does not create budgets or publish it.
  const records = w.teams.map(t => {
    const p = t.players[0]; delete p.contractYears; delete p.contractSignedYear;
    return ledgerFor(opening({ openingId: `o-${t.id}`, teamId: t.id, playerId: p.id })).records[0];
  });
  w.contractEconomy.clock = { season: 2026, phase: 'offseason', date: '2026-12-01', offseasonTurn: 0 };
  w.contractEconomy.engine.spending = { ...w.contractEconomy.engine.spending, budgetSeason: 2027,
    ledger: { version: 2, closedThroughSeason: 2026, records } };
  const restored = json(w), next = fromAnnualState(restored, toAnnualState(freeze(restored)));
  expect(toAnnualState(json(next)).spending.ledger).toEqual(w.contractEconomy.engine.spending.ledger);
  expect(next.teams[0].players[0]).toMatchObject({ contractId: 'o-0', contractYearsLeft: 3 });
  expect(next.teams[0].players[0]).not.toHaveProperty('contractYears');
  expect(next.teams[0].players[0]).not.toHaveProperty('contractSignedYear');
  expect(ANNUAL_ECONOMY_RELEASE_ENABLED).toBe(false);
});

describe('review: legacy evidence must support the migration boundary and class', () => {
  it.each(['contract_decision_pending', 'contract_decision'])('defers an unresolved %s without consuming or rewriting the reply', async type => {
    const w = world(); w.mailbox = [{ id: 'pending', type, resolved: false,
      decision: { playerId: 'old', teamId: 0, offeredYear: 2026, salary: 2000, years: 3, accepted: true } }];
    const before = json(w), r = await migrate(freeze(w));
    expect(r.ok).toBe(false); expect(r.candidate).toBeUndefined();
    expect(r.issues).toContainEqual(expect.objectContaining({ field: 'mailbox', code: 'deferred', earliestOffseason: 2027 }));
    expect(w).toEqual(before); expect(await migrate(json(w))).toEqual(r);
  });
  it('accepts resolved legacy replies and unrelated unread mail without replaying them', async () => {
    const w = world(); w.mailbox = [{ type: 'contract_decision', resolved: true }, { type: 'news', read: false }];
    const r = await migrate(freeze(w)); expect(r.ok, JSON.stringify(r.issues)).toBe(true);
  });
  it.each([undefined, null, {}, [null]])('defers when the mailbox cannot be inspected: %j', async mailbox => {
    const w = world(); w.mailbox = mailbox;
    const r = await migrate(freeze(w)); expect(r.ok).toBe(false); expect(r.candidate).toBeUndefined();
  });
  it.each(['isIkusei', '育成'].flatMap(field => ['false', 1, null, {}, []].map(value => [field, value])))('rejects recorded %s=%j on import and restore', async (field, value) => {
    const w = world(legacy({ salary: 240, [field]: value })), before = json(w), r = await migrate(freeze(w));
    expect(r.ok).toBe(false); expect(r.candidate).toBeUndefined();
    expect(r.issues).toContainEqual(expect.objectContaining({ field, code: 'invalid' })); expect(w).toEqual(before);
    const c = opening({ observedAnnualSalaryManYen: 240, registrationType: 'development',
      sourceFields: { salary: 240, contractYearsLeft: 3, [field]: value } });
    expect(() => validateContractLedger(json(ledgerFor(c)))).toThrow();
  });
  it.each([{ isIkusei: true }, { 育成: true }, { isIkusei: false, 育成: true }, { isIkusei: false, 育成: false }])('retains boolean alias semantics: %j', async flags => {
    const c = (await migrated(legacy(flags))).ledger.records[0].contract;
    expect(c.registrationType).toBe(flags.isIkusei || flags.育成 ? 'development' : 'controlled');
  });
});
