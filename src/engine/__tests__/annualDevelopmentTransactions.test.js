import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as ledgerApply, contractEmploymentAt } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { quoteAnnualTransaction as quote, applyAnnualTransaction as apply } from '../annualTransactions';

const player = (id, extra = {}) => ({ id, name: id, pos: '一塁手', salary: 1000, ...extra });
const sign = (id, teamId, registrationType = 'controlled', salary = 1000, years = 3) => ({
  id: `sign-${id}`, type: 'sign', teamId, effectiveDate: '2026-02-01',
  contract: createSeasonContract({ contractId: `c-${id}`, playerId: id, signedSeason: 2026,
    agreementPhase: 'preseason', purpose: 'acquisition', termYears: years,
    annualSalaryManYen: salary, guaranteed: true, registrationType }),
});
function fixture({ devSalary = 240, devYears = 3, flags = { isIkusei: true } } = {}) {
  let ledger = createContractLedger();
  for (const proposal of [sign('a', 0), sign('b', 1), sign('dev', 0, 'development', devSalary, devYears)]) ledger = ledgerApply(ledger, proposal);
  return { version: 1, season: 2026, date: '2026-07-16', phase: 'season', transactions: [],
    teams: [0, 1].map(id => ({ id, budget: 999, players: [player(id === 0 ? 'a' : 'b')],
      farm: id === 0 ? [player('dev', { ...flags, salary: devSalary, contractYearsLeft: devYears, ikuseiYears: 1 })] : [] })),
    faPool: [], draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} },
    rosterRequirements: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({ teamId, season: 2026 + i, requiredControlledCount: 2 }))),
    spending: { version: 1, budgetSeason: 2026, ledger, reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({ teamId, season: 2026 + i, approvedManYen: 50000, minimumRosterReserveManYen: 0 }))) } };
}
const conversion = (extra = {}) => ({ id: 'convert-1', type: 'convert-to-controlled', teamId: 0,
  playerId: 'dev', contractId: 'c-dev', annualSalaryManYen: 420, ...extra });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const success = result => { expect(result.ok, result.error).toBe(true); return result.state; };
const row = (state, season = 2026, teamId = 0) => quoteAnnualSpendingPlan(state.spending).find(r => r.teamId === teamId && r.season === season);
function reject(state, command = conversion()) {
  const before = JSON.stringify(state), result = apply(freeze(state), command);
  expect(result.ok).toBe(false); expect(result.state).toBe(state); expect(JSON.stringify(state)).toBe(before);
}
function addControlled(state, n) {
  for (let i = 0; i < n; i++) {
    const id = `extra-${i}`;
    state.teams[0].farm.push(player(id, { salary: 420 }));
    state.spending.ledger = ledgerApply(state.spending.ledger, sign(id, 0, 'controlled', 420));
  }
  return state;
}

function withRookieHold(state, metadataDevelopment, registrationType) {
  state.draftContext = { draftPool: [player('rookie', { isIkusei: metadataDevelopment })], drafted: { rookie: 0 }, confirmedPicks: {} };
  const proposal = sign('rookie', 0, registrationType, registrationType === 'development' ? 240 : 420, 1);
  proposal.effectiveDate = state.date;
  state.spending.reservations.push({ kind: 'rookie', proposal });
  return state;
}

