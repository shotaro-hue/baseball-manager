import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as ledgerApply, contractEmploymentAt, contractLiabilityRows } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { applyAnnualTransaction as apply, quoteAnnualTransaction as quote } from '../annualTransactions';

const json = value => JSON.parse(JSON.stringify(value));
const player = (id, extra = {}) => ({ id, name: id, pos: '一塁手', salary: 1000, ...extra });
const entry = (kind = 'released', extra = {}) => ({ id: 'listing-free', kind, enteredDate: '2026-11-01',
  ...(kind !== 'released' ? { originTeamId: 1, compensationRank: 'C' } : {}), ...extra });
const p = (extra = {}) => player('free', { isFA: true, entryType: '高卒', daysOnActiveRoster: 1080,
  marketEntry: entry(), personality: { overseas: 80 }, nested: { scouting: [10, 20] }, ...extra });
const sign = (id, teamId = 0, development = false) => ({ id: `initial-${id}`, type: 'sign', teamId, effectiveDate: '2026-02-01',
  contract: createSeasonContract({ contractId: `old-${id}`, playerId: id, signedSeason: 2026, agreementPhase: 'preseason',
    purpose: 'acquisition', termYears: 3, annualSalaryManYen: development ? 240 : 1000,
    guaranteed: true, registrationType: development ? 'development' : 'controlled' }) });
function fixture(free = p()) {
  let ledger = createContractLedger();
  for (const [id, teamId] of [['a', 0], ['b', 1]]) ledger = ledgerApply(ledger, sign(id, teamId));
  return { version: 1, season: 2026, phase: 'offseason', date: '2026-11-20', transactions: [],
    teams: [0, 1].map(id => ({ id, budget: 999, players: [player(id ? 'b' : 'a')], farm: [] })),
    faPool: [free], draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} },
    rosterRequirements: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({ teamId, season: 2026 + i, requiredControlledCount: 2 }))),
    spending: { version: 1, budgetSeason: 2027, ledger, reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({ teamId, season: 2026 + i,
        approvedManYen: 100000, minimumRosterReserveManYen: 0 }))) } };
}
const proposal = (free = p(), extra = {}) => ({ id: 'bid', type: 'sign', teamId: 0, offeredDate: '2026-11-20',
  marketEntry: json(free.marketEntry), effectiveDate: '2027-02-01',
  contract: createSeasonContract({ contractId: 'new-free', playerId: free.id, signedSeason: 2026,
    agreementPhase: 'offseason', purpose: 'acquisition', termYears: free.isIkusei || free.育成 ? 1 : 3,
    annualSalaryManYen: free.isIkusei || free.育成 ? 240 : 10000,
    guaranteed: true, registrationType: free.isIkusei || free.育成 ? 'development' : 'controlled' }), ...extra });
const offer = (prop = proposal(), id = 'submit') => ({ id, type: 'offer-fa', proposal: prop });
const accept = (proposalId = 'bid', id = 'accept') => ({ id, type: 'accept-fa', proposalId });
const join = (proposalId = 'bid', id = 'join') => ({ id, type: 'join-fa', proposalId });
const success = result => { expect(result.ok, result.error).toBe(true); return result.state; };
const held = (state = fixture(), prop = proposal(state.faPool[0])) => success(apply(state, offer(prop)));
const signed = (state = held()) => success(apply({ ...state, date: '2026-12-05' }, accept()));
const spring = (state, date = '2027-02-01') => ({ ...state, season: 2027, phase: 'preseason', date });
const row = (state, year = 2027, team = 0) => quoteAnnualSpendingPlan(state.spending).find(r => r.teamId === team && r.season === year);
const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
function reject(state, cmd) {
  const snapshot = JSON.stringify(state); freeze(state);
  const q = quote(state, cmd), result = apply(state, cmd);
  expect(q.ok, JSON.stringify(q)).toBe(false); expect(result.ok).toBe(false); expect(result.state).toBe(state);
  expect(JSON.stringify(state)).toBe(snapshot); return result;
}
function addOwned(state, count, development = false) {
  for (let i = 0; i < count; i++) {
    const id = `extra-${i}`;
    state.teams[0].farm.push(player(id, { isIkusei: development }));
    state.spending.ledger = ledgerApply(state.spending.ledger, sign(id, 0, development));
  }
  return state;
}
function rookie(state, development = false) {
  const rp = player('rookie', { isIkusei: development });
  state.draftContext = { draftPool: [rp], drafted: { rookie: 0 }, confirmedPicks: {} };
  const prop = { id: 'rookie-bid', type: 'sign', teamId: 0, effectiveDate: '2027-02-01',
    contract: createSeasonContract({ contractId: 'new-rookie', playerId: 'rookie', signedSeason: 2026,
      agreementPhase: 'offseason', purpose: 'acquisition', termYears: 1,
      annualSalaryManYen: development ? 240 : 600, registrationType: development ? 'development' : 'controlled', guaranteed: true }) };
  return success(apply(state, { id: 'rookie-submit', type: 'reserve-rookie', proposal: prop }));
}

