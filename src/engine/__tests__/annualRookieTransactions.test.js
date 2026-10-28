import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as ledgerApply, contractEmploymentAt } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { evaluateRosterCapacity } from '../rosterCapacity';
import { quoteAnnualTransaction as quote, applyAnnualTransaction as apply } from '../annualTransactions';

const player = (id, extra = {}) => ({ id, name: id, pos: '一塁手', salary: 1000, ...extra });
const sign = (id, teamId) => ({ id: `initial-${id}`, type: 'sign', teamId, effectiveDate: '2026-02-01',
  contract: createSeasonContract({ contractId: `c-${id}`, playerId: id, signedSeason: 2026,
    agreementPhase: 'preseason', purpose: 'acquisition', termYears: 3,
    annualSalaryManYen: 1000, guaranteed: true, registrationType: 'controlled' }) });
function fixture({ development = false, required = 2 } = {}) {
  let ledger = createContractLedger();
  for (const [id, teamId] of [['a', 0], ['b', 1]]) ledger = ledgerApply(ledger, sign(id, teamId));
  return { version: 1, season: 2026, phase: 'offseason', date: '2026-11-20', transactions: [],
    teams: [0, 1].map(id => ({ id, budget: 999, players: [player(id === 0 ? 'a' : 'b')], farm: [] })),
    faPool: [], draftContext: { draftPool: [player('rookie', { isIkusei: development, salary: development ? 240 : 600 })],
      drafted: { rookie: 0 }, confirmedPicks: {} },
    rosterRequirements: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({
      teamId, season: 2026 + i, requiredControlledCount: required }))),
    spending: { version: 1, budgetSeason: 2027, ledger, reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({
        teamId, season: 2026 + i, approvedManYen: 50000, minimumRosterReserveManYen: 0 }))) } };
}
const proposal = (registrationType = 'controlled', extra = {}) => ({ id: 'rookie-offer', type: 'sign', teamId: 0,
  effectiveDate: '2027-02-01', contract: createSeasonContract({ contractId: 'c-rookie', playerId: 'rookie',
    signedSeason: 2026, agreementPhase: 'offseason', purpose: 'acquisition', termYears: 1,
    annualSalaryManYen: registrationType === 'development' ? 240 : 600, guaranteed: true, registrationType, ...extra }) });
const reserve = (p = proposal(), id = 'reserve') => ({ id, type: 'reserve-rookie', proposal: p });
const decline = (extra = {}) => ({ id: 'decline', type: 'decline-rookie', teamId: 0, playerId: 'rookie', ...extra });
const join = (extra = {}) => ({ id: 'join', type: 'join-rookie', proposalId: 'rookie-offer', ...extra });
const row = (state, teamId = 0, season = 2027) => quoteAnnualSpendingPlan(state.spending).find(r => r.teamId === teamId && r.season === season);
const capacity = (state, teamId = 0) => evaluateRosterCapacity(state.teams.find(t => t.id === teamId), { ...state.draftContext, teams: state.teams });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const success = result => { expect(result.ok, result.error).toBe(true); return result.state; };
function reject(state, command) {
  const before = JSON.stringify(state);
  expect(quote(freeze(state), command).ok).toBe(false);
  const result = apply(state, command);
  expect(result.ok).toBe(false); expect(result.state).toBe(state); expect(JSON.stringify(state)).toBe(before);
  return result;
}

