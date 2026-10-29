import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger } from '../contractLedger';
import * as spending from '../annualSpending';

const json = x => JSON.parse(JSON.stringify(x));
const prop = ({ rank = 'A', exercise = 'first', previous = 10000, teamId = 0, id = 'bid', ...extra } = {}) => ({
  id, type: 'sign', teamId, offeredDate: '2026-11-20', effectiveDate: '2027-02-01',
  marketEntry: { id: 'listing', kind: 'domestic-fa', enteredDate: '2026-11-01', originTeamId: 1,
    compensationRank: rank, compensationBasis: { previousAnnualSalaryManYen: previous, exercise } },
  contract: createSeasonContract({ contractId: `contract-${id}`, playerId: 'free', signedSeason: 2026,
    agreementPhase: 'offseason', purpose: 'acquisition', termYears: 3, annualSalaryManYen: 20000,
    guaranteed: true, registrationType: 'controlled' }), ...extra });
const fixture = () => ({ version: 1, budgetSeason: 2027, ledger: createContractLedger(),
  reservations: [], resolvedReservations: [], oneOffCosts: [], authorizations: [0, 1, 2].flatMap(teamId =>
    [2026, 2027, 2028, 2029].map(season => ({ teamId, season, approvedManYen: 100000, minimumRosterReserveManYen: 0 }))) });
const reserve = (plan = fixture(), p = prop()) => spending.reserveContractProposal(plan, { kind: 'offer', proposal: p });
const accept = (plan = reserve(), p = prop()) => spending.commitContractReservation(plan, p, { answeredDate: '2026-12-01' });
const settle = (plan, extra = {}) => spending.settleFaCashCompensation(plan, {
  proposalId: 'bid', teamId: 1, chosenDate: '2026-12-05', ...extra });
const row = (plan, team = 0, season = 2027) => spending.quoteAnnualSpendingPlan(plan).find(r => r.teamId === team && r.season === season);
const expectedCosts = (amount = 8000) => [
  { id: JSON.stringify(['fa-compensation', 'bid', 'payer']), teamId: 0, season: 2027, kind: 'fa-compensation', amountManYen: amount, proposalId: 'bid' },
  { id: JSON.stringify(['fa-compensation', 'bid', 'payee']), teamId: 1, season: 2027, kind: 'fa-compensation', amountManYen: -amount, proposalId: 'bid' },
];
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };

describe('FA cash compensation obligations in annual spending (not live)', () => {
  it.each([['A', 'first', 8000], ['B', 'first', 6000], ['A', 'repeat', 4000], ['B', 'repeat', 3000]])(
    'reserves prior salary based %s/%s compensation once, not for every contract season', (rank, exercise, amount) => {
      const p = prop({ rank, exercise }), plan = reserve(fixture(), p);
      expect([2027, 2028, 2029].map(y => row(plan, 0, y).reservedManYen)).toEqual([20000 + amount, 20000, 20000]);
      expect(row(plan, 1).oneOffManYen).toBe(0); expect(plan.reservations[0].proposal).toEqual(p);
      expect(plan.oneOffCosts).toEqual([]); expect(plan.faCompensations).toBeUndefined();
      expect(spending.quoteAnnualSpendingPlan(json(plan))).toEqual(spending.quoteAnnualSpendingPlan(plan));
    });
  it.each([['A', 'first', 8001], ['B', 'first', 6001], ['A', 'repeat', 4001], ['B', 'repeat', 3001]])(
    'rounds %s/%s once upward to whole 万円 for both parties', (rank, exercise, amount) => {
      const p = prop({ rank, exercise, previous: 10001 }), paid = settle(accept(reserve(fixture(), p), p));
      expect(paid.oneOffCosts).toEqual(expectedCosts(amount));
      expect(row(paid).oneOffManYen + row(paid, 1).oneOffManYen).toBe(0);
    });
  it('keeps exact arithmetic near the safe-integer limit', () => {
    const p = prop({ previous: Number.MAX_SAFE_INTEGER }); p.contract.annualSalaryManYen = 420;
    const plan = fixture(); plan.authorizations.forEach(a => { a.approvedManYen = Number.MAX_SAFE_INTEGER; });
    expect(row(reserve(plan, p)).reservedManYen).toBe(7205759403792793 + 420);
  });
  it('turns salary into a future contract while retaining the accepted compensation obligation', () => {
    const before = freeze(reserve()), snapshot = JSON.stringify(before), next = accept(before);
    expect(next.faCompensations).toEqual([{ proposalId: 'bid', resolution: 'pending' }]);
    expect(row(next)).toMatchObject({ salaryManYen: 20000, reservedManYen: 8000, oneOffManYen: 0, remainingManYen: 72000 });
    expect(row(next, 1).oneOffManYen).toBe(0); expect(next.oneOffCosts).toEqual([]);
    expect(next.resolvedReservations[0].proposal).toEqual(prop());
    expect(next.ledger.records[0]).toMatchObject({ effectiveDate: '2027-02-01', contract: { endSeason: 2029, annualSalaryManYen: 20000 } });
    expect(JSON.stringify(before)).toBe(snapshot);
    expect(accept(json(next))).toEqual(next);
  });
  it('settles both directions once, preserving the original contract and offer', () => {
    const before = freeze(accept()), snapshot = JSON.stringify(before), next = settle(before);
    expect(next.faCompensations).toEqual([{ proposalId: 'bid', resolution: 'cash-only', teamId: 1, chosenDate: '2026-12-05' }]);
    expect(next.oneOffCosts).toEqual(expectedCosts());
    expect(row(next)).toMatchObject({ salaryManYen: 20000, reservedManYen: 0, oneOffManYen: 8000, remainingManYen: 72000 });
    expect(row(next, 1)).toMatchObject({ oneOffManYen: -8000, remainingManYen: 108000 });
    expect(row(next, 0, 2028).oneOffManYen).toBe(0); expect(row(next, 0, 2029).oneOffManYen).toBe(0);
    expect(next.ledger).toEqual(before.ledger); expect(next.resolvedReservations).toEqual(before.resolvedReservations);
    expect(JSON.stringify(before)).toBe(snapshot); expect(settle(json(next))).toEqual(next);
    expect(() => settle(next, { chosenDate: '2026-12-06' })).toThrow();
    expect(() => settle(next, { teamId: 2 })).toThrow();
  });
  it('permits same-day acceptance and selection, and selection in the contract start year', () => {
    expect(row(settle(accept(), { chosenDate: '2026-12-01' })).oneOffManYen).toBe(8000);
    expect(row(settle(accept(), { chosenDate: '2027-02-01' })).oneOffManYen).toBe(8000);
  });
  it.each(['2026-11-30', '2026-12-32', '2028-01-01'])('rejects invalid or inverted selection date %s', chosenDate => {
    expect(() => settle(accept(), { chosenDate })).toThrow();
  });
  it('rejects selection for an unaccepted bid or the wrong former club', () => {
    expect(() => settle(reserve())).toThrow(); expect(() => settle(accept(), { teamId: 0 })).toThrow();
  });
  it('reserves nothing for the former club until its actual cash choice', () => {
    const next = accept(); expect(row(next, 1).remainingManYen).toBe(row(fixture(), 1).remainingManYen);
    expect(next.reservations).toEqual([]); expect(row(next).reservedManYen).toBe(8000);
  });
  it('settles an already accepted obligation despite a later payer budget deficit', () => {
    const before = accept(); before.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 1000;
    const next = settle(freeze(before));
    expect(row(next).remainingManYen).toBe(-27000);
    expect(spending.assessAnnualSpendingChange(before, next).ok).toBe(true);
  });
  it('allows receipt into a deficit but does not mask new unrelated spending', () => {
    const before = accept(); before.authorizations.find(a => a.teamId === 1 && a.season === 2027).approvedManYen = 0;
    before.oneOffCosts.push({ id: 'old-coach', teamId: 1, season: 2027, kind: 'coach', amountManYen: 20000 });
    const next = settle(before); expect(row(next, 1).remainingManYen).toBe(-12000);
    expect(spending.assessAnnualSpendingChange(before, next).ok).toBe(true);
    const extra = { ...next, oneOffCosts: [...next.oneOffCosts, { id: 'new-coach', teamId: 1, season: 2027, kind: 'coach', amountManYen: 1 }] };
    expect(spending.assessAnnualSpendingChange(before, extra).ok).toBe(false);
  });
  it('rejects a bid or acceptance that no longer funds compensation', () => {
    const plan = fixture(); plan.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 27999;
    expect(() => reserve(plan)).toThrow();
    const held = reserve(); held.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 27999;
    expect(() => accept(held)).toThrow();
  });
  it('requires explicit payee authorization without counting a provisional credit', () => {
    const plan = fixture(); plan.authorizations = plan.authorizations.filter(a => a.teamId !== 1 || a.season !== 2027);
    expect(() => reserve(plan)).toThrow();
  });
  it.each(['cancelled', 'rejected'])('releases both salary and compensation for %s without money movement', resolution => {
    const next = spending.cancelContractReservation(reserve(), 'bid', { resolution, answeredDate: '2026-12-01' });
    expect(row(next).reservedManYen).toBe(0); expect(next.oneOffCosts).toEqual([]); expect(next.faCompensations).toBeUndefined();
  });
  it('keeps only the winner obligation and releases competing compensation reserves', () => {
    const p = prop({ teamId: 2, id: 'other' }); const held = reserve(reserve(), p), next = accept(held);
    expect(next.faCompensations).toEqual([{ proposalId: 'bid', resolution: 'pending' }]);
    expect(row(next, 2).reservedManYen).toBe(0); expect(next.oneOffCosts).toEqual([]);
    expect(next.resolvedReservations.find(r => r.proposal.id === 'other').resolution).toBe('lost');
  });
  it.each(['C', 'exempt', 'released', 'origin'])('preserves the zero-fee path for %s', mode => {
    const p = prop();
    if (mode === 'origin') p.teamId = 1;
    else { delete p.marketEntry.compensationBasis; if (mode === 'released') { p.marketEntry.kind = 'released'; delete p.marketEntry.compensationRank; } else p.marketEntry.compensationRank = mode; }
    const next = accept(reserve(fixture(), p), p);
    expect(row(next, p.teamId).reservedManYen).toBe(0); expect(next.oneOffCosts).toEqual([]); expect(next.faCompensations).toBeUndefined();
  });
  it('keeps an unpriced legacy A/B bid cancellable but refuses acceptance', () => {
    const p = prop(); delete p.marketEntry.compensationBasis;
    const held = reserve(fixture(), p); expect(row(held).reservedManYen).toBe(20000);
    expect(() => accept(held, p)).toThrow();
    const next = spending.cancelContractReservation(held, p.id, { answeredDate: '2026-12-01' }); expect(row(next).reservedManYen).toBe(0);
  });
  it.each([
    null, {}, { previousAnnualSalaryManYen: 419, exercise: 'first' },
    { previousAnnualSalaryManYen: 10000.5, exercise: 'first' },
    { previousAnnualSalaryManYen: Number.MAX_SAFE_INTEGER + 1, exercise: 'first' },
    { previousAnnualSalaryManYen: 10000, exercise: 'unknown' },
    { previousAnnualSalaryManYen: 10000, exercise: 'first', multiplier: 0 },
  ])('rejects incomplete or invalid compensation basis %j', basis => {
    const p = prop(); p.marketEntry.compensationBasis = basis; expect(() => reserve(fixture(), p)).toThrow();
  });
  it.each(['C', 'exempt', 'released'])('does not attach a compensation basis to %s', mode => {
    const p = prop(); if (mode === 'released') { p.marketEntry.kind = mode; delete p.marketEntry.compensationRank; } else p.marketEntry.compensationRank = mode;
    expect(() => reserve(fixture(), p)).toThrow();
  });
  it.each(['missing-record', 'duplicate-record', 'unknown-record', 'missing-leg', 'missing-both', 'wrong-amount', 'wrong-team', 'wrong-year', 'wrong-proposal', 'duplicate-leg', 'extra-credit', 'pending-again', 'wrong-choice-team', 'early-choice', 'payer-kind', 'payee-kind'])('rejects invalid JSON compensation state: %s', change => {
    const next = json(settle(accept()));
    if (change === 'missing-record') delete next.faCompensations;
    if (change === 'duplicate-record') next.faCompensations.push(json(next.faCompensations[0]));
    if (change === 'unknown-record') next.faCompensations[0].proposalId = 'unknown';
    if (change === 'missing-leg') next.oneOffCosts.pop();
    if (change === 'missing-both') next.oneOffCosts = [];
    if (change === 'wrong-amount') next.oneOffCosts[0].amountManYen -= 1;
    if (change === 'wrong-team') next.oneOffCosts[1].teamId = 2;
    if (change === 'wrong-year') next.oneOffCosts.forEach(c => { c.season = 2028; });
    if (change === 'wrong-proposal') next.oneOffCosts[0].proposalId = 'unknown';
    if (change === 'duplicate-leg') next.oneOffCosts.push(json(next.oneOffCosts[0]));
    if (change === 'extra-credit') next.oneOffCosts.push({ ...next.oneOffCosts[1], id: 'bonus' });
    if (change === 'pending-again') next.faCompensations[0] = { proposalId: 'bid', resolution: 'pending' };
    if (change === 'wrong-choice-team') next.faCompensations[0].teamId = 2;
    if (change === 'early-choice') next.faCompensations[0].chosenDate = '2026-11-30';
    if (change === 'payer-kind') next.oneOffCosts[0].kind = 'coach';
    if (change === 'payee-kind') next.oneOffCosts[1].kind = 'trade';
    expect(() => spending.quoteAnnualSpendingPlan(next)).toThrow();
  });
  it('rejects missing pending liability and passing it into a later budget year', () => {
    const next = accept(); delete next.faCompensations; expect(() => spending.quoteAnnualSpendingPlan(next)).toThrow();
    const advanced = { ...accept(), budgetSeason: 2028 }; expect(() => spending.quoteAnnualSpendingPlan(advanced)).toThrow();
  });
  it('rejects removing both the accepted A/B basis and its compensation obligation after JSON', () => {
    const next = json(accept()); delete next.resolvedReservations[0].proposal.marketEntry.compensationBasis; delete next.faCompensations;
    expect(() => spending.quoteAnnualSpendingPlan(next)).toThrow();
  });
  it.each(['held', 'pending'])('rejects booking unselected %s compensation as an ordinary trade', phase => {
    const next = json(phase === 'held' ? reserve() : accept());
    next.oneOffCosts = expectedCosts().map(c => ({ ...c, kind: 'trade' }));
    expect(() => spending.quoteAnnualSpendingPlan(next)).toThrow();
  });
  it.each(['reserved-id', 'proposal-link'])('does not accept ordinary costs with FA identity %s', identity => {
    const next = json(accept());
    next.oneOffCosts = expectedCosts().map(c => {
      const cost = { ...c, kind: 'trade' };
      if (identity === 'reserved-id') delete cost.proposalId; else cost.id = `ordinary-${cost.teamId}`;
      return cost;
    });
    expect(() => spending.quoteAnnualSpendingPlan(next)).toThrow();
  });
  it('does not rewrite or erase a settled compensation during assessment', () => {
    const before = settle(accept()), after = json(before); after.faCompensations[0].chosenDate = '2026-12-06';
    expect(() => spending.assessAnnualSpendingChange(before, after)).toThrow();
    const deleted = json(before); deleted.faCompensations = []; expect(() => spending.assessAnnualSpendingChange(before, deleted)).toThrow();
  });
  it('keeps settled historical cost pairs after advancing the budget season', () => {
    const before = settle(accept()), after = { ...json(before), budgetSeason: 2028 };
    expect(row(after, 0, 2028)).toMatchObject({ salaryManYen: 20000, reservedManYen: 0, oneOffManYen: 0 });
    expect(after.oneOffCosts).toEqual(expectedCosts());
  });
});
