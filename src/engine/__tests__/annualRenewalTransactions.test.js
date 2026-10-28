import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as ledgerApply, contractEmploymentAt, closeContractLedgerThrough } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { quoteAnnualTransaction as quote, applyAnnualTransaction as apply } from '../annualTransactions';

const player = (id, extra = {}) => ({ id, name: id, pos: '一塁手', salary: 1000,
  contractId: 'old-' + id, contractYears: 1, contractYearsLeft: 1, contractSignedYear: 2026, ...extra });
const sign = (id, teamId, extra = {}) => ({ id: 'initial-' + id, type: 'sign', teamId, effectiveDate: '2026-02-01',
  contract: createSeasonContract({ contractId: 'old-' + id, playerId: id, signedSeason: 2026,
    agreementPhase: 'preseason', purpose: 'acquisition', termYears: 1, annualSalaryManYen: 1000,
    guaranteed: true, registrationType: 'controlled', ...extra }) });
function fixture({ development = false, phase = 'season', date, years = 1 } = {}) {
  const a = player('a', development ? { isIkusei: true, ikuseiYears: 1, salary: 240 } : {});
  let ledger = ledgerApply(createContractLedger(), sign('a', 0, { termYears: years,
    registrationType: development ? 'development' : 'controlled', annualSalaryManYen: a.salary }));
  ledger = ledgerApply(ledger, sign('b', 1));
  return { version: 1, season: 2026, phase, date: date ?? (phase === 'offseason' ? '2026-12-15' : '2026-07-16'),
    teams: [{ id: 0, budget: 999, players: development ? [] : [a], farm: development ? [a] : [] },
      { id: 1, budget: 999, players: [player('b')], farm: [] }],
    faPool: [], draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} }, transactions: [],
    rosterRequirements: [0, 1].flatMap(teamId => Array.from({ length: 8 }, (_, i) => ({ teamId, season: 2026 + i, requiredControlledCount: 1 }))),
    spending: { version: 1, budgetSeason: phase === 'offseason' ? 2027 : 2026, ledger,
      reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1].flatMap(teamId => Array.from({ length: 8 }, (_, i) => ({ teamId, season: 2026 + i,
        approvedManYen: 50000, minimumRosterReserveManYen: 0 }))) } };
}
const renewal = ({ id = 'renew-a', teamId = 0, playerId = 'a', salary = 1600, years = 3,
  registrationType = 'controlled', phase = 'season', signedSeason = 2026 } = {}) => ({
  id, type: 'sign', teamId, effectiveDate: String(signedSeason + 1) + '-02-01',
  contract: createSeasonContract({ contractId: 'next-' + id, playerId, signedSeason, agreementPhase: phase,
    purpose: 'renewal', termYears: years, annualSalaryManYen: salary, guaranteed: true, registrationType }) });
const offer = (proposal = renewal(), id = 'offer-1', contractId = 'old-a') => ({ id, type: 'offer-renewal', proposal, contractId });
const accept = (extra = {}) => ({ id: 'accept-1', type: 'accept-renewal', proposalId: 'renew-a', contractId: 'old-a', ...extra });
const cancel = (extra = {}) => ({ id: 'cancel-1', type: 'cancel-renewal', proposalId: 'renew-a', ...extra });
const replace = (proposal = renewal({ id: 'renew-2', salary: 1800, years: 2 })) => ({
  id: 'replace-1', type: 'replace-renewal', proposalId: 'renew-a', proposal, contractId: 'old-a' });
