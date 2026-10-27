import { describe, it, expect } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as ledgerApply } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { applyAnnualTransaction as apply, quoteAnnualTransaction as quote } from '../annualTransactions';

const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '一塁手', salary: 10000, ...extra });
const proposal = (playerId = 'free', teamId = 0, extra = {}) => ({ id: `offer-${teamId}-${playerId}`, type: 'sign', teamId,
  effectiveDate: '2026-07-01', contract: createSeasonContract({ contractId: `contract-${teamId}-${playerId}`, playerId,
    signedSeason: 2026, agreementPhase: 'season', purpose: 'acquisition', termYears: 3, annualSalaryManYen: 10000, guaranteed: true, ...extra }) });
const ownedSign = (id, teamId, extra = {}) => ({ ...proposal(id, teamId, extra), id: `initial-${id}`, effectiveDate: '2026-02-01' });
function fixture() {
  let ledger = createContractLedger();
  for (const [id, team] of [['a', 0], ['b', 1]]) ledger = ledgerApply(ledger, ownedSign(id, team));
  return { version: 1, season: 2026, phase: 'season', date: '2026-07-01',
    teams: [0, 1].map(id => ({ id, budget: 999, players: [player(id === 0 ? 'a' : 'b')], farm: [] })),
    faPool: [player('free')], draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} },
    rosterRequirements: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({ teamId, season: 2026 + i, requiredControlledCount: 2 }))),
    spending: { version: 1, budgetSeason: 2026, ledger, reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({ teamId, season: 2026 + i, approvedManYen: 50000, minimumRosterReserveManYen: 0 }))) },
    transactions: [] };
}
const trade = (extra = {}) => ({ id: 'trade-1', type: 'trade', fromId: 0, toId: 1, outgoingIds: ['a'], incomingIds: ['b'], cashManYen: 500, mode: 'spend', ...extra });
const offer = (p = proposal(), id = 'submit') => ({ id, type: 'offer-fa', proposal: p });
const accept = (p = proposal(), id = 'accept') => ({ id, type: 'accept-fa', proposalId: p.id });
const rows = state => quoteAnnualSpendingPlan(state.spending);
const row = (state, teamId = 0, season = 2026) => rows(state).find(r => r.teamId === teamId && r.season === season);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const success = result => { expect(result.ok, result.error).toBe(true); return result.state; };
function rejected(state, command) {
  const before = JSON.stringify(state), r = apply(state, command);
  expect(r.ok).toBe(false); expect(r.state).toBe(state); expect(JSON.stringify(state)).toBe(before); return r;
}

