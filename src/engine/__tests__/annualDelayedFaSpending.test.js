import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction } from '../contractLedger';
import { quoteAnnualSpendingPlan as quote, assessAnnualSpendingChange as assess,
  reserveContractProposal as reserve, cancelContractReservation as cancel,
  commitContractReservation as commit } from '../annualSpending';

const proposal = (extra = {}, terms = {}) => ({ id: 'offer', type: 'sign', teamId: 0,
  effectiveDate: '2026-07-01', ...extra,
  contract: createSeasonContract({ contractId: 'contract', playerId: 'free', signedSeason: 2026,
    agreementPhase: 'season', purpose: 'acquisition', annualSalaryManYen: 10000,
    termYears: 3, guaranteed: true, registrationType: 'controlled', ...terms }) });
const plan = () => ({ version: 1, budgetSeason: 2026, ledger: createContractLedger(),
  reservations: [], resolvedReservations: [], oneOffCosts: [],
  authorizations: [0, 1].flatMap(teamId => [2026, 2027, 2028].map(season => ({
    teamId, season, approvedManYen: 50000, minimumRosterReserveManYen: 0 }))) });
const row = (p, season = 2026, teamId = 0) => quote(p).find(r => r.teamId === teamId && r.season === season);
const held = (p = proposal(), kind = 'offer') => reserve(plan(), { kind, proposal: p });
const freeze = value => { if (value && typeof value === 'object') {
  Object.values(value).forEach(freeze); Object.freeze(value);
} return value; };
const delayed = (state, p = proposal(), effectiveDate = '2026-07-16') => commit(state, p, { effectiveDate });
function rejectsWithoutMutation(state, action) {
  const snapshot = JSON.stringify(state);
  expect(action).toThrow();
  expect(JSON.stringify(state)).toBe(snapshot);
}
function resolvedFixture(original, actual, kind = 'offer', resolution = 'accepted') {
  return { ...plan(), ledger: applyContractLedgerAction(createContractLedger(), actual),
    resolvedReservations: [{ kind, proposal: original, acceptedProposal: actual, resolution }] };
}