const trade = (extra = {}) => ({ id: 'trade-1', type: 'trade', fromId: 0, toId: 1,
  outgoingIds: ['a'], incomingIds: ['b'], cashManYen: 0, mode: 'spend', ...extra });
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const success = r => { expect(r.ok, r.error).toBe(true); return r.state; };
const reload = state => JSON.parse(JSON.stringify(state));
const row = (state, season = 2027, teamId = 0) => quoteAnnualSpendingPlan(state.spending).find(r => r.teamId === teamId && r.season === season);
const owned = state => [...state.teams[0].players, ...state.teams[0].farm][0];
function reject(state, command, error) {
  for (const input of [state, reload(state)]) {
    const snapshot = JSON.stringify(input), preview = quote(freeze(input), freeze(command));
    expect(preview.ok).toBe(false); expect(preview.rows).toBeUndefined();
    const r = apply(input, command);
    expect(r.ok).toBe(false); expect(r.state).toBe(input); expect(JSON.stringify(input)).toBe(snapshot);
    if (error) { expect(preview.error).toMatch(error); expect(r.error).toMatch(error); }
  }
}
const held = (state = fixture(), p = renewal()) => success(apply(state, offer(p)));
const signed = (state = fixture(), p = renewal()) => success(apply(held(state, p), accept({ proposalId: p.id })));

