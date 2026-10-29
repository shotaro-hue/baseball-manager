import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as ledgerApply } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { applyAnnualTransaction as apply, quoteAnnualTransaction as quote } from '../annualTransactions';

const json = x => JSON.parse(JSON.stringify(x));
const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '一塁手', salary: 1000, ...extra });
const entry = (extra = {}) => ({ id: 'listing', kind: 'domestic-fa', enteredDate: '2026-11-01',
  originTeamId: 1, compensationRank: 'A', compensationBasis: { previousAnnualSalaryManYen: 10000, exercise: 'first' }, ...extra });
const free = (extra = {}) => player('free', { isFA: true, entryType: '高卒', daysOnActiveRoster: 1080, marketEntry: entry(), ...extra });
const sign = (id, teamId, dev = false) => ({ id: `initial-${id}`, type: 'sign', teamId, effectiveDate: '2026-02-01',
  contract: createSeasonContract({ contractId: `old-${id}`, playerId: id, signedSeason: 2026, agreementPhase: 'preseason',
    purpose: 'acquisition', termYears: 3, annualSalaryManYen: dev ? 240 : 1000, registrationType: dev ? 'development' : 'controlled', guaranteed: true }) });
function fixture(p = free()) {
  let ledger = createContractLedger(); for (const [id, teamId] of [['a', 0], ['b', 1], ['c', 2]]) ledger = ledgerApply(ledger, sign(id, teamId));
  return { version: 1, season: 2026, phase: 'offseason', date: '2026-11-20', transactions: [],
    teams: [0, 1, 2].map(id => ({ id, budget: 999, players: [player(['a', 'b', 'c'][id])], farm: [] })),
    faPool: [p], draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} },
    rosterRequirements: [0, 1, 2].flatMap(teamId => [2026, 2027, 2028, 2029].map(season => ({ teamId, season, requiredControlledCount: 2 }))),
    spending: { version: 1, budgetSeason: 2027, ledger, reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1, 2].flatMap(teamId => [2026, 2027, 2028, 2029].map(season => ({ teamId, season, approvedManYen: 100000, minimumRosterReserveManYen: 0 }))) } };
}
const proposal = (p = free(), { id = 'bid', teamId = 0 } = {}) => ({ id, type: 'sign', teamId,
  offeredDate: '2026-11-20', effectiveDate: '2027-02-01', marketEntry: json(p.marketEntry),
  contract: createSeasonContract({ contractId: `new-${id}`, playerId: p.id, signedSeason: 2026, agreementPhase: 'offseason',
    purpose: 'acquisition', termYears: 3, annualSalaryManYen: 20000, registrationType: 'controlled', guaranteed: true }) });
const offer = (p = proposal(), id = 'submit') => ({ id, type: 'offer-fa', proposal: p });
const accept = (proposalId = 'bid', id = 'accept') => ({ id, type: 'accept-fa', proposalId });
const settle = (extra = {}) => ({ id: 'settle', type: 'settle-fa-compensation', proposalId: 'bid', teamId: 1, method: 'cash-only', ...extra });
const join = (proposalId = 'bid') => ({ id: 'join', type: 'join-fa', proposalId });
const success = r => { expect(r.ok, r.error).toBe(true); return r.state; };
const held = (state = fixture(), p = proposal(state.faPool[0])) => success(apply(state, offer(p)));
const pending = (state = held(), cmd = accept()) => success(apply({ ...state, date: '2026-12-01' }, cmd));
const paid = (state = pending(), cmd = settle()) => success(apply({ ...state, date: '2026-12-05' }, cmd));
const spring = state => ({ ...state, season: 2027, phase: 'preseason', date: '2027-02-01' });
const row = (state, teamId = 0, season = 2027) => quoteAnnualSpendingPlan(state.spending).find(r => r.teamId === teamId && r.season === season);
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
function reject(state, cmd) {
  const snapshot = JSON.stringify(state); freeze(state);
  expect(quote(state, cmd).ok).toBe(false); const result = apply(state, cmd);
  expect(result.ok).toBe(false); expect(result.state).toBe(state); expect(JSON.stringify(state)).toBe(snapshot); return result;
}
function addOwned(state, count, dev = false) {
  for (let i = 0; i < count; i++) { const id = `extra-${i}`; state.teams[0].farm.push(player(id, { isIkusei: dev }));
    state.spending.ledger = ledgerApply(state.spending.ledger, sign(id, 0, dev)); }
  return state;
}