describe('accepted rookie reservation and decline (opt-in engine only)', () => {
  it.each(['controlled', 'development'])('reserves the actual %s annual salary without adding a roster player', type => {
    const state = freeze(fixture({ development: type === 'development', required: type === 'development' ? 1 : 2 }));
    const before = JSON.stringify(state), p = proposal(type), preview = quote(state, reserve(p));
    expect(preview.ok, preview.error).toBe(true); expect(preview.state).toBeUndefined();
    const next = success(apply(state, reserve(p)));
    expect(next.teams).toEqual(state.teams); expect(next.draftContext).toEqual(state.draftContext);
    expect(next.spending.ledger).toEqual(state.spending.ledger); expect(next.spending.oneOffCosts).toEqual([]);
    expect(next.spending.authorizations.filter(a => a.season === 2026)).toEqual(state.spending.authorizations.filter(a => a.season === 2026));
    expect(row(next)).toMatchObject({ salaryManYen: 1000, reservedManYen: type === 'development' ? 240 : 600,
      minimumRosterReserveManYen: 0, remainingManYen: type === 'development' ? 48760 : 48400 });
    expect(row(next, 0, 2028).reservedManYen).toBe(0);
    expect(next.spending.reservations).toEqual([{ kind: 'rookie', proposal: p }]);
    expect(quoteAnnualSpendingPlan(next.spending)).toEqual(preview.rows);
    expect(capacity(next).acceptedPickCount).toBe(type === 'development' ? 0 : 1);
    expect(JSON.stringify(state)).toBe(before);
    const restored = JSON.parse(JSON.stringify(next));
    expect(success(apply(restored, reserve(p)))).toBe(restored);
    reject(restored, reserve(proposal(type, { annualSalaryManYen: 700 })));
    reject(restored, reserve(p, 'reserve-again'));
  });
  it('does not use a development rookie to fund a missing controlled place', () => {
    const next = success(apply(fixture({ development: true }), reserve(proposal('development'))));
    expect(row(next)).toMatchObject({ reservedManYen: 240, minimumRosterReserveManYen: 420, remainingManYen: 48340 });
  });
  it.each(['controlled', 'development'])('declines a funded %s rookie and cancels only that reservation', type => {
    let state = success(apply(fixture({ development: type === 'development', required: 1 }), reserve(proposal(type))));
    const other = { ...proposal(), id: 'other', contract: { ...proposal().contract, contractId: 'c-other', playerId: 'other' } };
    state.draftContext.draftPool.push(player('other')); state.draftContext.drafted.other = 0;
    state = success(apply(state, reserve(other, 'reserve-other')));
    const next = success(apply(freeze(state), decline()));
    expect(next.draftContext.drafted.rookie).toBe('refused');
    expect(next.draftContext.draftPool).toEqual(state.draftContext.draftPool);
    expect(next.spending.reservations).toEqual([{ kind: 'rookie', proposal: other }]);
    expect(next.spending.resolvedReservations).toEqual([{ kind: 'rookie', proposal: proposal(type), resolution: 'cancelled' }]);
    expect(next.teams).toEqual(state.teams); expect(next.spending.ledger).toEqual(state.spending.ledger);
    expect(row(next)).toMatchObject({ reservedManYen: 600, minimumRosterReserveManYen: 0 });
    expect(capacity(next).acceptedPickIds).toEqual(['other']);
    const restored = JSON.parse(JSON.stringify(next));
    expect(success(apply(restored, decline()))).toBe(restored);
    reject(restored, decline({ id: 'decline-again' })); reject(restored, reserve(proposal(type), 'revive'));
  });
  it('releases an unfunded accepted place in deficit without inventing contract expense', () => {
    const state = fixture({ required: 1 }); state.spending.authorizations.forEach(a => { a.approvedManYen = 900; });
    expect(capacity(state).acceptedPickCount).toBe(1);
    const next = success(apply(state, decline()));
    expect(capacity(next).acceptedPickCount).toBe(0);
    expect(row(next)).toMatchObject({ salaryManYen: 1000, reservedManYen: 0, minimumRosterReserveManYen: 0, remainingManYen: -100 });
    expect(next.spending.resolvedReservations).toEqual([]);
  });
  it('can cancel actual rookie funding after the club becomes insolvent', () => {
    const state = success(apply(fixture({ required: 1 }), reserve()));
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 900;
    const next = success(apply(state, decline()));
    expect(row(next)).toMatchObject({ reservedManYen: 0, remainingManYen: -100 });
  });
  it.each(['controlled', 'development'])('uses the valid acquiring club and %s class despite stale duplicate metadata', type => {
    for (const reverse of [false, true]) {
      const state = fixture({ development: type === 'development', required: 1 });
      const valid = state.draftContext.draftPool[0], stale = player('rookie', { _drafted: true, _r1winner: 1, isIkusei: type !== 'development' });
      state.draftContext.draftPool = reverse ? [valid, stale] : [stale, valid];
      state.draftContext.confirmedPicks = { 1: 'rookie' };
      const next = success(apply(state, reserve(proposal(type))));
      expect(row(next).reservedManYen).toBe(type === 'development' ? 240 : 600);
      expect(row(next, 1).reservedManYen).toBe(0);
      const refused = success(apply(JSON.parse(JSON.stringify(next)), decline()));
      expect(capacity(refused).acceptedPickCount).toBe(0);
    }
  });
  it.each(['unassigned', 'refused', 'other-team', 'retired', 'market', 'owned'])('rejects %s targets without changing either club', kind => {
    const state = fixture();
    if (kind === 'unassigned') state.draftContext.drafted = {};
    if (kind === 'refused') state.draftContext.drafted.rookie = 'refused';
    if (kind === 'other-team') state.draftContext.drafted.rookie = 1;
    if (kind === 'retired') state.draftContext.draftPool[0].isRetired = true;
    if (kind === 'market') state.faPool.push(player('rookie'));
    if (kind === 'owned') {
      state.teams[0].farm.push(player('rookie'));
      state.spending.ledger = ledgerApply(state.spending.ledger, sign('rookie', 0));
    }
    reject(state, reserve()); reject(state, decline());
  });
  it.each(['controlled', 'development'])('requires explicit matching %s contract classification', type => {
    const state = fixture({ development: type === 'development' });
    reject(state, reserve(proposal(type === 'development' ? 'controlled' : 'development')));
    const p = proposal(type); delete p.contract.registrationType;
    reject(state, reserve(p));
  });
  it.each(['wrong-date', 'wrong-purpose', 'wrong-season', 'wrong-phase', 'multiple-years', 'low-salary', 'bad-salary'])('rejects %s terms rather than repairing them', kind => {
    const p = proposal();
    if (kind === 'wrong-date') p.effectiveDate = '2027-02-02';
    if (kind === 'wrong-purpose') p.contract.purpose = 'renewal';
    if (kind === 'wrong-season') p.contract.signedSeason = 2025;
    if (kind === 'wrong-phase') p.contract.agreementPhase = 'preseason';
    if (kind === 'multiple-years') p.contract = createSeasonContract({ ...p.contract, termYears: 2 });
    if (kind === 'low-salary') p.contract.annualSalaryManYen = 419;
    if (kind === 'bad-salary') p.contract.annualSalaryManYen = NaN;
    reject(fixture(), reserve(p));
  });
  it('rechecks next-year budget and requires all authorizations and roster requirements', () => {
    const state = fixture(); expect(quote(state, reserve()).ok).toBe(true);
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 1599;
    reject(state, reserve());
    const missing = fixture(); missing.spending.authorizations = missing.spending.authorizations.filter(a => a.teamId !== 0 || a.season !== 2027);
    reject(missing, reserve());
    const noFloor = fixture(); noFloor.rosterRequirements = noFloor.rosterRequirements.filter(r => r.teamId !== 0 || r.season !== 2027);
    reject(noFloor, reserve());
  });
  it('rejects a second differently identified reservation for the same rookie', () => {
    const state = success(apply(fixture(), reserve()));
    const second = { ...proposal(), id: 'second', contract: { ...proposal().contract, contractId: 'c-second' } };
    reject(state, reserve(second, 'second-submit'));
  });
  it('rejects reservation outside offseason and decline with stale or incomplete identities', () => {
    const state = fixture(); state.phase = 'season'; state.spending.budgetSeason = 2026; state.date = '2026-07-01';
    reject(state, reserve());
    reject(fixture(), decline({ teamId: 1 }));
    reject(fixture(), decline({ teamId: '0' }));
    reject(fixture(), { id: 'bad', type: 'decline-rookie', teamId: 0 });
    reject(fixture(), { ...reserve(), minimumRosterReserveManYen: 0 });
  });
});