describe('annual renewal transactions, next-season terms without live activation', () => {
  it('quotes and holds future years without touching current salary, roster, legacy budget or the input', () => {
    const state = fixture(), snapshot = JSON.stringify(state), command = offer();
    const preview = quote(freeze(state), freeze(command));
    expect(preview.ok, preview.error).toBe(true); expect(preview.state).toBeUndefined();
    expect(preview.rows.find(r => r.teamId === 0 && r.season === 2026)).toMatchObject({ salaryManYen: 1000, reservedManYen: 0 });
    expect(preview.rows.find(r => r.teamId === 0 && r.season === 2027)).toMatchObject({ salaryManYen: 0, reservedManYen: 1600, minimumRosterReserveManYen: 0 });
    const next = success(apply(state, command));
    expect(next.teams).toEqual(state.teams); expect(next.faPool).toEqual([]); expect(next.draftContext).toEqual(state.draftContext);
    expect(next.spending.ledger).toEqual(state.spending.ledger);
    expect([2027, 2028, 2029].map(y => row(next, y).reservedManYen)).toEqual([1600, 1600, 1600]);
    expect(row(next, 2030).minimumRosterReserveManYen).toBe(420);
    expect(quoteAnnualSpendingPlan(next.spending)).toEqual(preview.rows); expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('accepts one future contract and replaces its hold with the same annual liability', () => {
    const before = held(), oldPlayer = reload(owned(before)), next = success(apply(freeze(before), accept()));
    expect(next.teams).toEqual(before.teams); expect(owned(next)).toEqual(oldPlayer);
    expect(row(next, 2026)).toMatchObject({ salaryManYen: 1000, reservedManYen: 0 });
    expect([2027, 2028, 2029].map(y => row(next, y).salaryManYen)).toEqual([1600, 1600, 1600]);
    expect(row(next).reservedManYen).toBe(0); expect(row(next).remainingManYen).toBe(row(before).remainingManYen);
    expect(next.spending.ledger.records.find(r => r.contract.contractId === 'next-renew-a').contract)
      .toMatchObject({ signedSeason: 2026, startSeason: 2027, endSeason: 2029, termYears: 3, guaranteed: true });
    expect(contractEmploymentAt(next.spending.ledger, '2026-07-16').find(e => e.contract.playerId === 'a').annualSalaryManYen).toBe(1000);
    expect(contractEmploymentAt(next.spending.ledger, '2027-02-01').find(e => e.contract.playerId === 'a').annualSalaryManYen).toBe(1600);
    expect(next.spending.resolvedReservations).toMatchObject([{ kind: 'renewal', resolution: 'accepted', proposal: { id: 'renew-a' } }]);
  });

  it('renews a same-year midseason acquisition from its ledger expiry despite legacy signed-year and remaining-year fields', () => {
    const state = fixture();
    state.spending.ledger.records[0].effectiveDate = '2026-07-01';
    state.spending.ledger.records[0].contract.agreementPhase = 'season';
    owned(state).contractYearsLeft = 99;
    const next = signed(state);
    expect(row(next, 2026).salaryManYen).toBe(500); expect(row(next, 2027).salaryManYen).toBe(1600);
    expect(owned(next)).toMatchObject({ salary: 1000, contractYearsLeft: 99, contractSignedYear: 2026 });
  });

  it.each(['2026-08-01', '2026-11-30'])('accepts a delayed response on %s without the acquisition deadline or a backdated raise', date => {
    const state = { ...held(), date }, next = success(apply(freeze(state), accept()));
    expect(row(next, 2026).salaryManYen).toBe(1000); expect(row(next, 2027).salaryManYen).toBe(1600);
    expect(owned(next).salary).toBe(1000);
  });

  it('accepts a season offer in the same year offseason against next-year authorization, including a closed current year', () => {
    const state = held(); state.phase = 'offseason'; state.date = '2026-12-15'; state.spending.budgetSeason = 2027;
    state.spending.ledger = closeContractLedgerThrough(state.spending.ledger, 2026);
    const next = success(apply(freeze(state), accept()));
    expect(quoteAnnualSpendingPlan(next.spending).some(r => r.season === 2026)).toBe(false);
    expect(row(next)).toMatchObject({ salaryManYen: 1600, reservedManYen: 0 }); expect(owned(next).salary).toBe(1000);
  });

  it.each(['2026-11-15', '2026-12-31'])('offers and accepts an offseason contract dated %s for the next season only', date => {
    const state = fixture({ phase: 'offseason', date }), p = renewal({ phase: 'offseason' });
    const next = signed(freeze(state), p);
    expect(row(next).salaryManYen).toBe(1600); expect(owned(next).salary).toBe(1000);
    expect(next.spending.ledger.records[0].changes).toEqual([]);
  });

  it('requires next-year budgetSeason in offseason and refuses preseason use of the future-renewal command', () => {
    const wrongYear = fixture({ phase: 'offseason' }); wrongYear.spending.budgetSeason = 2026;
    reject(wrongYear, offer(renewal({ phase: 'offseason' })));
    reject(fixture({ phase: 'preseason', date: '2026-02-01' }), offer());
  });

  it('requires a matching offer phase and does not turn an offseason offer into a past phase agreement', () => {
    reject(fixture(), offer(renewal({ phase: 'offseason' })));
    const state = held(fixture({ phase: 'offseason' }), renewal({ phase: 'offseason' }));
    state.phase = 'season'; state.date = '2026-11-15'; state.spending.budgetSeason = 2026;
    reject(state, accept());
  });

  it('checks the seventh year at the exact funding boundary and rejects a one-unit shortage', () => {
    const p = renewal({ years: 7 }), state = fixture();
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2033).approvedManYen = 1600;
    const next = signed(state, p); expect(row(next, 2033).remainingManYen).toBe(0);
    const poor = fixture(); poor.spending.authorizations.find(a => a.teamId === 0 && a.season === 2033).approvedManYen = 1599;
    reject(poor, offer(p));
  });

  it.each(['authorization', 'roster-requirement'])('rejects a missing seventh-year %s without inventing it', kind => {
    const state = fixture(), p = renewal({ years: 7 });
    if (kind === 'authorization') state.spending.authorizations = state.spending.authorizations.filter(a => !(a.teamId === 0 && a.season === 2033));
    else state.rosterRequirements = state.rosterRequirements.filter(a => !(a.teamId === 0 && a.season === 2033));
    reject(state, offer(p));
  });

  it('rechecks the latest authorization when a delayed acceptance follows a successful quote', () => {
    const state = held(); expect(quote(state, accept()).ok).toBe(true);
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2029).approvedManYen = 1599;
    reject(state, accept());
  });

  it('cancels a held offer in deficit, restores maintenance and cannot revive the cancelled offer after JSON reload', () => {
    const state = held(); state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 100;
    const next = success(apply(freeze(state), cancel()));
    expect(row(next)).toMatchObject({ reservedManYen: 0, minimumRosterReserveManYen: 420, remainingManYen: -320 });
    expect(next.spending.resolvedReservations).toMatchObject([{ resolution: 'cancelled' }]);
    expect(success(apply(reload(next), cancel())).transactions).toHaveLength(2);
    reject(reload(next), accept()); reject(reload(next), offer(renewal(), 'revive'));
  });

  it('replaces a hold atomically and rejects an old acceptance after reload', () => {
    const state = held(), next = success(apply(freeze(state), replace()));
    expect(next.spending.reservations.map(h => h.proposal.id)).toEqual(['renew-2']);
    expect(row(next).reservedManYen).toBe(1800); expect(row(next, 2029).reservedManYen).toBe(0);
    expect(next.spending.resolvedReservations).toMatchObject([{ resolution: 'replaced', proposal: { id: 'renew-a' } }]);
    reject(reload(next), accept());
    const accepted = success(apply(reload(next), accept({ id: 'accept-2', proposalId: 'renew-2' })));
    expect(row(accepted).salaryManYen).toBe(1800); expect(owned(accepted).salary).toBe(1000);
  });

  it('keeps the original offer and all histories when its replacement is unaffordable', () => {
    const state = held(); state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 1700;
    reject(state, replace());
  });

  it('does not permit replacement of another player or of an accepted proposal', () => {
    reject(held(), replace(renewal({ id: 'renew-b', playerId: 'b', teamId: 1 })));
    reject(signed(), replace());
  });

  it('requires an explicit replacement instead of holding two renewal offers for the same player', () => {
    reject(held(), offer(renewal({ id: 'second' }), 'offer-second'));
  });

  it.each([{ teamId: 1 }, { playerId: 'missing' }, { signedSeason: 2025 }])('rejects stale or foreign renewal terms %j', extra => {
    reject(fixture(), offer(renewal(extra)));
  });

  it('rejects stale current contract IDs, retirement and an already continuing contract', () => {
    reject(fixture(), offer(renewal(), 'stale', 'wrong-contract'));
    const retired = fixture(); owned(retired)._retireNow = true; reject(retired, offer());
    reject(fixture({ years: 2 }), offer());
    reject(held(), accept({ contractId: 'wrong-contract' }));
  });

  it.each([['controlled', 420], ['development', 240]])('renews a %s player at minimum %i without moving their roster placement', (registrationType, salary) => {
    const state = fixture({ development: registrationType === 'development' });
    const next = signed(state, renewal({ registrationType, salary, years: 2 }));
    expect(owned(next)).toEqual(owned(state)); expect(next.teams[0].farm).toEqual(state.teams[0].farm);
    expect(row(next)).toMatchObject({ salaryManYen: salary, minimumRosterReserveManYen: registrationType === 'development' ? 420 : 0 });
  });

  it.each([['controlled', 419], ['development', 239]])('rejects a forged %s renewal salary %i on quote and apply', (registrationType, salary) => {
    const state = fixture({ development: registrationType === 'development' });
    const p = renewal({ registrationType, salary: salary + 1, years: 2 }); p.contract.annualSalaryManYen = salary;
    reject(state, offer(p));
  });

  it('enforces existing development tenure limits and keeps class conversion outside this renewal command', () => {
    reject(fixture({ development: true }), offer(renewal({ registrationType: 'development', salary: 240, years: 3 })));
    reject(fixture({ development: true }), offer(renewal()));
    reject(fixture(), offer(renewal({ registrationType: 'development', salary: 240, years: 2 })));
  });

  it('requires an explicit new contract class while preserving a readable untyped C-1 current contract', () => {
    const state = fixture(); delete state.spending.ledger.records[0].contract.registrationType;
    expect(row(signed(state)).salaryManYen).toBe(1600);
    const p = renewal(); delete p.contract.registrationType; reject(fixture(), offer(p));
  });

  it('preserves command replay and rejects changed conditions or a second acceptance after JSON reload', () => {
    const state = held(), restored = reload(state);
    expect(success(apply(restored, offer()))).toBe(restored);
    reject(restored, offer(renewal({ salary: 1601 })));
    const next = signed(), again = reload(next); again.date = '2026-08-01';
    expect(success(apply(again, accept()))).toBe(again);
    expect(again.spending.ledger.records).toHaveLength(3);
    reject(again, accept({ id: 'accept-twice' }));
  });

  it('includes accepted but unfunded next-season rookies in the offseason maintenance floor', () => {
    const state = fixture({ phase: 'offseason' });
    state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    const next = held(state, renewal({ phase: 'offseason' }));
    expect(row(next)).toMatchObject({ reservedManYen: 1600, minimumRosterReserveManYen: 420 });
  });
});