describe('former-club FA cash selection and settlement (unconnected)', () => {
  it.each([['A', 'first', 8000], ['B', 'first', 6000], ['A', 'repeat', 4000], ['B', 'repeat', 3000]])(
    'accepts %s/%s into funded pending liability, then settles only on former club choice', (rank, exercise, amount) => {
      const p = free({ marketEntry: entry({ compensationRank: rank, compensationBasis: { previousAnnualSalaryManYen: 10000, exercise } }) });
      const before = freeze(held(fixture(p))), snapshot = JSON.stringify(before), next = pending(before);
      expect(next.teams).toEqual(before.teams); expect(next.faPool).toEqual([]);
      expect(row(next)).toMatchObject({ salaryManYen: 21000, reservedManYen: amount, oneOffManYen: 0 });
      expect(next.spending.faCompensations).toEqual([{ proposalId: 'bid', resolution: 'pending' }]);
      expect(next.spending.oneOffCosts).toEqual([]); expect(next.acquisitions).toEqual([{ proposalId: 'bid', player: p }]);
      expect(JSON.stringify(before)).toBe(snapshot);
      const chosen = paid(next);
      expect(row(chosen)).toMatchObject({ salaryManYen: 21000, reservedManYen: 0, oneOffManYen: amount });
      expect(row(chosen, 1).oneOffManYen).toBe(-amount);
      expect(chosen.teams).toEqual(before.teams); expect(chosen.spending.ledger).toEqual(next.spending.ledger);
      expect(chosen.spending.resolvedReservations).toEqual(next.spending.resolvedReservations);
      expect(chosen.spending.faCompensations).toEqual([{ proposalId: 'bid', resolution: 'cash-only', teamId: 1, chosenDate: '2026-12-05' }]);
      const joined = success(apply(spring(json(chosen)), join()));
      expect(joined.teams[0].farm[0]).toMatchObject({ id: 'free', salary: 20000, contractYearsLeft: 3, contractSignedYear: 2026 });
      expect(joined.spending.oneOffCosts).toEqual(chosen.spending.oneOffCosts);
      expect(joined.spending.ledger.records.find(r => r.contract.contractId === 'new-bid').contract.endSeason).toBe(2029);
    });
  it('quotes without mutation and replays settlement, acceptance and joining after JSON exactly once', () => {
    const before = freeze(pending()), snapshot = JSON.stringify(before), command = settle();
    const q = quote({ ...before, date: '2026-12-05' }, command); expect(q.ok, q.error).toBe(true); expect(q.state).toBeUndefined();
    expect(JSON.stringify(before)).toBe(snapshot);
    const next = json(paid(before)), ready = spring(next), joined = success(apply(ready, join()));
    expect(success(apply(joined, command))).toBe(joined); expect(success(apply(joined, accept()))).toBe(joined);
    expect(success(apply(joined, offer()))).toBe(joined); expect(success(apply(joined, join()))).toBe(joined);
    expect(joined.spending.oneOffCosts).toHaveLength(2); expect(joined.teams[0].farm).toHaveLength(1);
    reject(json(joined), settle({ id: 'settle-again' }));
  });
  it('does not allow an accepted acquisition to join before its compensation is selected', () => {
    const ready = spring(pending()); reject(json(ready), join());
    const next = success(apply(ready, settle())); expect(success(apply(next, join())).teams[0].farm).toHaveLength(1);
  });
  it('allows same-day acceptance then selection without changing offer or effective date', () => {
    const state = pending(), next = success(apply(state, settle()));
    expect(next.spending.faCompensations[0].chosenDate).toBe('2026-12-01');
    expect(next.spending.resolvedReservations[0]).toMatchObject({ answeredDate: '2026-12-01', proposal: { offeredDate: '2026-11-20', effectiveDate: '2027-02-01' } });
  });
  it.each([0, 2, '1'])('rejects selection by a club other than the exact former club: %s', teamId => reject(pending(), settle({ teamId })));
  it.each(['player', 'none', 'automatic'])('does not silently substitute unsupported compensation method %s', method => reject(pending(), settle({ method })));
  it.each(['chosenDate', 'amountManYen', 'effectiveDate', 'previousAnnualSalaryManYen'])('does not accept caller override %s', field => {
    reject(pending(), { ...settle(), [field]: field.includes('Date') ? '2026-12-02' : 0 });
  });
  it('rejects choice for a pending bid, an unknown bid, or an already declined bid', () => {
    reject(held(), settle()); reject(pending(), settle({ proposalId: 'unknown' }));
    const state = success(apply(held(), { id: 'reject', type: 'reject-fa', proposalId: 'bid' })); reject(state, settle());
  });
  it('rejects dates before acceptance, before recorded choice, and unsupported future phases', () => {
    reject({ ...pending(), date: '2026-11-30' }, settle());
    reject({ ...paid(), date: '2026-12-04' }, settle());
    reject({ ...spring(pending()), phase: 'season', date: '2027-04-01' }, settle());
  });
  it('keeps source-independent accepted terms even when current source salary was a demand value', () => {
    const state = held(); state.faPool[0].salary = 99999;
    const next = paid(pending(state)); expect(row(next).oneOffManYen).toBe(8000);
    expect(next.spending.resolvedReservations[0].proposal.contract.annualSalaryManYen).toBe(20000);
    expect(success(apply(spring(next), join())).teams[0].farm[0].salary).toBe(20000);
  });
  it.each(['salary', 'exercise', 'rank', 'retired', 'left'])('rechecks %s changes after quoting acceptance', change => {
    const state = held(); expect(quote(state, accept()).ok).toBe(true);
    if (change === 'salary') state.faPool[0].marketEntry.compensationBasis.previousAnnualSalaryManYen = 20000;
    if (change === 'exercise') state.faPool[0].marketEntry.compensationBasis.exercise = 'repeat';
    if (change === 'rank') state.faPool[0].marketEntry.compensationRank = 'B';
    if (change === 'retired') state.faPool[0].isRetired = true;
    if (change === 'left') state.faPool = [];
    reject(json(state), accept());
    const cancelled = success(apply(state, { id: 'cancel', type: 'cancel-fa', proposalId: 'bid' })); expect(row(cancelled).reservedManYen).toBe(0);
  });
  it.each([2027, 2028, 2029])('rechecks target budget year %s without partial contract or compensation', season => {
    const state = held(); expect(quote(state, accept()).ok).toBe(true);
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === season).approvedManYen = season === 2027 ? 28999 : 19999;
    reject(state, accept());
  });
  it('rejects a new bid without compensation headroom or the former-club authorization', () => {
    const state = fixture(); state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2027).approvedManYen = 28999;
    reject(state, offer());
    const missing = fixture(); missing.spending.authorizations = missing.spending.authorizations.filter(a => a.teamId !== 1 || a.season !== 2027);
    reject(missing, offer());
  });
  it('settles pre-existing liability and receives cash while both clubs remain in deficit', () => {
    const state = pending();
    state.spending.authorizations.filter(a => a.season === 2027 && [0, 1].includes(a.teamId)).forEach(a => { a.approvedManYen = 0; });
    state.spending.oneOffCosts.push({ id: 'existing-coach', teamId: 1, season: 2027, kind: 'coach', amountManYen: 20000 });
    const before = row(state).remainingManYen, next = paid(freeze(state));
    expect(row(next).remainingManYen).toBe(before); expect(row(next, 1).remainingManYen).toBeLessThan(0);
    expect(row(next, 1).oneOffManYen).toBe(12000);
  });
  it.each([0, 2])('settles only the winning club %s bid and releases the other club cash reservation', winner => {
    const p = free(), bid2 = proposal(p, { id: 'other', teamId: 2 });
    const state = success(apply(held(), offer(bid2, 'submit-other'))), proposalId = winner === 0 ? 'bid' : 'other';
    const next = pending(state, accept(proposalId)), chosen = paid(next, settle({ proposalId }));
    expect(row(chosen, 2 - winner).reservedManYen).toBe(0);
    expect(chosen.spending.oneOffCosts.filter(c => c.amountManYen > 0)[0].teamId).toBe(winner);
    reject(json(chosen), settle({ id: 'loser-choice', proposalId: winner === 0 ? 'other' : 'bid' }));
  });
  it('requires no compensation if the former club wins against funded competing bids', () => {
    const p = proposal(free(), { id: 'stay', teamId: 1 }); const state = success(apply(held(), offer(p, 'stay-submit')));
    const next = pending(state, accept('stay')); expect(next.spending.faCompensations).toBeUndefined();
    expect(next.spending.oneOffCosts).toEqual([]); expect(row(next).reservedManYen).toBe(0);
    expect(success(apply(spring(next), join('stay'))).teams[1].farm).toHaveLength(1);
  });
  it('counts accepted controlled rookies and pending FA exactly once at the 70-player boundary', () => {
    const state = held(addOwned(fixture(), 68)); expect(quote(state, accept()).ok).toBe(true);
    const next = paid(pending(json(state))); expect(success(apply(spring(next), join())).teams[0].farm).toHaveLength(69);
    state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    reject(state, accept());
  });
  it('keeps development roster players outside the FA controlled capacity count', () => {
    const accepted = pending(held(addOwned(fixture(), 69, true)));
    const next = success(apply(spring(paid(accepted)), join()));
    expect(next.teams[0].farm).toHaveLength(70); expect(next.teams[0].farm.filter(p => !p.isIkusei)).toHaveLength(1);
  });
  it.each(['missing', 'pending-again', 'future-choice', 'wrong-payee', 'no-payment'])('rejects corrupted pending/settled state %s after JSON', change => {
    const state = json(paid());
    if (change === 'missing') delete state.spending.faCompensations;
    if (change === 'pending-again') state.spending.faCompensations[0] = { proposalId: 'bid', resolution: 'pending' };
    if (change === 'future-choice') state.spending.faCompensations[0].chosenDate = '2026-12-06';
    if (change === 'wrong-payee') state.spending.oneOffCosts[1].teamId = 2;
    if (change === 'no-payment') state.spending.oneOffCosts = [];
    reject(state, settle());
  });
  it('rejects putting pending compensation onto an already joined acquisition', () => {
    const state = success(apply(spring(paid()), join()));
    state.spending.faCompensations[0] = { proposalId: 'bid', resolution: 'pending' }; state.spending.oneOffCosts = [];
    reject(state, join());
  });
  it('preserves settled source/amount after spring joining, same-day trade and later-year JSON', () => {
    let state = success(apply(spring(paid()), join())); const costs = json(state.spending.oneOffCosts);
    const trade = { id: 'trade', type: 'trade', fromId: 0, toId: 1, outgoingIds: ['free'], incomingIds: ['b'], cashManYen: 0, mode: 'spend' };
    state = success(apply(state, trade)); expect(state.spending.oneOffCosts).toEqual(costs);
    expect([...state.teams[1].players, ...state.teams[1].farm].some(p => p.id === 'free')).toBe(true);
    state = { ...json(state), season: 2028, phase: 'preseason', date: '2028-02-01', spending: { ...state.spending, budgetSeason: 2028 } };
    expect(success(apply(state, settle()))).toBe(state); expect(row(state, 0, 2028).oneOffManYen).toBe(0);
    expect(state.spending.oneOffCosts).toEqual(costs);
  });
  it('keeps an old A/B bid without basis cancellable and blocked at acceptance', () => {
    const p = free(); delete p.marketEntry.compensationBasis;
    const state = held(fixture(p), proposal(p)); reject(json(state), accept());
    expect(row(success(apply(state, { id: 'cancel', type: 'cancel-fa', proposalId: 'bid' }))).reservedManYen).toBe(0);
  });
  it('supports overseas FA domestic transfers with the same compensation rules', () => {
    const p = free({ marketEntry: entry({ kind: 'overseas-fa' }) }); expect(row(paid(pending(held(fixture(p))))).oneOffManYen).toBe(8000);
  });
  it('preserves zero IDs for proposal, settlement and former club', () => {
    const p = free({ marketEntry: entry({ id: 0, originTeamId: 0 }) }), bid = proposal(p, { id: 0, teamId: 2 });
    const state = pending(held(fixture(p), bid), accept(0)); const cmd = settle({ id: 0, proposalId: 0, teamId: 0 });
    const next = paid(state, cmd); expect(row(next, 2).oneOffManYen).toBe(8000); expect(row(next, 0).oneOffManYen).toBe(-8000);
    expect(success(apply(json(next), cmd))).toEqual(next);
  });
  it('rejects rolling settled cash back to pending while the settlement receipt remains', () => {
    const state = json(paid());
    state.spending.faCompensations[0] = { proposalId: 'bid', resolution: 'pending' }; state.spending.oneOffCosts = [];
    reject(state, settle());
  });
  it('checks the stored selecting-club receipt even while replaying an unrelated offer', () => {
    const state = json(paid()), receipt = state.transactions.find(r => r.id === 'settle');
    const command = JSON.parse(receipt.signature); command.teamId = 2; receipt.signature = JSON.stringify(command);
    reject(state, offer());
  });
  it.each(['repeat', 'lower-salary', 'missing-basis', 'rank-c'])('rejects jointly rewriting accepted basis and pending player: %s', change => {
    const state = json(pending());
    for (const e of [state.spending.resolvedReservations[0].proposal.marketEntry, state.acquisitions[0].player.marketEntry]) {
      if (change === 'repeat') e.compensationBasis.exercise = 'repeat';
      if (change === 'lower-salary') e.compensationBasis.previousAnnualSalaryManYen = 1000;
      if (change === 'missing-basis' || change === 'rank-c') delete e.compensationBasis;
      if (change === 'rank-c') e.compensationRank = 'C';
    }
    if (['missing-basis', 'rank-c'].includes(change)) { delete state.spending.faCompensations; reject(spring(state), join()); }
    else reject(state, settle());
  });
  it('rejects jointly rewriting held and market basis while the original offer receipt remains', () => {
    const state = json(held());
    state.spending.reservations[0].proposal.marketEntry.compensationBasis.exercise = 'repeat';
    state.faPool[0].marketEntry.compensationBasis.exercise = 'repeat';
    reject(state, accept());
  });
  it('rejects booking unselected compensation as a trade before replay', () => {
    const state = json(pending());
    state.spending.oneOffCosts = [['payer', 0, 8000], ['payee', 1, -8000]].map(([side, teamId, amountManYen]) => ({
      id: JSON.stringify(['fa-compensation', 'bid', side]), teamId, season: 2027, kind: 'trade', amountManYen, proposalId: 'bid',
    }));
    reject(state, offer());
  });

});
