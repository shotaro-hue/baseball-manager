import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger } from '../contractLedger';
import { reserveContractProposal as reserve, commitContractReservation as commit,
  cancelContractReservation as cancel, quoteAnnualSpendingPlan as quote, assessAnnualSpendingChange as assess } from '../annualSpending';

const entry = { id: 'listing', kind: 'released', enteredDate: '2026-11-01' };
const proposal = (extra = {}) => ({ id: 'bid', type: 'sign', teamId: 0, offeredDate: '2026-11-20', marketEntry: entry,
  effectiveDate: '2027-02-01', contract: createSeasonContract({ contractId: 'contract', playerId: 'free',
    signedSeason: 2026, agreementPhase: 'offseason', purpose: 'acquisition', termYears: 3,
    annualSalaryManYen: 10000, registrationType: 'controlled', guaranteed: true }), ...extra });
const fixture = () => ({ version: 1, budgetSeason: 2027, ledger: createContractLedger(), reservations: [],
  resolvedReservations: [], oneOffCosts: [], authorizations: [0, 1].flatMap(teamId => [2026, 2027, 2028, 2029].map(season => ({
    teamId, season, approvedManYen: 50000, minimumRosterReserveManYen: 0 }))) });
const held = (p = proposal()) => reserve(fixture(), { kind: 'offer', proposal: p });
const json = state => JSON.parse(JSON.stringify(state));

describe('explicit acquisition offer histories (unconnected foundation)', () => {
  it('keeps submission and fixed next-year effective date through reservation, acceptance and JSON', () => {
    const p = proposal(), before = held(p);
    expect(before.reservations).toEqual([{ kind: 'offer', proposal: p }]);
    expect(quote(before).filter(r => r.teamId === 0).map(r => r.reservedManYen)).toEqual([10000, 10000, 10000]);
    const signed = commit(before, p, { answeredDate: '2026-12-10' });
    expect(signed.resolvedReservations).toEqual([{ kind: 'offer', proposal: p, resolution: 'accepted', answeredDate: '2026-12-10' }]);
    expect(signed.ledger.records[0].effectiveDate).toBe('2027-02-01');
    expect(quote(json(signed))).toEqual(quote(signed));
    expect(commit(json(signed), p, { answeredDate: '2026-12-10' })).toEqual(signed);
    expect(() => commit(signed, p, { answeredDate: '2026-12-11' })).toThrow();
  });
  it.each(['rejected', 'cancelled'])('records %s with a response date and releases all future holds', resolution => {
    const before = held(), next = cancel(before, 'bid', { resolution, answeredDate: '2026-12-01' });
    expect(next.resolvedReservations[0]).toEqual({ kind: 'offer', proposal: proposal(), resolution, answeredDate: '2026-12-01' });
    expect(quote(next).every(r => r.reservedManYen === 0)).toBe(true);
    expect(assess(before, next).ok).toBe(true);
    expect(cancel(json(next), 'bid', { resolution, answeredDate: '2026-12-01' })).toEqual(next);
    expect(() => commit(next, proposal(), { answeredDate: '2026-12-01' })).toThrow();
  });
  it('records competing loss on the winner response date, preserving both submissions', () => {
    const a = proposal(), b = proposal({ id: 'bid-b', teamId: 1, contract: { ...a.contract, contractId: 'contract-b' } });
    const plan = reserve(held(), { kind: 'offer', proposal: b });
    const next = commit(plan, a, { answeredDate: '2026-12-03' });
    expect(next.resolvedReservations).toEqual([
      { kind: 'offer', proposal: a, resolution: 'accepted', answeredDate: '2026-12-03' },
      { kind: 'offer', proposal: b, resolution: 'lost', answeredDate: '2026-12-03' },
    ]);
    expect(quote(next).find(r => r.teamId === 1 && r.season === 2027).reservedManYen).toBe(0);
  });
  it('keeps delayed released-player submission while using the current-year actual start', () => {
    const p = proposal({ offeredDate: '2026-07-01', effectiveDate: '2026-07-01',
      marketEntry: { ...entry, enteredDate: '2026-06-01' },
      contract: createSeasonContract({ ...proposal().contract, signedSeason: 2026, agreementPhase: 'season' }) });
    const plan = { ...fixture(), budgetSeason: 2026 };
    const next = commit(reserve(plan, { kind: 'offer', proposal: p }), p,
      { answeredDate: '2026-07-16', effectiveDate: '2026-07-16' });
    expect(next.resolvedReservations[0]).toMatchObject({ proposal: p, answeredDate: '2026-07-16',
      acceptedProposal: { ...p, effectiveDate: '2026-07-16' } });
    expect(quote(next).find(r => r.teamId === 0 && r.season === 2026).salaryManYen).toBe(4516);
  });
  it.each([
    { offeredDate: undefined }, { marketEntry: undefined }, { offeredDate: '2026-11-31' },
    { offeredDate: '2027-01-01' }, { offeredDate: '2026-10-01' },
    { marketEntry: { ...entry, kind: 'foreign-fa' } },
    { marketEntry: { ...entry, id: '' } }, { marketEntry: { ...entry, enteredDate: '2026-11-31' } },
    { marketEntry: { ...entry, compensationRank: 'C' } },
    { marketEntry: { ...entry, kind: 'domestic-fa', compensationRank: 'C' } },
    { marketEntry: { ...entry, kind: 'overseas-fa', originTeamId: 1 } },
    { effectiveDate: '2027-03-01' },
  ])('rejects incomplete, inverted or inconsistent explicit submission %j', change => {
    expect(() => held(proposal(change))).toThrow();
  });
  it.each(['2026-11-19', '2026-12-32', '2027-01-01', '2027-02-01'])('rejects unsafe offseason response date %s', answeredDate => {
    expect(() => commit(held(), proposal(), { answeredDate })).toThrow();
  });
  it('requires an explicit response date for explicit offers', () => {
    expect(() => commit(held(), proposal())).toThrow();
    expect(() => cancel(held(), 'bid')).toThrow();
  });
  it.each(['offeredDate', 'marketEntry', 'answeredDate'])('rejects changed %s after reload/assessment', field => {
    const before = commit(held(), proposal(), { answeredDate: '2026-12-01' }), after = json(before);
    if (field === 'marketEntry') after.resolvedReservations[0].proposal.marketEntry.id = 'other';
    else if (field === 'offeredDate') after.resolvedReservations[0].proposal.offeredDate = '2026-11-21';
    else after.resolvedReservations[0].answeredDate = '2026-12-02';
    expect(() => assess(before, after)).toThrow();
  });
  it('rejects missing response date and mismatched accepted date on JSON reload', () => {
    const signed = commit(held(), proposal(), { answeredDate: '2026-12-01' });
    delete signed.resolvedReservations[0].answeredDate;
    expect(() => quote(signed)).toThrow();
  });
  it('does not allow metadata to be changed while accepting or reusing the proposal ID', () => {
    expect(() => commit(held(), proposal({ offeredDate: '2026-11-21' }), { answeredDate: '2026-12-01' })).toThrow();
    expect(() => reserve(held(), { kind: 'offer', proposal: proposal({ marketEntry: { ...entry, id: 'new' } }) })).toThrow();
  });
});