describe('future renewal class and current controlled conversion', () => {
  const conversion = () => ({ id: 'convert-a', type: 'convert-to-controlled', teamId: 0,
    playerId: 'a', contractId: 'old-a', annualSalaryManYen: 420 });
  const developmentRenewal = (salary = 240) => renewal({ registrationType: 'development', salary, years: 2 });

  it.each([240, 600])('rejects conversion after accepting a future development contract at %i, without rewriting any terms', salary => {
    const state = signed(fixture({ development: true }), developmentRenewal(salary));
    reject(state, conversion(), /受諾済み.*育成契約/);
  });

  it.each([240, 600])('requires explicit cancellation of an unanswered development renewal at %i', salary => {
    const state = held(fixture({ development: true }), developmentRenewal(salary));
    reject(state, conversion(), /未回答.*育成.*取り消/);
  });

  it('allows cancellation, conversion and a new controlled offer while retaining the cancelled history', () => {
    const cancelled = success(apply(held(fixture({ development: true }), developmentRenewal()), cancel()));
    for (const input of [cancelled, reload(cancelled)]) {
      const snapshot = JSON.stringify(input), history = reload(input.spending.resolvedReservations);
      const preview = quote(freeze(input), conversion());
      expect(preview.ok, preview.error).toBe(true);
      const next = success(apply(input, conversion()));
      expect(owned(next)).toMatchObject({ isIkusei: false, 育成: false, ikuseiYears: 0, salary: 420, contractId: 'old-a' });
      expect(row(next, 2026)).toMatchObject({ salaryManYen: 322, minimumRosterReserveManYen: 0 });
      expect(row(next, 2027)).toMatchObject({ salaryManYen: 0, minimumRosterReserveManYen: 420 });
      expect(next.spending.reservations).toEqual([]);
      expect(next.spending.resolvedReservations).toEqual(history);
      expect(next.spending.ledger.records).toHaveLength(2);
      expect(next.teams[0].budget).toBe(999); expect(next.transactions).toHaveLength(3);
      expect(quoteAnnualSpendingPlan(next.spending)).toEqual(preview.rows);
      expect(JSON.stringify(input)).toBe(snapshot);
      reject(next, accept());
      const p = renewal({ id: 'controlled-reoffer', salary: 420, years: 2 });
      const offered = success(apply(next, offer(p, 'reoffer-controlled')));
      expect(row(offered, 2027)).toMatchObject({ reservedManYen: 420, minimumRosterReserveManYen: 0 });
      expect(offered.spending.resolvedReservations).toEqual(history);
    }
  });

  it.each([false, true])('preserves an already controlled future contract (conversion boundary: %s)', convertedFuture => {
    const state = fixture({ development: true });
    const p = renewal({ salary: convertedFuture ? 240 : 600, years: 2,
      registrationType: convertedFuture ? 'development' : 'controlled' });
    state.spending.ledger = ledgerApply(state.spending.ledger, p);
    if (convertedFuture) state.spending.ledger = ledgerApply(state.spending.ledger, {
      id: 'future-controlled', type: 'convert-to-controlled', teamId: 0, contractId: p.contract.contractId,
      effectiveDate: '2027-02-01', annualSalaryManYen: 600 });
    for (const input of [state, reload(state)]) {
      const snapshot = JSON.stringify(input), future = reload(input.spending.ledger.records.at(-1));
      const preview = quote(freeze(input), conversion()); expect(preview.ok, preview.error).toBe(true);
      const next = success(apply(input, conversion()));
      expect(next.spending.ledger.records.at(-1)).toEqual(future);
      expect(next.spending.ledger.records[0].contract).toEqual(input.spending.ledger.records[0].contract);
      expect(next.spending.resolvedReservations).toEqual(input.spending.resolvedReservations);
      expect(owned(next)).toMatchObject({ isIkusei: false, 育成: false, salary: 420 });
      expect(next.teams[0].players).toEqual([]); expect(next.teams[0].farm).toHaveLength(1);
      expect(row(next, 2026)).toMatchObject({ salaryManYen: 322, minimumRosterReserveManYen: 0 });
      expect(row(next, 2027)).toMatchObject({ salaryManYen: 600, minimumRosterReserveManYen: 0 });
      const futureControlled = contractEmploymentAt(next.spending.ledger, '2027-02-01')
        .filter(e => e.teamId === 0 && e.registrationType === 'controlled');
      expect(futureControlled).toHaveLength(1);
      expect(futureControlled[0]).toMatchObject({ annualSalaryManYen: 600,
        contract: { contractId: p.contract.contractId, endSeason: 2028, guaranteed: true } });
      expect(quoteAnnualSpendingPlan(next.spending)).toEqual(preview.rows);
      expect(JSON.stringify(input)).toBe(snapshot);
    }
  });

  it('keeps an ordinary conversion without future contracts valid after JSON reload', () => {
    const state = fixture({ development: true });
    for (const input of [state, reload(state)]) {
      const next = success(apply(freeze(input), conversion()));
      expect(row(next, 2026).salaryManYen).toBe(322);
      expect(owned(next)).toMatchObject({ isIkusei: false, 育成: false, salary: 420, contractId: 'old-a' });
      expect(next.spending.ledger.records).toHaveLength(2);
      expect(next.spending.reservations).toEqual([]); expect(next.spending.resolvedReservations).toEqual([]);
    }
  });

  it.each(['pending', 'accepted'])('rejects a persisted controlled player with a conflicting %s development renewal before replay', kind => {
    const p = developmentRenewal();
    const state = kind === 'pending' ? held(fixture({ development: true }), p) : signed(fixture({ development: true }), p);
    // Reproduce an old saved state using valid ledger boundaries, without
    // relying on the annual command under test to manufacture the corruption.
    state.spending.ledger = ledgerApply(state.spending.ledger, { id: 'legacy-conversion',
      type: 'convert-to-controlled', teamId: 0, contractId: 'old-a', effectiveDate: state.date, annualSalaryManYen: 420 });
    state.teams[0].farm[0] = { ...owned(state), isIkusei: false, 育成: false, ikuseiYears: 0, salary: 420 };
    reject(state, offer(p), kind === 'pending' ? /未回答.*育成.*取り消/ : /受諾済み.*育成契約/);
  });

  it.each(['pending', 'accepted'])('does not block conversion for another player\'s %s development renewal', kind => {
    const state = fixture({ development: true }), team = state.teams[1];
    team.farm = [{ ...team.players[0], isIkusei: true, ikuseiYears: 1, salary: 240 }]; team.players = [];
    state.spending.ledger.records[1].contract = sign('b', 1, {
      registrationType: 'development', annualSalaryManYen: 240 }).contract;
    const p = renewal({ id: 'renew-b', teamId: 1, playerId: 'b', registrationType: 'development', salary: 240, years: 2 });
    let before = success(apply(state, offer(p, 'offer-b', 'old-b')));
    if (kind === 'accepted') before = success(apply(before, accept({ id: 'accept-b', proposalId: p.id, contractId: 'old-b' })));
    const next = success(apply(freeze(before), conversion()));
    expect(next.spending.reservations).toEqual(before.spending.reservations);
    expect(next.spending.resolvedReservations).toEqual(before.spending.resolvedReservations);
    expect(next.teams[1]).toEqual(before.teams[1]); expect(owned(next).isIkusei).toBe(false);
  });
});