function spring(state) {
  return { ...JSON.parse(JSON.stringify(state)), season: 2027, date: '2027-03-01', phase: 'preseason' };
}
function funded(development = false, required = 2) {
  return success(apply(fixture({ development, required }), reserve(proposal(development ? 'development' : 'controlled'))));
}
function fillControlled(state, count) {
  for (let i = 0; i < count; i++) {
    const id = `extra-${i}`;
    state.teams[0].farm.push(player(id));
    state.spending.ledger = ledgerApply(state.spending.ledger, sign(id, 0));
  }
  state.spending.authorizations.forEach(a => { a.approvedManYen = 1000000; });
  return state;
}

describe('joining funded rookies before opening day', () => {
  it.each(['controlled', 'development'])('joins a %s rookie in farm, replacing its hold with one exact annual liability', type => {
    const state = freeze(spring(funded(type === 'development', 1))), before = JSON.stringify(state);
    const preview = quote(state, join());
    expect(preview.ok, preview.error).toBe(true); expect(preview.state).toBeUndefined();
    const next = success(apply(state, join())), salary = type === 'development' ? 240 : 600;
    expect(next.teams[0].players).toEqual(state.teams[0].players);
    expect(next.teams[0].farm).toHaveLength(1);
    expect(next.teams[0].farm[0]).toMatchObject({ id: 'rookie', salary, contractId: 'c-rookie',
      contractYears: 1, contractYearsLeft: 1, contractSignedYear: 2026, ikuseiYears: 0,
      育成: type === 'development', isIkusei: type === 'development', isFA: false });
    expect(next.teams.map(t => t.budget)).toEqual([999, 999]);
    expect(next.teams[1]).toEqual(state.teams[1]); expect(next.draftContext).toEqual(state.draftContext);
    expect(row(next)).toMatchObject({ salaryManYen: 1000 + salary, reservedManYen: 0,
      minimumRosterReserveManYen: 0, remainingManYen: type === 'development' ? 48760 : 48400 });
    expect(row(next).remainingManYen).toBe(row(state).remainingManYen);
    expect(row(next, 0, 2028).salaryManYen).toBe(1000);
    expect(next.spending.oneOffCosts).toEqual([]); expect(next.spending.reservations).toEqual([]);
    expect(next.spending.resolvedReservations).toEqual([{ kind: 'rookie', proposal: proposal(type), resolution: 'accepted' }]);
    expect(next.spending.ledger.records.find(r => r.contract.playerId === 'rookie')).toMatchObject({
      actionId: 'rookie-offer', initialTeamId: 0, effectiveDate: '2027-02-01', contract: proposal(type).contract, changes: [] });
    expect(contractEmploymentAt(next.spending.ledger, '2027-03-01').find(e => e.contract.playerId === 'rookie'))
      .toMatchObject({ teamId: 0, registrationType: type, annualSalaryManYen: salary });
    expect(capacity(next)).toMatchObject({ controlledCount: type === 'development' ? 1 : 2,
      developmentCount: type === 'development' ? 1 : 0, acceptedPickCount: 0 });
    expect(quoteAnnualSpendingPlan(next.spending)).toEqual(preview.rows); expect(JSON.stringify(state)).toBe(before);
    const restored = JSON.parse(JSON.stringify(next));
    expect(success(apply(restored, join()))).toBe(restored);
    expect(success(apply(restored, reserve(proposal(type))))).toBe(restored);
    reject(restored, join({ id: 'join-twice' })); reject(restored, decline());
  });
  it('preserves the missing controlled floor after development joins', () => {
    const state = spring(funded(true)), next = success(apply(state, join()));
    expect(row(next)).toMatchObject({ salaryManYen: 1240, reservedManYen: 0, minimumRosterReserveManYen: 420, remainingManYen: 48340 });
  });
  it('uses the accepted controlled reservation as the 70th place, not a 71st place', () => {
    const state = fillControlled(spring(funded()), 68);
    expect(capacity(state)).toMatchObject({ controlledCount: 69, acceptedPickCount: 1, remainingSlots: 0 });
    const next = success(apply(state, join()));
    expect(capacity(next)).toMatchObject({ controlledCount: 70, acceptedPickCount: 0, overBy: 0 });
    expect(next.teams[0].farm.filter(p => p.id === 'rookie')).toHaveLength(1);
  });
  it.each([{ isIkusei: true }, { 育成: true }])('allows a real development newcomer at 70 controlled players (%j)', flags => {
    const state = fillControlled(spring(funded(true, 1)), 69);
    state.draftContext.draftPool[0] = player('rookie', { salary: 240, ...flags });
    const next = success(apply(state, join()));
    expect(capacity(next)).toMatchObject({ controlledCount: 70, developmentCount: 1, overBy: 0, acceptedPickCount: 0 });
    expect(next.teams[0].farm.find(p => p.id === 'rookie')).toMatchObject({ isIkusei: true, 育成: true, salary: 240 });
    expect(row(next)).toMatchObject({ reservedManYen: 0, minimumRosterReserveManYen: 0 });
  });
  it('rejects an overfull 71st controlled acquisition without consuming any hold', () => {
    reject(fillControlled(spring(funded()), 69), join());
  });
  it.each(['controlled', 'development'])('joins only canonical %s metadata, in either duplicate order', type => {
    for (const reverse of [false, true]) {
      const state = spring(funded(type === 'development', 1));
      const valid = state.draftContext.draftPool[0], stale = player('rookie', { _drafted: true, _r1winner: 1, isIkusei: type !== 'development', name: 'stale' });
      state.draftContext.draftPool = reverse ? [valid, stale] : [stale, valid];
      state.draftContext.confirmedPicks = { 1: 'rookie' };
      const next = success(apply(state, join()));
      expect(next.teams[0].farm[0]).toMatchObject({ id: 'rookie', name: 'rookie', isIkusei: type === 'development' });
      expect(next.teams[1].farm).toEqual([]);
    }
  });
  it.each(['refused', 'other-team', 'changed-class', 'retired', 'market', 'untyped'])('rejects %s stale assignment or terms at join time', kind => {
    const state = spring(funded());
    if (kind === 'refused') state.draftContext.drafted.rookie = 'refused';
    if (kind === 'other-team') state.draftContext.drafted.rookie = 1;
    if (kind === 'changed-class') state.draftContext.draftPool[0].isIkusei = true;
    if (kind === 'retired') state.draftContext.draftPool[0]._retireNow = true;
    if (kind === 'market') state.faPool.push(player('rookie'));
    if (kind === 'untyped') delete state.spending.reservations[0].proposal.contract.registrationType;
    reject(state, join());
  });
  it('rejects a cancelled or missing reservation even when an accepted pick remains', () => {
    reject(spring(fixture()), join());
    reject(spring(success(apply(funded(), decline()))), join());
    reject(spring(funded()), join({ proposalId: 'unknown' }));
  });
  it.each(['offseason', 'before-effective', 'regular-season', 'wrong-year', 'not-offseason-agreement', 'wrong-start', 'multiple-years'])('rejects %s join dates and phases without projecting a future player', kind => {
    const state = spring(funded());
    if (kind === 'offseason') { state.phase = 'offseason'; state.season = 2026; state.date = '2026-12-01'; }
    if (kind === 'before-effective') state.date = '2027-01-31';
    if (kind === 'regular-season') state.phase = 'season';
    if (kind === 'wrong-year') { state.season = 2028; state.date = '2028-02-01'; state.spending.budgetSeason = 2028; }
    if (kind === 'not-offseason-agreement') state.spending.reservations[0].proposal.contract = createSeasonContract({ ...proposal().contract, signedSeason: 2027, agreementPhase: 'preseason' });
    if (kind === 'wrong-start') state.spending.reservations[0].proposal.effectiveDate = '2027-02-02';
    if (kind === 'multiple-years') state.spending.reservations[0].proposal.contract = createSeasonContract({ ...proposal().contract, termYears: 2 });
    reject(state, join());
  });
  it('admits the exact February 1 boundary and revalidates funding after a successful quote', () => {
    const state = spring(funded()); state.date = '2027-02-01';
    expect(quote(state, join()).ok).toBe(true);
    const next = success(apply(state, join())); expect(row(next).salaryManYen).toBe(1600);
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 1599;
    reject(state, join());
  });
  it('retains other clubs and other rookie holds when joining one player', () => {
    let state = funded();
    const other = { ...proposal(), id: 'other', teamId: 1,
      contract: { ...proposal().contract, contractId: 'c-other', playerId: 'other' } };
    state.draftContext.draftPool.push(player('other')); state.draftContext.drafted.other = 1;
    state = spring(success(apply(state, reserve(other, 'reserve-other'))));
    const next = success(apply(state, join()));
    expect(next.spending.reservations).toEqual([{ kind: 'rookie', proposal: other }]);
    expect(next.teams[1]).toEqual(state.teams[1]); expect(row(next, 1)).toEqual(row(state, 1));
  });
});