function rejectOnQuoteAndReload(state) {
  for (const input of [state, JSON.parse(JSON.stringify(state))]) {
    const snapshot = JSON.stringify(input);
    const preview = quote(freeze(input), conversion());
    expect(preview.ok, preview.error).toBe(false);
    expect(preview.rows).toBeUndefined();
    reject(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  }
}

describe('accepted rookie club and explicit salary admission', () => {
  it.each(['controlled', 'development', undefined])('rejects another club holding an accepted rookie (%s)', registrationType => {
    const state = withRookieHold(fixture(), registrationType === 'development', registrationType);
    if (registrationType === undefined) {
      delete state.spending.reservations[0].proposal.contract.registrationType;
      expect(state.spending.reservations[0].proposal.contract).not.toHaveProperty('registrationType');
      expect(quote(state, conversion()).ok).toBe(true);
    }
    state.spending.reservations[0].proposal.teamId = 1;
    rejectOnQuoteAndReload(state);
  });

  it.each(['controlled', 'development'])('keeps the accepted club and %s class with stale pool duplicates in either order', registrationType => {
    const development = registrationType === 'development';
    for (const reverse of [false, true]) {
      const state = withRookieHold(fixture(), development, registrationType);
      const valid = state.draftContext.draftPool[0];
      const stale = player('rookie', { _drafted: true, _r1winner: 1, isIkusei: !development });
      state.draftContext.draftPool = reverse ? [valid, stale] : [stale, valid];
      // The completed assignment wins over a stale lottery snapshot too.
      state.draftContext.confirmedPicks = { 1: 'rookie' };
      const snapshot = JSON.stringify(state), preview = quote(freeze(state), conversion());
      expect(preview.ok, preview.error).toBe(true);
      expect(quote(JSON.parse(snapshot), conversion())).toEqual(preview);
      const next = success(apply(state, conversion()));
      expect(row(next)).toMatchObject({ reservedManYen: development ? 108 : 190, minimumRosterReserveManYen: 0 });
      expect(row(next, 2026, 1)).toMatchObject({ reservedManYen: 0, minimumRosterReserveManYen: 420 });
      expect(quoteAnnualSpendingPlan(next.spending)).toEqual(preview.rows);
      expect(JSON.stringify(state)).toBe(snapshot);
      const invalid = JSON.parse(snapshot);
      invalid.spending.reservations[0].proposal.teamId = 1;
      rejectOnQuoteAndReload(invalid);
    }
  });

  it.each(['controlled', 'development'])('rejects conflicting accepted clubs for the same %s rookie without any hold', registrationType => {
    for (const reverse of [false, true]) {
      const state = fixture(), isIkusei = registrationType === 'development';
      const pool = [0, 1].map(_r1winner => player('rookie', { _drafted: true, _r1winner, isIkusei }));
      state.draftContext = { draftPool: reverse ? pool.reverse() : pool, drafted: {}, confirmedPicks: {} };
      rejectOnQuoteAndReload(state);
    }
  });

  it('rejects a wrong-club hold even when a conversion would otherwise fit the 70-place boundary', () => {
    const valid = withRookieHold(addControlled(fixture(), 67), false, 'controlled');
    const next = success(apply(valid, conversion()));
    expect(next.teams[0].players.length + next.teams[0].farm.length).toBe(69);
    expect(next.draftContext.drafted.rookie).toBe(0); // The accepted rookie reserves place 70.
    valid.spending.reservations[0].proposal.teamId = 1;
    rejectOnQuoteAndReload(valid);
  });

  it.each([
    ['controlled', 419], ['development', 239],
  ])('rejects a JSON-forged %s rookie hold at %i before deriving maintenance floors', (registrationType, salary) => {
    const state = withRookieHold(fixture(), registrationType === 'development', registrationType);
    // Build a valid proposal first, then simulate corrupted persisted input.
    state.spending.reservations[0].proposal.contract.annualSalaryManYen = salary;
    state.rosterRequirements.forEach(r => { if (r.teamId === 0) r.requiredControlledCount = 3; });
    rejectOnQuoteAndReload(state);
  });

  it.each([
    ['controlled', 'a', 419], ['development', 'dev', 239],
  ])('rejects a JSON-forged active %s player %s salary %i without committing a conversion', (registrationType, playerId, salary) => {
    const state = fixture();
    state.spending.ledger.records.find(r => r.contract.playerId === playerId).contract.annualSalaryManYen = salary;
    rejectOnQuoteAndReload(state);
  });

  it('does not admit a subminimum rookie contract at the 70-place boundary or an overfull 71st conversion', () => {
    for (const extraControlled of [67, 68]) {
      const state = withRookieHold(addControlled(fixture(), extraControlled), false, 'controlled');
      state.spending.reservations[0].proposal.contract.annualSalaryManYen = 419;
      rejectOnQuoteAndReload(state);
    }
  });
});

describe('atomic annual development-to-controlled conversion (not live activation)', () => {
  it('quotes 322/420/420 without mutation, then changes class, rate and floors together', () => {
    const before = freeze(fixture()), snapshot = JSON.stringify(before), preview = quote(before, conversion());
    expect(preview.ok, preview.error).toBe(true); expect(preview.state).toBeUndefined();
    expect(preview.rows.find(r => r.teamId === 0 && r.season === 2026)).toMatchObject({ salaryManYen: 1322, minimumRosterReserveManYen: 0 });
    const next = success(apply(before, conversion()));
    expect([2026, 2027, 2028].map(y => row(next, y).salaryManYen)).toEqual([1322, 1420, 1420]);
    expect(quoteAnnualSpendingPlan(next.spending)).toEqual(preview.rows);
    expect(row(next, 2029).minimumRosterReserveManYen).toBe(840);
    expect(next.teams[0].farm[0]).toMatchObject({ 育成: false, isIkusei: false, salary: 420,
      contractId: 'c-dev', contractYears: 3, contractYearsLeft: 3, ikuseiYears: 0 });
    expect(next.teams.map(t => t.budget)).toEqual([999, 999]);
    expect(next.spending.ledger.records.find(r => r.contract.contractId === 'c-dev').contract.endSeason).toBe(2028);
    expect(next.transactions).toHaveLength(1); expect(JSON.stringify(before)).toBe(snapshot);
  });

  it.each([{ 育成: true, isIkusei: false }, { 育成: false, isIkusei: true }])('converts either legacy flag while retaining farm placement with 28 active players (%j)', flags => {
    const state = fixture({ flags }); addControlled(state, 27);
    state.teams[0].players.push(...state.teams[0].farm.splice(1));
    const next = success(apply(freeze(state), conversion()));
    expect(next.teams[0].players).toHaveLength(28);
    expect(next.teams[0].farm.map(p => p.id)).toEqual(['dev']);
    expect(next.teams[0].farm[0]).toMatchObject({ 育成: false, isIkusei: false });
  });

  it('converts at the same annual rate when an existing development salary exceeds the minimum', () => {
    const next = success(apply(fixture({ devSalary: 600 }), conversion({ annualSalaryManYen: 600 })));
    expect(row(next).salaryManYen).toBe(1600);
    expect(next.teams[0].farm[0]).toMatchObject({ salary: 600, contractYearsLeft: 3, isIkusei: false });
  });

  it('keeps conversion idempotent after JSON reload/date advancement and rejects conflicting or second conversion IDs', () => {
    const next = success(apply(fixture(), conversion())), restored = JSON.parse(JSON.stringify(next));
    restored.date = '2026-08-01';
    expect(success(apply(restored, conversion()))).toBe(restored);
    reject(restored, conversion({ annualSalaryManYen: 421 }));
    reject({ ...restored, date: '2026-07-16' }, conversion({ id: 'convert-again' }));
  });

  it('projects two remaining years in the second season without consuming or resetting the term', () => {
    const state = fixture(); state.season = 2027; state.date = '2027-07-16'; state.spending.budgetSeason = 2027;
    const next = success(apply(state, conversion()));
    expect(next.teams[0].farm[0]).toMatchObject({ contractYears: 3, contractYearsLeft: 2, contractSignedYear: 2026 });
    expect(next.spending.ledger.records.find(r => r.contract.playerId === 'dev').contract.endSeason).toBe(2028);
    expect(row(next, 2027).salaryManYen).toBe(1322);
    expect(row(next, 2028).salaryManYen).toBe(1420);
  });

  it('rechecks changed budgets after a successful quote and rejects all changes atomically', () => {
    const state = fixture(); expect(quote(state, conversion()).ok).toBe(true);
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2028).approvedManYen = 1419;
    reject(state);
  });

  it('allows the exact future-year boundary while rejecting a fresh increase in a deficit despite a released floor', () => {
    const state = fixture();
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2028).approvedManYen = 1420;
    expect(row(success(apply(state, conversion())), 2028).remainingManYen).toBe(0);
    const deficit = fixture(); deficit.spending.authorizations[0].approvedManYen = 1300; reject(deficit);
  });

  it.each([false, true])('accounts for an accepted unowned rookie at 69 controlled players (development=%s)', development => {
    const state = addControlled(fixture(), 68);
    state.draftContext = { draftPool: [player('rookie', development ? { isIkusei: true } : {})], drafted: { rookie: 0 }, confirmedPicks: {} };
    if (development) expect(success(apply(state, conversion())).teams[0].farm.find(p => p.id === 'dev').isIkusei).toBe(false);
    else reject(state);
  });

  it('rejects a 71st controlled player without changing salary or the contract ledger', () => { reject(addControlled(fixture(), 69)); });

  it.each(['2026-02-01', '2026-07-01', '2026-07-31'])('accepts the valid date %s', date => {
    const state = fixture(); state.date = date;
    expect(success(apply(state, conversion())).teams[0].farm[0].salary).toBe(420);
  });

  it.each([
    { annualSalaryManYen: 419 }, { annualSalaryManYen: undefined }, { annualSalaryManYen: 420.5 },
    { teamId: 1 }, { contractId: 'old-contract' }, { playerId: 'missing' }, { effectiveDate: '2026-07-15' },
  ])('rejects invalid or stale command %j', extra => { reject(fixture(), conversion(extra)); });

  it('rejects a decrease even when the proposed salary is above the controlled minimum', () => { reject(fixture({ devSalary: 600 }), conversion({ annualSalaryManYen: 500 })); });

  it('rejects an August conversion, missing authorization and unrecorded contract class', () => {
    const late = fixture(); late.date = '2026-08-01'; reject(late);
    const missingYear = fixture(); missingYear.spending.authorizations = missingYear.spending.authorizations.filter(a => !(a.teamId === 0 && a.season === 2028)); reject(missingYear);
    const unknown = fixture(); delete unknown.spending.ledger.records.find(r => r.contract.playerId === 'dev').contract.registrationType; reject(unknown);
  });

  it('rejects explicit ledger/roster disagreement instead of silently trusting flags', () => {
    const state = fixture(); state.teams[0].players[0].isIkusei = true; reject(state);
    const swapped = fixture(); swapped.teams[0].farm[0].isIkusei = false; reject(swapped);
  });

  it('preserves the converted class and raised rate on a later trade without extending expiry', () => {
    const state = success(apply(fixture(), conversion())); state.date = '2026-07-20';
    const next = success(apply(state, { id: 'trade-after-conversion', type: 'trade', fromId: 0, toId: 1,
      outgoingIds: ['dev'], incomingIds: [], cashManYen: 0, mode: 'spend' }));
    const p = [...next.teams[1].players, ...next.teams[1].farm].find(p => p.id === 'dev');
    expect(p).toMatchObject({ salary: 420, isIkusei: false, contractYearsLeft: 3 });
    expect(contractEmploymentAt(next.spending.ledger, '2026-07-20').find(e => e.contract.playerId === 'dev'))
      .toMatchObject({ registrationType: 'controlled', teamId: 1, contract: { endSeason: 2028 } });
  });

  it('funds an explicitly controlled future renewal independently of the current development flags', () => {
    const state = fixture({ devYears: 1 });
    state.spending.reservations.push({ kind: 'renewal', proposal: { id: 'future', type: 'sign', teamId: 0, effectiveDate: '2027-02-01',
      contract: createSeasonContract({ contractId: 'next-dev', playerId: 'dev', signedSeason: 2026, agreementPhase: 'offseason',
        purpose: 'renewal', termYears: 1, annualSalaryManYen: 600, guaranteed: true, registrationType: 'controlled' }) } });
    const next = success(apply(state, conversion()));
    expect(row(next, 2027)).toMatchObject({ salaryManYen: 1000, reservedManYen: 600, minimumRosterReserveManYen: 0 });
    expect(row(next, 2028).minimumRosterReserveManYen).toBe(420);
  });

  it('does not accept a development-class contract through the controlled-only FA offer path', () => {
    const state = fixture(); state.faPool.push(player('free'));
    const proposal = sign('free', 0, 'development', 420); proposal.effectiveDate = state.date;
    proposal.contract = createSeasonContract({ ...proposal.contract, agreementPhase: 'season' });
    reject(state, { id: 'invalid-fa', type: 'offer-fa', proposal });
  });

  it.each([
    [true, 'controlled'], [false, 'development'],
  ])('rejects conflicting accepted rookie metadata (%s) and recorded class (%s) on quote and apply', (metadataDevelopment, registrationType) => {
    const state = withRookieHold(fixture(), metadataDevelopment, registrationType);
    expect(quote(state, conversion()).ok).toBe(false);
    reject(state);
  });

  it('cannot hide the 71st controlled commitment behind a stale development rookie flag', () => {
    const state = withRookieHold(addControlled(fixture(), 68), true, 'controlled');
    expect(quote(state, conversion()).ok).toBe(false);
    reject(state);
  });

  it.each(['controlled', 'development'])('accepts consistent %s rookie data and counts its actual held cost once', registrationType => {
    const development = registrationType === 'development';
    const next = success(apply(withRookieHold(fixture(), development, registrationType), conversion()));
    expect(row(next)).toMatchObject({ reservedManYen: development ? 108 : 190, minimumRosterReserveManYen: 0 });
  });

  it('compares a typed rookie hold with the assignment-validated duplicate, not an obsolete pool record', () => {
    const state = withRookieHold(fixture(), true, 'development');
    state.draftContext.draftPool.unshift(player('rookie', { isIkusei: false, _drafted: true, _r1winner: 1 }));
    expect(row(success(apply(state, conversion()))).reservedManYen).toBe(108);
  });
});
