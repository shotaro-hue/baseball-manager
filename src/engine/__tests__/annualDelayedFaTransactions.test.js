import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as ledgerApply } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { applyAnnualTransaction as apply, quoteAnnualTransaction as quote } from '../annualTransactions';

const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '一塁手', salary: 10000, ...extra });
const proposal = ({ playerId = 'free', teamId = 0, date = '2026-07-01', phase = 'season',
  id = `offer-${teamId}-${playerId}`, ...terms } = {}) => ({ id, type: 'sign', teamId, effectiveDate: date,
  contract: createSeasonContract({ contractId: `contract-${teamId}-${playerId}`, playerId,
    signedSeason: 2026, agreementPhase: phase, purpose: 'acquisition', termYears: 3,
    annualSalaryManYen: 10000, guaranteed: true, registrationType: 'controlled', ...terms }) });
const sign = (id, teamId, terms = {}) => ({ ...proposal({ playerId: id, teamId, ...terms }),
  id: `initial-${id}`, effectiveDate: '2026-02-01' });
function fixture({ date = '2026-07-01', phase = 'season', ownedTermYears = 3 } = {}) {
  let ledger = createContractLedger();
  for (const [id, teamId] of [['a', 0], ['b', 1]]) ledger = ledgerApply(ledger, sign(id, teamId, { termYears: ownedTermYears }));
  return { version: 1, season: 2026, phase, date,
    teams: [0, 1].map(id => ({ id, budget: 999, players: [player(id ? 'b' : 'a')], farm: [] })),
    faPool: [player('free', { isFA: true })], transactions: [],
    draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} },
    rosterRequirements: [0, 1].flatMap(teamId => [2026, 2027, 2028].map(season => ({ teamId, season, requiredControlledCount: 2 }))),
    spending: { version: 1, budgetSeason: 2026, ledger, reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1].flatMap(teamId => [2026, 2027, 2028].map(season => ({
        teamId, season, approvedManYen: 50000, minimumRosterReserveManYen: 0 }))) } };
}
const offer = (p = proposal(), id = 'submit') => ({ id, type: 'offer-fa', proposal: p });
const accept = (p = proposal(), id = 'accept') => ({ id, type: 'accept-fa', proposalId: p.id });
const row = (state, season = 2026, teamId = 0) => quoteAnnualSpendingPlan(state.spending).find(r => r.teamId === teamId && r.season === season);
const success = result => { expect(result.ok, result.error).toBe(true); return result.state; };
const freeze = value => { if (value && typeof value === 'object') {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const held = (state = fixture(), p = proposal()) => success(apply(state, offer(p)));
const later = (state = held(), date = '2026-07-16', phase = state.phase) => ({ ...state, date, phase });
function rejected(state, command = accept()) {
  const snapshot = JSON.stringify(state), preview = quote(state, command), result = apply(state, command);
  expect(preview.ok).toBe(false); expect(result.ok).toBe(false); expect(result.state).toBe(state);
  expect(JSON.stringify(state)).toBe(snapshot); return result;
}
function addOwned(state, count, { farm = true, isForeign = false } = {}) {
  for (let i = 0; i < count; i++) {
    const id = `extra-${i}`;
    state.teams[0][farm ? 'farm' : 'players'].push(player(id, { salary: 420, isForeign }));
    state.spending.ledger = ledgerApply(state.spending.ledger, sign(id, 0, { annualSalaryManYen: 420 }));
  }
  return state;
}

describe('FA replies use the current transaction date (not live activation)', () => {
  it('quotes and accepts a later reply without mutating the original offer or prior roster/payroll', () => {
    const state = freeze(later()), snapshot = JSON.stringify(state), preview = quote(state, accept());
    expect(preview.ok, preview.error).toBe(true); expect(preview.state).toBeUndefined();
    expect(preview.rows.find(r => r.teamId === 0 && r.season === 2026)).toMatchObject({
      salaryManYen: 14516, reservedManYen: 0, minimumRosterReserveManYen: 0, remainingManYen: 35484 });
    const next = success(apply(state, accept()));
    expect([2026, 2027, 2028].map(y => row(next, y).salaryManYen)).toEqual([14516, 20000, 20000]);
    expect(next.teams[0].players.find(p => p.id === 'free')).toMatchObject({
      salary: 10000, isFA: false, contractId: 'contract-0-free', contractYears: 3,
      contractYearsLeft: 3, contractSignedYear: 2026 });
    expect(next.teams[0].players[0]).toEqual(state.teams[0].players[0]);
    expect(next.teams.map(t => t.budget)).toEqual([999, 999]); expect(next.faPool).toEqual([]);
    expect(next.spending.oneOffCosts).toEqual([]);
    expect(next.spending.resolvedReservations[0]).toMatchObject({ proposal: proposal(),
      acceptedProposal: { ...proposal(), effectiveDate: '2026-07-16' }, resolution: 'accepted' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it.each([
    ['2026-06-30', '2026-07-01', 'season', 'season', 5000],
    ['2026-02-01', '2026-03-01', 'preseason', 'preseason', 9000],
    ['2026-03-01', '2026-04-01', 'preseason', 'season', 8000],
    ['2026-07-30', '2026-07-31', 'season', 'season', 4032],
  ])('accepts forward reply %s→%s (%s→%s) with cost %i', (date, reply, phase, nextPhase, salary) => {
    const p = proposal({ date, phase });
    const state = later(held(fixture({ date, phase }), p), reply, nextPhase);
    const next = success(apply(freeze(state), accept(p)));
    expect(row(next).salaryManYen).toBe(10000 + salary);
    expect(next.spending.ledger.records.find(r => r.contract.playerId === 'free')).toMatchObject({
      effectiveDate: reply, contract: { agreementPhase: phase, startSeason: 2026, endSeason: 2028 } });
  });

  it('does not let command data override the trusted response date', () => {
    const state = freeze(later());
    rejected(state, { ...accept(), effectiveDate: '2026-07-01' });
    rejected(state, { ...accept(), date: '2026-07-01' });
    expect(success(apply(state, accept())).spending.ledger.records.at(-1).effectiveDate).toBe(state.date);
  });

  it.each([
    ['2026-06-30', 'season'], ['2026-07-16', 'preseason'], ['2026-08-01', 'season'],
    ['2026-06-31', 'season'], ['2026-07-16', 'postseason'],
  ])('rejects regressed/invalid/late reply %s in %s', (date, phase) => rejected(freeze(later(held(), date, phase))));

  it('does not carry the offer into offseason or the next budget year', () => {
    const off = later(held(), '2026-11-01', 'offseason'); off.spending = { ...off.spending, budgetSeason: 2027 };
    rejected(freeze(off));
    const nextYear = { ...later(held(), '2027-02-01', 'preseason'), season: 2027 };
    nextYear.spending = { ...nextYear.spending, budgetSeason: 2027 };
    rejected(freeze(nextYear));
  });

  it('preserves strict current date and phase checks on new offers', () => {
    rejected(freeze(fixture({ date: '2026-07-16' })), offer());
    rejected(freeze(fixture()), offer(proposal({ phase: 'preseason' })));
    rejected(freeze(fixture({ date: '2026-08-01' })), offer(proposal({ date: '2026-08-01' })));
  });

  it('replays the original offer/reply after JSON reload without changing dates or applying payroll twice', () => {
    const next = success(apply(freeze(later()), accept()));
    const loaded = JSON.parse(JSON.stringify(next));
    expect(success(apply(loaded, accept()))).toBe(loaded);
    expect(success(apply(loaded, offer()))).toBe(loaded);
    const advanced = { ...loaded, date: '2026-07-20' };
    expect(success(apply(advanced, accept()))).toBe(advanced);
    expect(advanced.spending.ledger.records.at(-1).effectiveDate).toBe('2026-07-16');
    rejected(loaded, accept(proposal(), 'another-reply'));
    rejected(loaded, offer(proposal({ annualSalaryManYen: 12000 })));
    expect(loaded.transactions).toHaveLength(2); expect(loaded.spending.ledger.records).toHaveLength(3);
  });

  it('can cancel an expired current-year offer in deficit and never revive its old identity', () => {
    const state = later(held(), '2026-08-01');
    state.spending.authorizations[0].approvedManYen = 10000;
    const command = { id: 'cancel', type: 'cancel-fa', proposalId: proposal().id };
    const next = success(apply(freeze(state), command));
    expect(row(next)).toMatchObject({ salaryManYen: 10000, reservedManYen: 0,
      minimumRosterReserveManYen: 420, remainingManYen: -420 });
    expect(next.spending.resolvedReservations[0]).toEqual({ kind: 'offer', proposal: proposal(), resolution: 'cancelled' });
    const loaded = JSON.parse(JSON.stringify(next)); expect(success(apply(loaded, command))).toBe(loaded);
    rejected(loaded); rejected(loaded, offer(proposal(), 'resubmit'));
  });

  it.each([2026, 2027, 2028])('rechecks budget year %i after a successful quote without partial acquisition', season => {
    const state = later(); expect(quote(state, accept()).ok).toBe(true);
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === season).approvedManYen = 10000;
    rejected(freeze(state));
  });

  it('can accept when the response-date bill fits a newly reduced current-year cap', () => {
    const state = later(); state.spending.authorizations[0].approvedManYen = 14600;
    expect(row(success(apply(freeze(state), accept()))).remainingManYen).toBe(84);
  });

  it.each(['authorization', 'requirement'])('rejects missing future %s rather than inventing budget data', missing => {
    const state = later(); expect(quote(state, accept()).ok).toBe(true);
    if (missing === 'authorization') state.spending.authorizations = state.spending.authorizations.filter(a => a.teamId !== 0 || a.season !== 2028);
    else state.rosterRequirements = state.rosterRequirements.filter(a => a.teamId !== 0 || a.season !== 2028);
    rejected(freeze(state));
  });

  it.each([{ isRetired: true }, { _retireNow: true }, { isIkusei: true }, { 育成: true }])(
    'rechecks current retirement/class after quote: %j', change => {
      const state = later(); expect(quote(state, accept()).ok).toBe(true);
      Object.assign(state.faPool[0], change); rejected(freeze(state));
    });

  it('rejects a player that left the market after the quote', () => {
    const state = later(); expect(quote(state, accept()).ok).toBe(true);
    state.faPool = []; rejected(freeze(state));
  });

  it('rechecks accepted rookie places after quote and admits only the actual 70th controlled player', () => {
    const state = later(); expect(quote(state, accept()).ok).toBe(true);
    addOwned(state, 68);
    const valid = success(apply(freeze(structuredClone(state)), accept()));
    expect(valid.teams[0].players.length + valid.teams[0].farm.length).toBe(70);
    state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    rejected(freeze(state));
  });

  it.each([{ injuryDaysLeft: 5 }, { registrationCooldownDays: 2 }])('uses current placement restrictions after quote: %j', change => {
    const state = later(); expect(quote(state, accept()).ok).toBe(true);
    Object.assign(state.faPool[0], change, { salary: 99999 });
    const next = success(apply(freeze(state), accept()));
    expect(next.teams[0].farm.find(p => p.id === 'free')).toMatchObject({ ...change, salary: 10000 });
    expect(next.teams[0].players.some(p => p.id === 'free')).toBe(false);
  });

  it.each(['active', 'foreign'])('uses the current %s roster limit after a quote', limit => {
    const state = later(); expect(quote(state, accept()).ok).toBe(true);
    addOwned(state, limit === 'active' ? 27 : 4, { farm: false, isForeign: limit === 'foreign' });
    if (limit === 'foreign') state.faPool[0].isForeign = true;
    expect(success(apply(freeze(state), accept())).teams[0].farm.some(p => p.id === 'free')).toBe(true);
  });

  it.each([0, 1])('lets club %i win a delayed reply and releases the other club even in deficit', winner => {
    const a = proposal(), b = proposal({ teamId: 1, annualSalaryManYen: 420 });
    let state = success(apply(held(), offer(b, 'bid-b'))); state = later(state);
    const loser = 1 - winner;
    state.spending.authorizations.filter(a => a.teamId === loser).forEach(a => { a.approvedManYen = 10000; });
    const p = winner ? b : a, losing = winner ? a : b, command = accept(p, `winner-${winner}`);
    const next = success(apply(freeze(state), command));
    expect(next.teams[winner].players.some(p => p.id === 'free')).toBe(true);
    expect(next.faPool).toEqual([]); expect(row(next, 2026, loser).reservedManYen).toBe(0);
    expect(next.spending.resolvedReservations.find(r => r.proposal.id === losing.id)).toMatchObject({ resolution: 'lost' });
    rejected(next, accept(losing, 'losing-reply'));
    const loaded = JSON.parse(JSON.stringify(next)); expect(success(apply(loaded, command))).toBe(loaded);
  });

  it('keeps unrelated rookie/renewal funding and another market player while accepting the delayed FA', () => {
    const state = fixture({ ownedTermYears: 1 }); state.faPool.push(player('other'));
    const renewal = proposal({ playerId: 'a', id: 'renewal-a', date: '2027-02-01',
      contractId: 'renewal-a', purpose: 'renewal', annualSalaryManYen: 800, termYears: 1 });
    let next = success(apply(state, { id: 'renew', type: 'offer-renewal', proposal: renewal, contractId: 'contract-0-a' }));
    next.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    const rookie = proposal({ playerId: 'rookie', date: '2027-02-01', phase: 'offseason', termYears: 1, annualSalaryManYen: 600 });
    next.spending.reservations = [...next.spending.reservations, { kind: 'rookie', proposal: rookie }];
    next = later(held(next));
    const before = structuredClone(next.spending.reservations.filter(h => h.kind !== 'offer'));
    const signed = success(apply(freeze(next), accept()));
    expect(signed.spending.reservations).toEqual(before);
    expect(signed.faPool.map(p => p.id)).toEqual(['other']);
    expect(signed.teams[0].players[0]).toEqual(state.teams[0].players[0]);
    expect(row(signed, 2027).reservedManYen).toBe(1400);
  });
});