describe('renewals carried through existing trade transactions', () => {
  it('transfers current and signed future employment together without extending the future contract', () => {
    const before = signed(), snapshot = JSON.stringify(before), preview = quote(freeze(before), trade());
    expect(preview.ok, preview.error).toBe(true);
    const next = success(apply(before, trade()));
    expect(next.teams.map(t => t.players[0].id)).toEqual(['b', 'a']);
    expect(contractEmploymentAt(next.spending.ledger, '2026-07-16').find(e => e.contract.playerId === 'a').teamId).toBe(1);
    expect(contractEmploymentAt(next.spending.ledger, '2027-02-01').find(e => e.contract.playerId === 'a'))
      .toMatchObject({ teamId: 1, annualSalaryManYen: 1600, contract: { contractId: 'next-renew-a', endSeason: 2029, guaranteed: true } });
    expect(row(next, 2027, 0)).toMatchObject({ salaryManYen: 0, minimumRosterReserveManYen: 420 });
    expect(row(next, 2027, 1)).toMatchObject({ salaryManYen: 1600, minimumRosterReserveManYen: 0 });
    expect(quoteAnnualSpendingPlan(next.spending)).toEqual(preview.rows); expect(JSON.stringify(before)).toBe(snapshot);
    const restored = reload(next); expect(success(apply(restored, trade()))).toBe(restored);
    expect(success(apply(restored, accept()))).toBe(restored);
  });

  it('cancels an unanswered renewal during an ordinary trade and rejects the obsolete response', () => {
    const state = held(), next = success(apply(freeze(state), trade()));
    expect(next.spending.reservations).toEqual([]);
    expect(next.spending.resolvedReservations).toMatchObject([{ resolution: 'cancelled', proposal: { id: 'renew-a', teamId: 0 } }]);
    reject(reload(next), accept());
    expect(row(next)).toMatchObject({ salaryManYen: 0, reservedManYen: 0, minimumRosterReserveManYen: 420 });
  });

  it('does not use implicit offer cancellation to relax the existing cashless-trade exception', () => {
    reject(held(), trade({ mode: 'cashless-trade' }));
  });

  it('rejects a future buyer shortage atomically even when the current-year swap is affordable', () => {
    const state = signed(fixture(), renewal({ years: 7 }));
    state.spending.authorizations.find(a => a.teamId === 1 && a.season === 2033).approvedManYen = 1599;
    reject(state, trade());
  });

  it('keeps future transfer history coherent through a second trade and a JSON roundtrip', () => {
    const first = success(apply(signed(), trade())); first.date = '2026-07-20';
    const next = success(apply(reload(first), trade({ id: 'trade-back', fromId: 1, toId: 0 })));
    const future = next.spending.ledger.records.find(r => r.contract.contractId === 'next-renew-a');
    expect(future.changes.map(a => [a.teamId, a.toTeamId, a.effectiveDate])).toEqual([
      [0, 1, '2027-02-01'], [1, 0, '2027-02-01'] ]);
    expect(contractEmploymentAt(next.spending.ledger, '2027-02-01').find(e => e.contract.playerId === 'a').teamId).toBe(0);
    expect(future.contract.endSeason).toBe(2029); expect(row(next).salaryManYen).toBe(1600);
  });

  it('still refuses a scheduled future transfer on a currently active contract', () => {
    const state = fixture();
    state.spending.ledger = ledgerApply(state.spending.ledger, { id: 'future-active', type: 'transfer', contractId: 'old-a',
      teamId: 0, toTeamId: 1, effectiveDate: '2026-07-20' });
    reject(state, offer());
  });

  it('rejects a forged future owner that does not match the current roster', () => {
    const state = signed();
    state.spending.ledger = ledgerApply(state.spending.ledger, { id: 'forged-future', type: 'transfer',
      contractId: 'next-renew-a', teamId: 0, toTeamId: 1, effectiveDate: '2027-02-01' });
    reject(state, trade());
  });
});