describe('offseason explicit acquisitions (opt-in, no live save migration)', () => {
  it.each(['released', 'domestic-fa', 'overseas-fa'])('separates %s market, submission, response, payroll and roster start', kind => {
    const free = p({ marketEntry: entry(kind) }), state = freeze(fixture(free)), prop = proposal(free), snapshot = JSON.stringify(state);
    const q = quote(state, offer(prop)); expect(q.ok, q.error).toBe(true); expect(q.state).toBeUndefined();
    const reserved = success(apply(state, offer(prop)));
    expect(reserved.teams).toEqual(state.teams); expect(reserved.spending.ledger).toEqual(state.spending.ledger);
    expect([2027, 2028, 2029].map(y => row(reserved, y).reservedManYen)).toEqual([10000, 10000, 10000]);
    const next = signed(reserved);
    expect(next.teams).toEqual(state.teams); expect(next.faPool).toEqual([]);
    expect(next.acquisitions).toEqual([{ proposalId: 'bid', player: free }]);
    expect(next.spending.resolvedReservations).toEqual([{ kind: 'offer', proposal: prop, resolution: 'accepted', answeredDate: '2026-12-05' }]);
    expect(next.spending.ledger.records.at(-1)).toMatchObject({ effectiveDate: '2027-02-01', contract: { termYears: 3, endSeason: 2029 } });
    expect(contractEmploymentAt(next.spending.ledger, '2026-11-30').map(e => e.contract.playerId)).toEqual(['a', 'b']);
    expect(contractLiabilityRows(next.spending.ledger).filter(r => r.playerId === 'free').map(r => [r.season, r.amountManYen])).toEqual([[2027, 10000], [2028, 10000], [2029, 10000]]);
    expect(next.spending.authorizations.filter(a => a.season === 2026)).toEqual(state.spending.authorizations.filter(a => a.season === 2026));
    expect(next.teams.map(t => t.budget)).toEqual([999, 999]); expect(JSON.stringify(state)).toBe(snapshot);
  });
  it('preserves signed pending snapshot across JSON and joins farm exactly once without shortening term', () => {
    const accepted = json(signed()), ready = freeze(spring(accepted)), before = JSON.stringify(ready), cmd = join();
    expect(success(apply(ready, accept()))).toBe(ready); expect(success(apply(ready, offer()))).toBe(ready);
    expect(quote(ready, cmd).ok).toBe(true); expect(JSON.stringify(ready)).toBe(before);
    const next = success(apply(ready, cmd)), free = next.teams[0].farm.find(p => p.id === 'free');
    expect(free).toMatchObject({ salary: 10000, contractYears: 3, contractYearsLeft: 3, contractSignedYear: 2026,
      contractId: 'new-free', isFA: false, isIkusei: false, 育成: false, nested: { scouting: [10, 20] } });
    expect(next.teams[0].players).toEqual(accepted.teams[0].players);
    expect(next.spending.ledger).toEqual(accepted.spending.ledger); expect(next.spending.reservations).toEqual([]);
    expect(next.acquisitions[0]).toEqual({ ...accepted.acquisitions[0], joinedDate: '2027-02-01' });
    const loaded = json(next); expect(success(apply(loaded, cmd))).toBe(loaded);
    expect(success(apply({ ...loaded, date: '2027-03-01' }, cmd)).teams[0].farm).toHaveLength(1);
    reject(loaded, join('bid', 'join-twice')); reject(json(next), accept('bid', 'accept-twice'));
  });
  it.each(['2026-12-10', '2027-01-31', '2028-02-01'])('rejects spring join at wrong time %s', date => {
    const state = signed(); reject(date.startsWith('2026') ? { ...state, date } : spring(state, date), join());
  });
  it('requires join before starting the season, rather than concealing an unjoined active contract', () => {
    reject({ ...spring(signed()), phase: 'season', date: '2027-04-01' }, join());
  });
  it.each(['delete', 'duplicate', 'wrong-player', 'wrong-proposal', 'retired', 'wrong-class', 'wrong-listing', 'joined-early'])('rejects invalid JSON acquisition state: %s', change => {
    const state = json(signed());
    if (change === 'delete') delete state.acquisitions;
    if (change === 'duplicate') state.acquisitions.push(json(state.acquisitions[0]));
    if (change === 'wrong-player') state.acquisitions[0].player.id = 'b';
    if (change === 'wrong-proposal') state.acquisitions[0].proposalId = 'unknown';
    if (change === 'retired') state.acquisitions[0].player.isRetired = true;
    if (change === 'wrong-class') state.acquisitions[0].player.isIkusei = true;
    if (change === 'wrong-listing') state.acquisitions[0].player.marketEntry.id = 'changed';
    if (change === 'joined-early') state.acquisitions[0].joinedDate = '2026-12-05';
    reject(spring(state), join());
  });
  it('rejects placing the same signed pending player back on the market', () => {
    const state = signed(); state.faPool.push(json(state.acquisitions[0].player)); reject(state, accept());
  });
  it.each(['reject-fa', 'cancel-fa'])('releases %s reservations, preserving submission and later resolution through JSON', type => {
    const state = held(), cmd = { id: 'resolve', type, proposalId: 'bid' };
    const next = success(apply(freeze({ ...state, date: '2026-12-10' }), cmd));
    expect(next.spending.resolvedReservations[0]).toEqual({ kind: 'offer', proposal: proposal(),
      resolution: type === 'reject-fa' ? 'rejected' : 'cancelled', answeredDate: '2026-12-10' });
    expect(next.teams).toEqual(state.teams); expect(next.faPool).toEqual(state.faPool);
    expect(row(next).reservedManYen).toBe(0); expect(next.acquisitions).toBeUndefined();
    expect(success(apply(json(next), cmd))).toEqual(next); reject(json(next), accept());
    reject(json(next), offer(proposal(), 'revive'));
  });
  it('does not auto-expire unanswered spring offers and allows explicit cancellation when source has left', () => {
    const loaded = spring(json(held())); expect(row(loaded).reservedManYen).toBe(10000);
    reject(json(loaded), accept());
    loaded.faPool = [];
    const cancelled = success(apply(loaded, { id: 'late-cancel', type: 'cancel-fa', proposalId: 'bid' }));
    expect(row(cancelled).reservedManYen).toBe(0); expect(cancelled.spending.resolvedReservations[0].answeredDate).toBe('2027-02-01');
  });
  it.each([0, 1])('accepts club %i and releases competing holds even when losing club is in deficit', winner => {
    let state = held(); const prop = proposal(p(), { id: 'bid-b', teamId: 1, contract: { ...proposal().contract, contractId: 'new-free-b' } });
    state = success(apply(state, offer(prop, 'submit-b'))); const loser = 1 - winner;
    state.spending.authorizations.filter(a => a.teamId === loser).forEach(a => { a.approvedManYen = 0; });
    state.date = '2026-12-06';
    const next = success(apply(freeze(state), accept(winner ? 'bid-b' : 'bid')));
    expect(next.acquisitions).toHaveLength(1); expect(next.teams).toEqual(state.teams);
    expect(next.spending.resolvedReservations.find(r => r.resolution === 'lost')).toMatchObject({ answeredDate: state.date });
    expect(row(next, 2027, loser).reservedManYen).toBe(0);
    const joined = success(apply(spring(json(next)), join(winner ? 'bid-b' : 'bid')));
    expect(joined.teams[winner].farm.map(p => p.id)).toEqual(['free']);
  });
  it.each([2027, 2028, 2029])('rechecks all-year budget %i after quote', year => {
    const state = held(); expect(quote(state, accept()).ok).toBe(true);
    state.spending.authorizations.find(a => a.teamId === 0 && a.season === year).approvedManYen = 1000;
    reject(state, accept());
  });
  it('rejects a missing future authorization on submission', () => {
    const state = fixture(); state.spending.authorizations = state.spending.authorizations.filter(a => a.teamId !== 0 || a.season !== 2029);
    reject(state, offer());
  });
  it.each(['listing', 'market', 'retirement', 'class', 'source-left', 'date'])('rechecks %s after quoting acceptance', change => {
    const state = held(); expect(quote(state, accept()).ok).toBe(true);
    if (change === 'listing') state.faPool[0].marketEntry.id = 'relisted';
    if (change === 'market') state.faPool[0].marketEntry = entry('domestic-fa');
    if (change === 'retirement') state.faPool[0]._retireNow = true;
    if (change === 'class') state.faPool[0].育成 = true;
    if (change === 'source-left') state.faPool = [];
    if (change === 'date') state.date = '2026-11-19';
    reject(state, accept());
  });
  it.each(['missing', 'stripped', 'wrong-date', 'wrong-entry', 'too-early-effective', 'wrong-effective', 'development-without-matching-source'])('rejects unsafe explicit submission %s', change => {
    const state = fixture(), prop = proposal();
    if (change === 'missing') delete prop.marketEntry;
    if (change === 'stripped') { delete prop.offeredDate; delete prop.marketEntry; }
    if (change === 'wrong-date') prop.offeredDate = '2026-11-19';
    if (change === 'wrong-entry') prop.marketEntry.id = 'old-listing';
    if (change === 'too-early-effective') prop.effectiveDate = '2026-11-20';
    if (change === 'wrong-effective') prop.effectiveDate = '2027-03-01';
    if (change === 'development-without-matching-source') prop.contract.registrationType = 'development';
    reject(state, offer(prop));
  });
  it.each(['domestic-fa', 'overseas-fa'])('rejects unqualified or development %s without changing existing thresholds', kind => {
    for (const extra of [{ daysOnActiveRoster: 0 }, { isIkusei: true }]) {
      const free = p({ marketEntry: entry(kind), ...extra }); reject(fixture(free), offer(proposal(free)));
    }
  });
  it.each(['domestic-fa', 'overseas-fa'])('does not use explicit %s as a midseason released-player acquisition', kind => {
    const free = p({ marketEntry: entry(kind, { enteredDate: '2026-06-01' }) }), state = fixture(free);
    state.phase = 'season'; state.date = '2026-07-01'; state.spending.budgetSeason = 2026;
    const prop = proposal(free, { offeredDate: state.date, effectiveDate: state.date,
      contract: createSeasonContract({ ...proposal(free).contract, agreementPhase: 'season' }) }); reject(state, offer(prop));
  });
  it.each(['A', 'B'])('holds but refuses an uncompensated %s-rank FA transfer, allowing return to origin', rank => {
    const free = p({ marketEntry: entry('domestic-fa', { compensationRank: rank }) });
    const state = held(fixture(free)); reject(json(state), accept());
    const returning = proposal(free, { id: 'stay', teamId: 1, contract: { ...proposal(free).contract, contractId: 'stay-contract' } });
    const next = success(apply(held(fixture(free), returning), accept('stay')));
    expect(next.acquisitions[0].proposalId).toBe('stay');
  });
  it('allows genuine exempt foreign FA, but rejects exempt domestic players', () => {
    const entryFA = entry('overseas-fa', { compensationRank: 'exempt' });
    const foreign = p({ marketEntry: entryFA, isForeign: true }); expect(signed(held(fixture(foreign))).acquisitions).toHaveLength(1);
    const domestic = p({ marketEntry: entryFA }); reject(fixture(domestic), offer(proposal(domestic)));
  });
  it('takes a foreign released player midseason without treating foreign nationality as overseas FA', () => {
    const free = p({ marketEntry: entry('released', { enteredDate: '2026-06-01' }), isForeign: true, daysOnActiveRoster: 0 });
    let state = fixture(free); state.phase = 'season'; state.date = '2026-07-01'; state.spending.budgetSeason = 2026;
    const prop = proposal(free, { offeredDate: state.date, effectiveDate: state.date,
      contract: createSeasonContract({ ...proposal(free).contract, agreementPhase: 'season' }) });
    state = held(state, prop); const next = success(apply({ ...state, date: '2026-07-16' }, accept()));
    expect(row(next, 2026).salaryManYen).toBe(5516); expect(row(next, 2027).salaryManYen).toBe(11000);
    expect(next.acquisitions).toBeUndefined(); expect(next.teams[0].players.find(p => p.id === 'free')).toMatchObject({ isForeign: true, isFA: false, salary: 10000 });
    expect(next.spending.resolvedReservations[0]).toMatchObject({ proposal: prop, answeredDate: '2026-07-16', acceptedProposal: { effectiveDate: '2026-07-16' } });
  });
  it('accepts and joins a released development contract without consuming controlled capacity', () => {
    const free = p({ isIkusei: true, 育成: true, ikuseiYears: 3, departureReason: 'ikusei_expiry' });
    const state = addOwned(fixture(free), 69); const prop = proposal(free);
    const next = signed(held(state, prop)); expect(row(next).salaryManYen).toBe(70240);
    expect(row(next).minimumRosterReserveManYen).toBe(0);
    const joined = success(apply(spring(json(next)), join()));
    expect(joined.teams[0].farm.find(p => p.id === 'free')).toMatchObject({ isIkusei: true, 育成: true, salary: 240, ikuseiYears: 0, contractYearsLeft: 1 });
  });
  it('preserves the actual 70th place and rechecks a newly accepted rookie before accepting', () => {
    let state = held(addOwned(fixture(), 68));
    expect(quote(state, accept()).ok).toBe(true);
    const next = signed(json(state)); expect(next.teams[0].farm).toHaveLength(68);
    expect(success(apply(spring(next), join())).teams[0].farm).toHaveLength(69);
    state = rookie(state); reject(state, accept());
  });
  it('counts a signed pending player against subsequent FA offers and rookie reservations', () => {
    const state = signed(held(addOwned(fixture(), 68)));
    const other = p({ id: 'other', marketEntry: entry('released', { id: 'other-entry' }) }); state.faPool = [other];
    const prop = proposal(other, { id: 'other-bid', contract: { ...proposal(other).contract, contractId: 'other-contract' } });
    reject(json(state), offer(prop, 'other-submit'));
    const copy = json(state); copy.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    reject(copy, offer(prop, 'other-submit'));
  });
  it.each(['market-first', 'rookie-first'])('joins market and rookie at the 70-place boundary exactly once: %s', order => {
    const state = signed(held(rookie(addOwned(fixture(), 67))));
    let next = spring(json(state));
    const rjoin = { id: 'rookie-join', type: 'join-rookie', proposalId: 'rookie-bid' };
    for (const cmd of order === 'market-first' ? [join(), rjoin] : [rjoin, join()]) next = success(apply(next, cmd));
    expect(next.teams[0].players.length + next.teams[0].farm.length).toBe(70);
    expect(next.teams[0].farm.filter(p => p.id === 'free')).toHaveLength(1);
    expect(next.teams[0].farm.filter(p => p.id === 'rookie')).toHaveLength(1);
    expect(row(next).reservedManYen).toBe(0);
  });
  it('does not count development draft players as pending controlled acquisitions', () => {
    const state = signed(held(rookie(addOwned(fixture(), 68), true)));
    const next = success(apply(spring(state), join())); expect(next.teams[0].farm.some(p => p.id === 'free')).toBe(true);
  });
  it('protects zero IDs and detects a changed explicit offer during replay', () => {
    const free = p({ id: 0, marketEntry: entry('released', { id: 0 }) }), prop = proposal(free, { id: 0 });
    const state = success(apply(held(fixture(free), prop), accept(0, 0)));
    const next = success(apply(spring(json(state)), join(0, 'spring-zero')));
    expect(next.teams[0].farm[0].id).toBe(0); expect(success(apply(next, accept(0, 0)))).toBe(next);
    reject(json(next), offer({ ...prop, offeredDate: '2026-11-21' }));
  });
  it('keeps joined history after same-day trade and JSON without requiring the original club forever', () => {
    const joined = success(apply(spring(signed()), join()));
    const trade = { id: 'trade-after-join', type: 'trade', fromId: 0, toId: 1,
      outgoingIds: ['free'], incomingIds: ['b'], cashManYen: 0, mode: 'spend' };
    const next = success(apply(joined, trade)), loaded = json(next);
    expect(loaded.acquisitions).toEqual(joined.acquisitions);
    expect([...loaded.teams[1].players, ...loaded.teams[1].farm].some(p => p.id === 'free')).toBe(true);
    expect(success(apply(loaded, join()))).toBe(loaded);
    expect(success(apply(loaded, trade))).toBe(loaded);
    expect(row(loaded, 2027, 1).salaryManYen).toBe(10000);
  });
  it('rechecks newly filled capacity between spring quote and join', () => {
    const state = spring(signed()); expect(quote(state, join()).ok).toBe(true);
    addOwned(state, 69); reject(state, join());
  });
  it('does not weaken the controlled cap for pending development players or existing development rosters', () => {
    const state = addOwned(fixture(), 69, true);
    const next = success(apply(spring(signed(held(state))), join()));
    expect(next.teams[0].farm).toHaveLength(70);
    expect(next.teams[0].farm.filter(p => !p.isIkusei)).toHaveLength(1);
  });
  it('rejects a new offer when any of its target years cannot fund it', () => {
    const state = fixture(); state.spending.authorizations.find(a => a.teamId === 0 && a.season === 2029).approvedManYen = 9999;
    reject(state, offer());
  });
  it.each([false, true])('rejects a released acquisition after July 31 (development=%s)', dev => {
    const free = p({ isIkusei: dev, marketEntry: entry('released', { enteredDate: '2026-07-01' }) });
    const state = fixture(free); state.date = '2026-07-31'; state.phase = 'season'; state.spending.budgetSeason = 2026;
    const prop = proposal(free, { offeredDate: state.date, effectiveDate: state.date,
      contract: createSeasonContract({ ...proposal(free).contract, agreementPhase: 'season' }) });
    const reserved = held(state, prop); reject({ ...reserved, date: '2026-08-01' }, accept());
    const cancelled = success(apply({ ...reserved, date: '2026-08-01' }, { id: 'deadline-cancel', type: 'cancel-fa', proposalId: 'bid' }));
    expect(row(cancelled, 2026).reservedManYen).toBe(0);
  });
  it('allows a released preseason offer to be answered in the same-year season', () => {
    const free = p({ marketEntry: entry('released', { enteredDate: '2026-02-01' }) });
    const state = fixture(free); state.date = '2026-03-01'; state.phase = 'preseason'; state.spending.budgetSeason = 2026;
    const prop = proposal(free, { offeredDate: state.date, effectiveDate: state.date,
      contract: createSeasonContract({ ...proposal(free).contract, agreementPhase: 'preseason' }) });
    const next = success(apply({ ...held(state, prop), date: '2026-04-01', phase: 'season' }, accept()));
    expect(row(next, 2026).salaryManYen).toBe(9000);
    expect(next.spending.resolvedReservations[0].proposal).toEqual(prop);
  });
  it('does not accept caller supplied answer dates or effective dates', () => {
    reject(held(), { ...accept(), answeredDate: '2026-11-21' });
    reject(held(), { ...accept(), effectiveDate: '2027-02-01' });
    reject(spring(signed()), { ...join(), joinedDate: '2027-02-01' });
  });
  it('requires explicit market information for new offseason offers even on legacy candidates', () => {
    const free = p(); delete free.marketEntry;
    const prop = proposal(); delete prop.marketEntry; delete prop.offeredDate;
    reject(fixture(free), offer(prop));
  });
  it('keeps unrelated holds and costs while resolving a market signing', () => {
    const state = rookie(fixture());
    state.spending.oneOffCosts.push({ id: 'coach', teamId: 0, season: 2027, kind: 'coach', amountManYen: 500 });
    const next = signed(held(state));
    expect(next.spending.reservations).toEqual(state.spending.reservations);
    expect(next.spending.oneOffCosts).toEqual(state.spending.oneOffCosts);
    expect(row(next)).toMatchObject({ reservedManYen: 600, oneOffManYen: 500 });
  });

  it.each(['retired', 'unqualified', 'changed-class'])('can release an unaccepted offer after source becomes %s', change => {
    const free = p({ marketEntry: entry('domestic-fa') }), state = held(fixture(free));
    if (change === 'retired') state.faPool[0].isRetired = true;
    if (change === 'unqualified') state.faPool[0].daysOnActiveRoster = 0;
    if (change === 'changed-class') state.faPool[0].isIkusei = true;
    reject(json(state), accept());
    const next = success(apply(state, { id: 'stale-cancel', type: 'cancel-fa', proposalId: 'bid' }));
    expect(row(next).reservedManYen).toBe(0);
    expect(next.spending.resolvedReservations[0]).toMatchObject({ resolution: 'cancelled', answeredDate: state.date });
  });

  it('rejects calendar regression before a pending explicit submission even when replaying its receipt', () => {
    const state = held(); reject({ ...state, date: '2026-11-19' }, offer());
  });
  it.each(['cancel-fa', 'reject-fa'])('rejects calendar regression before a resolved %s answer even on replay', type => {
    const cmd = { id: 'reply', type, proposalId: 'bid' };
    const state = success(apply({ ...held(), date: '2026-12-10' }, cmd));
    reject({ ...json(state), date: '2026-12-09' }, cmd);
  });
  it('rejects current-year acceptance replay before its recorded answer date', () => {
    const free = p({ marketEntry: entry('released', { enteredDate: '2026-06-01' }) });
    const state = fixture(free); state.phase = 'season'; state.date = '2026-07-01'; state.spending.budgetSeason = 2026;
    const prop = proposal(free, { offeredDate: state.date, effectiveDate: state.date,
      contract: createSeasonContract({ ...proposal(free).contract, agreementPhase: 'season' }) });
    const accepted = success(apply({ ...held(state, prop), date: '2026-07-16' }, accept()));
    reject({ ...json(accepted), date: '2026-07-15' }, accept());
  });

  it('rejects deleting both acceptance and acquisition histories while a future signed contract remains', () => {
    const state = json(signed()); state.acquisitions = []; state.spending.resolvedReservations = [];
    reject(state, accept());
  });

});