describe('annual FA and trade transactions (not live activation)', () => {
  it('quotes without mutation and reserves then accepts 5000/10000/10000 exactly once', () => {
    const state = freeze(fixture()), preview = quote(state, offer());
    expect(preview.ok, preview.error).toBe(true); expect(preview.state).toBeUndefined(); expect(state.transactions).toEqual([]);
    const held = success(apply(state, offer()));
    expect([2026, 2027, 2028].map(y => row(held, 0, y).reservedManYen)).toEqual([5000, 10000, 10000]);
    expect(row(held).minimumRosterReserveManYen).toBe(0);
    const signed = success(apply(held, accept()));
    expect([2026, 2027, 2028].map(y => row(signed, 0, y).salaryManYen)).toEqual([15000, 20000, 20000]);
    expect(row(signed).remainingManYen).toBe(row(held).remainingManYen);
    expect(signed.faPool).toEqual([]); expect(signed.teams[0].players.find(p => p.id === 'free')).toMatchObject({ salary: 10000, contractYearsLeft: 3 });
    const restored = JSON.parse(JSON.stringify(signed));
    expect(success(apply(restored, accept()))).toBe(restored);
    expect(success(apply(restored, offer()))).toBe(restored);
    rejected(restored, offer(proposal('free', 0, { annualSalaryManYen: 11000 })));
    rejected(restored, accept(proposal(), 'another-accept'));
  });
  it('commits cash, two contract transfers and roster cleanup together without touching legacy budget', () => {
    const state = fixture(); state.teams[0].lineup = ['a']; state.teams[0].fieldingDh = { a: '一塁手' };
    const next = success(apply(freeze(state), trade()));
    expect(next.teams.map(t => t.players[0].id)).toEqual(['b', 'a']);
    expect(next.teams.map(t => t.budget)).toEqual([999, 999]);
    expect(next.teams[0].fieldingDh).toEqual({});
    expect(next.spending.oneOffCosts.map(c => c.amountManYen)).toEqual([500, -500]);
    expect(next.spending.oneOffCosts.every(c => c.transactionId === 'trade-1')).toBe(true);
    expect(next.spending.ledger.records.map(r => r.changes[0].toTeamId)).toEqual([1, 0]);
    expect(next.transactions).toHaveLength(1);
    expect(row(next).salaryManYen).toBe(10000);
    const restored = JSON.parse(JSON.stringify(next));
    expect(success(apply(restored, trade()))).toBe(restored);
    rejected(restored, trade({ cashManYen: 501 }));
    rejected(restored, trade({ id: 'stale-trade' }));
  });
  it('rejects the entire trade when the buyer cannot pay, even if the seller is solvent', () => {
    const state = fixture(); state.spending.authorizations[0].approvedManYen = 10420;
    rejected(state, trade());
  });
  it('checks the seventh year and keeps a deficit seller able to reduce liabilities', () => {
    const state = fixture();
    state.spending.ledger = ledgerApply(createContractLedger(), ownedSign('a', 0, { termYears: 7 }));
    state.teams[1].players = [];
    state.spending.authorizations.find(a => a.teamId === 1 && a.season === 2032).approvedManYen = 10419;
    rejected(state, trade({ incomingIds: [], cashManYen: 0 }));
    state.spending.authorizations.find(a => a.teamId === 1 && a.season === 2032).approvedManYen = 10420;
    state.spending.authorizations[0].approvedManYen = 9000;
    success(apply(state, trade({ incomingIds: [], cashManYen: 0 })));
  });
  it('revalidates against current state instead of trusting a successful quote', () => {
    const state = fixture(); expect(quote(state, trade()).ok).toBe(true);
    state.spending.authorizations[0].approvedManYen = 10000;
    rejected(state, trade());
  });
  it('restores minimum maintenance on cancellation without reviving the old offer', () => {
    const held = success(apply(fixture(), offer()));
    const command = { id: 'cancel', type: 'cancel-fa', proposalId: proposal().id };
    const cancelled = success(apply(held, command));
    expect(row(cancelled).reservedManYen).toBe(0); expect(row(cancelled).minimumRosterReserveManYen).toBe(420);
    expect(success(apply(cancelled, command))).toBe(cancelled);
    rejected(cancelled, accept()); rejected(cancelled, offer(proposal(), 'resubmit'));
  });
  it('releases a competing bid even when the losing club is already in deficit', () => {
    const a = proposal(), b = proposal('free', 1);
    let state = success(apply(success(apply(fixture(), offer(a))), offer(b, 'bid-b')));
    state.spending.authorizations.find(a => a.teamId === 1 && a.season === 2026).approvedManYen = 10000;
    state = success(apply(state, accept(a)));
    expect(row(state, 1).reservedManYen).toBe(0); expect(row(state, 1).minimumRosterReserveManYen).toBe(420);
    rejected(state, accept(b, 'loser-accept'));
  });
  it('does not count unpaid rookies as funded places, or double count funded rookies', () => {
    const state = fixture(); state.draftContext = { draftPool: [player('rookie', { salary: 420 })], drafted: { rookie: 0 }, confirmedPicks: {} };
    const next = success(apply(state, trade({ cashManYen: 0 })));
    expect(row(next).minimumRosterReserveManYen).toBe(420);
  });
  it('uses actual current roster and minimum salary instead of submitted floors', () => {
    const state = fixture();
    const next = success(apply(state, trade({ cashManYen: 0 })));
    expect(row(next).minimumRosterReserveManYen).toBe(420);
    expect(row(next, 0, 2029).minimumRosterReserveManYen).toBe(840);
    rejected(state, { ...trade(), minimumRosterReserveManYen: 0 });
  });
  it('allows a nonworsening deficit cashless exchange and rejects cash or a one-way exception', () => {
    const state = fixture(); state.spending.authorizations.forEach(a => { a.approvedManYen = 9000; });
    success(apply(state, trade({ cashManYen: 0, mode: 'cashless-trade' })));
    rejected(state, trade({ mode: 'cashless-trade' }));
    rejected(state, trade({ cashManYen: 0, incomingIds: [], mode: 'cashless-trade' }));
  });
  it.each(['offer', 'trade'])('enforces the July 31 deadline for %s', kind => {
    const state = fixture(); state.date = '2026-08-01';
    const p = { ...proposal(), effectiveDate: state.date };
    rejected(state, kind === 'offer' ? offer(p) : trade());
  });
  it.each([0, 419, -1, 1.5])('rejects invalid FA annual salary %s', salary => {
    const p = proposal(); p.contract.annualSalaryManYen = salary;
    rejected(fixture(), offer(p));
  });
  it('rejects FA terms over three years and wrong dates/phases rather than granting roster rights early', () => {
    rejected(fixture(), offer(proposal('free', 0, { termYears: 4 })));
    rejected(fixture(), offer({ ...proposal(), effectiveDate: '2026-07-02' }));
    const state = fixture(); state.phase = 'offseason'; rejected(state, trade());
  });
  it('rejects missing future authorizations or roster requirements', () => {
    const state = fixture(); state.spending.authorizations = state.spending.authorizations.filter(a => !(a.teamId === 0 && a.season === 2028));
    rejected(state, offer());
    const second = fixture(); second.rosterRequirements.pop(); rejected(second, trade());
  });
  it('rejects partial/mixed ownership, duplicate IDs and duplicate market records', () => {
    const state = fixture(); state.teams[1].farm.push(player('a')); rejected(state, trade());
    const missing = fixture(); missing.spending.ledger.records.pop(); rejected(missing, trade());
    const market = fixture(); market.faPool.push(player('free')); rejected(market, offer());
    rejected(fixture(), trade({ outgoingIds: ['a', 'a'] }));
  });
  it('checks accepted rookie slots on both clubs without committing the outgoing half', () => {
    const state = fixture();
    for (let i = 0; i < 68; i++) { const id = `extra-${i}`; state.teams[1].farm.push(player(id)); state.spending.ledger = ledgerApply(state.spending.ledger, ownedSign(id, 1, { annualSalaryManYen: 420 })); }
    state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 1 }, confirmedPicks: {} };
    state.spending.authorizations.forEach(a => { a.approvedManYen = 1000000; });
    rejected(state, trade({ incomingIds: [], cashManYen: 0 }));
  });
  it('places injured FA and incoming trade players in farm', () => {
    const state = fixture(); state.faPool[0].injuryDaysLeft = 5; state.teams[1].players[0].injuryDaysLeft = 5;
    const traded = success(apply(state, trade())); expect(traded.teams[0].farm[0].id).toBe('b');
    const signed = success(apply(success(apply(state, offer())), accept())); expect(signed.teams[0].farm[0].id).toBe('free');
  });
  it('projects the current annual rate and remaining term from the contract after a raise', () => {
    const state = fixture();
    state.spending.ledger = ledgerApply(state.spending.ledger, { id: 'raise', type: 'increase', contractId: 'contract-0-a', teamId: 0, effectiveDate: '2026-06-01', annualSalaryManYen: 12000 });
    const next = success(apply(state, trade()));
    expect(next.teams[1].players.find(p => p.id === 'a').salary).toBe(12000);
    expect(next.teams[1].players.find(p => p.id === 'a').contractYearsLeft).toBe(3);
  });
  it('does not count guaranteed release liabilities as a funded roster place', () => {
    const state = fixture();
    state.spending.ledger = ledgerApply(state.spending.ledger, { id: 'release', type: 'end', contractId: 'contract-0-a', teamId: 0, effectiveDate: '2026-06-01', reason: 'release', settlement: 'retain' });
    state.teams[0].players = [];
    const held = success(apply(state, offer()));
    expect(row(held).minimumRosterReserveManYen).toBe(420);
    expect(row(held).guaranteeManYen).toBe(6000);
  });
  it('keeps unrelated funded rookie reservations during an FA acceptance', () => {
    const state = fixture(), p = proposal('rookie', 0, { annualSalaryManYen: 420, termYears: 1 });
    state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    state.spending.reservations.push({ kind: 'rookie', proposal: p });
    const next = success(apply(success(apply(state, offer())), accept()));
    expect(row(next).reservedManYen).toBe(210); expect(row(next).minimumRosterReserveManYen).toBe(0);
    expect(next.spending.reservations.map(h => h.proposal.id)).toEqual([p.id]);
  });
  it('rejects a cashless exception that worsens a solvent future year', () => {
    const state = fixture(); state.spending.ledger = ledgerApply(ledgerApply(createContractLedger(), ownedSign('a', 0, { annualSalaryManYen: 12000 })), ownedSign('b', 1));
    rejected(state, trade({ cashManYen: 0, mode: 'cashless-trade' }));
  });
  it('keeps invalid receipt versions and duplicate receipt identities from replaying', () => {
    const next = success(apply(fixture(), trade()));
    next.transactions.push({ ...next.transactions[0] }); rejected(next, trade());
    const state = fixture(); state.version = 2; rejected(state, trade());
  });
  it('routes an acquired foreigner to farm when the active foreigner allowance is full', () => {
    const state = fixture(); state.faPool[0].isForeign = true;
    for (let i = 0; i < 4; i++) { const id = `foreign-${i}`; state.teams[0].players.push(player(id, { isForeign: true })); state.spending.ledger = ledgerApply(state.spending.ledger, ownedSign(id, 0, { annualSalaryManYen: 420 })); }
    const next = success(apply(success(apply(state, offer())), accept()));
    expect(next.teams[0].farm.map(p => p.id)).toContain('free');
  });

});