describe('delayed FA settlement in annual spending (not live adoption)', () => {
  it('preserves the offered identity and settles only 4516 of the 5000 held for July 1→16', () => {
    const p = proposal(), state = freeze(held(p)), snapshot = JSON.stringify(state);
    const next = delayed(state, p);
    expect([2026, 2027, 2028].map(y => row(state, y).reservedManYen)).toEqual([5000, 10000, 10000]);
    expect([2026, 2027, 2028].map(y => row(next, y).salaryManYen)).toEqual([4516, 10000, 10000]);
    expect(quote(next).every(r => r.reservedManYen === 0)).toBe(true);
    expect(row(next).remainingManYen - row(state).remainingManYen).toBe(484);
    expect(next.resolvedReservations).toEqual([{ kind: 'offer', proposal: p, resolution: 'accepted',
      acceptedProposal: { ...p, effectiveDate: '2026-07-16' } }]);
    expect(next.ledger.records[0]).toMatchObject({ effectiveDate: '2026-07-16', actionId: p.id, contract: p.contract });
    expect(assess(state, next).ok).toBe(true);
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it.each([
    ['2026-06-30', '2026-07-01', 5033, 5000],
    ['2026-01-31', '2026-02-01', 10000, 10000],
    ['2026-02-01', '2026-03-01', 10000, 9000],
    ['2026-07-01', '2026-07-31', 5000, 4032],
  ])('recalculates payroll from %s to %s without changing the final contract year', (offered, accepted, hold, salary) => {
    const p = proposal({ effectiveDate: offered }), state = held(p), next = delayed(state, p, accepted);
    expect(row(state).reservedManYen).toBe(hold);
    expect(row(next).salaryManYen).toBe(salary);
    expect(next.ledger.records[0].contract).toEqual(p.contract);
    expect(next.ledger.records[0].contract.endSeason).toBe(2028);
  });

  it('keeps same-day histories compatible with the existing two-argument API', () => {
    const p = proposal(), state = freeze(held(p));
    const legacy = commit(state, p), explicit = delayed(state, p, p.effectiveDate);
    expect(explicit).toEqual(legacy);
    expect(explicit.resolvedReservations[0]).not.toHaveProperty('acceptedProposal');
    expect(row(explicit).salaryManYen).toBe(5000);
  });

  it('replays the original proposal after JSON reload and rejects a different settlement or terms', () => {
    const p = proposal(), loaded = JSON.parse(JSON.stringify(delayed(held(p), p)));
    expect(commit(loaded, p)).toBe(loaded);
    expect(delayed(loaded, p)).toBe(loaded);
    expect(reserve(loaded, { kind: 'offer', proposal: p })).toBe(loaded);
    expect(cancel(loaded, p.id)).toBe(loaded);
    rejectsWithoutMutation(loaded, () => delayed(loaded, p, '2026-07-17'));
    rejectsWithoutMutation(loaded, () => commit(loaded, { ...p, effectiveDate: '2026-07-16' }));
    rejectsWithoutMutation(loaded, () => delayed(loaded, proposal({}, { annualSalaryManYen: 12000 })));
    expect(loaded.ledger.records).toHaveLength(1);
  });

  it.each(['2026-06-30', '2026-08-01', '2027-01-01', '2026-02-30', null, 20260716])(
    'rejects invalid or backdated/out-of-year/late settlement %s without changing the hold', date => {
      const p = proposal(), state = freeze(held(p));
      rejectsWithoutMutation(state, () => delayed(state, p, date));
    });

  it.each(['rookie', 'renewal'])('does not let %s reservations change their agreed effective date', kind => {
    const p = kind === 'rookie' ? proposal() : proposal({ effectiveDate: '2027-02-01' },
      { purpose: 'renewal', agreementPhase: 'offseason', termYears: 1 });
    const state = freeze(held(p, kind));
    rejectsWithoutMutation(state, () => delayed(state, p,
      kind === 'rookie' ? '2026-07-16' : '2027-02-02'));
    expect(commit(state, p).resolvedReservations[0]).not.toHaveProperty('acceptedProposal');
  });

  it('requires the exact original held proposal even when a later date is explicitly supplied', () => {
    const p = proposal(), state = freeze(held(p));
    rejectsWithoutMutation(state, () => delayed(state, { ...p, effectiveDate: '2026-07-02' }));
    rejectsWithoutMutation(state, () => delayed(state, proposal({}, { guaranteed: false })));
    rejectsWithoutMutation(state, () => commit(state, { ...p, effectiveDate: '2026-07-16' }));
  });

  it('validates a saved original/accepted pair against the real sign record', () => {
    const p = proposal(), actual = { ...p, effectiveDate: '2026-07-16' };
    const saved = freeze(resolvedFixture(p, actual));
    expect(row(saved).salaryManYen).toBe(4516);
    expect(commit(saved, p)).toBe(saved);
    const missing = { ...saved, resolvedReservations: [{ kind: 'offer', proposal: p, resolution: 'accepted' }] };
    expect(() => quote(missing)).toThrow();
    const originalLedger = { ...saved, ledger: applyContractLedgerAction(createContractLedger(), p) };
    expect(() => quote(originalLedger)).toThrow();
  });

  it.each([
    { teamId: 1 }, { id: 'another-offer' },
    { contract: { annualSalaryManYen: 12000 } }, { contract: { guaranteed: false } },
    { contract: { contractId: 'different' } }, { contract: { playerId: 'other' } },
    { contract: { termYears: 2, endSeason: 2027 } },
    { contract: { registrationType: 'development' } }, { contract: { agreementPhase: 'preseason' } },
  ])('rejects a saved acceptance changing terms beyond the effective date: %j', change => {
    const p = proposal(), actual = { ...p, ...change, effectiveDate: '2026-07-16',
      contract: { ...p.contract, ...change.contract } };
    const saved = freeze(resolvedFixture(p, actual));
    rejectsWithoutMutation(saved, () => quote(saved));
  });

  it.each(['cancelled', 'lost', 'replaced'])('rejects acceptedProposal on a %s resolution', resolution => {
    const p = proposal(), saved = { ...cancel(held(p), p.id) };
    saved.resolvedReservations = [{ kind: 'offer', proposal: p, resolution,
      acceptedProposal: { ...p, effectiveDate: '2026-07-16' } }];
    expect(() => quote(freeze(saved))).toThrow();
  });

  it.each(['offer', 'rookie'])('rejects an invalid delayed record for %s even if the ledger matches it', kind => {
    const p = proposal(), actual = { ...p, effectiveDate: '2026-06-30' };
    expect(() => quote(freeze(resolvedFixture(p, actual, kind)))).toThrow();
  });

  it('does not allow retimed acceptance metadata to be added to or erased from existing history', () => {
    const p = proposal(), next = delayed(held(p), p);
    const rewritten = { ...next, resolvedReservations: [{ ...next.resolvedReservations[0],
      acceptedProposal: { ...p, effectiveDate: '2026-07-17' } }],
    ledger: applyContractLedgerAction(createContractLedger(), { ...p, effectiveDate: '2026-07-17' }) };
    expect(() => assess(next, rewritten)).toThrow();
    const legacy = commit(held(p), p);
    expect(() => assess(legacy, next)).toThrow();
  });

  it('rechecks all future caps but permits a later lower current-year bill that now fits', () => {
    const p = proposal(), state = held(p);
    state.authorizations.find(a => a.teamId === 0 && a.season === 2026).approvedManYen = 4600;
    expect(row(delayed(freeze(state), p)).remainingManYen).toBe(84);
    const short = held(p);
    short.authorizations.find(a => a.teamId === 0 && a.season === 2028).approvedManYen = 9999;
    rejectsWithoutMutation(freeze(short), () => delayed(short, p));
  });

  it('marks competing offers lost in deficit while preserving unrelated rookie and renewal holds', () => {
    const p = proposal(), competitor = proposal({ id: 'competing', teamId: 1 }, { contractId: 'competing-contract' });
    const rookie = proposal({ id: 'rookie' }, { contractId: 'rookie-contract', playerId: 'rookie', termYears: 1, annualSalaryManYen: 420 });
    const renewal = proposal({ id: 'renewal', effectiveDate: '2027-02-01' },
      { contractId: 'renewal-contract', playerId: 'incumbent', purpose: 'renewal', termYears: 1, annualSalaryManYen: 600 });
    let state = reserve(held(p), { kind: 'offer', proposal: competitor });
    state = reserve(reserve(state, { kind: 'rookie', proposal: rookie }), { kind: 'renewal', proposal: renewal });
    state.authorizations.filter(a => a.teamId === 1).forEach(a => { a.approvedManYen = 0; });
    const next = delayed(freeze(state), p);
    expect(next.reservations).toEqual([{ kind: 'rookie', proposal: rookie }, { kind: 'renewal', proposal: renewal }]);
    expect(next.resolvedReservations.find(r => r.proposal.id === competitor.id)).toEqual({
      kind: 'offer', proposal: competitor, resolution: 'lost' });
    expect(row(next, 2026, 1).reservedManYen).toBe(0);
    rejectsWithoutMutation(next, () => delayed(next, competitor));
    expect(reserve(next, { kind: 'offer', proposal: competitor })).toBe(next);
  });
});
