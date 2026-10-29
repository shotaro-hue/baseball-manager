import { describe, expect, it } from 'vitest';
import * as tx from '../annualTransactions';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as ledgerApply } from '../contractLedger';

const json = x => JSON.parse(JSON.stringify(x));
const player = (id, extra = {}) => ({ id, name: String(id), pos: '一塁手', salary: 1000, ...extra });
const contract = (id, extra = {}) => createSeasonContract({ contractId: `c-${id}`, playerId: id, signedSeason: 2026,
  agreementPhase: 'preseason', purpose: 'acquisition', termYears: 3, annualSalaryManYen: 1000, guaranteed: true, registrationType: 'controlled', ...extra });
function owned(state, id, teamId = 0, extra = {}, terms = {}) {
  state.teams.find(t => t.id === teamId).farm.push(player(id, extra));
  const c = contract(id, terms);
  state.spending.ledger = ledgerApply(state.spending.ledger, { id: `sign-${id}`, type: 'sign', teamId,
    effectiveDate: `${c.startSeason}-02-01`, contract: c }); return state;
}
function fixture() {
  const state = { version: 1, season: 2026, phase: 'offseason', date: '2026-11-20', transactions: [],
    teams: [0, 1, 2].map(id => ({ id, players: [], farm: [], budget: 999 })), faPool: [],
    draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} },
    rosterRequirements: [0, 1, 2].flatMap(teamId => [2026, 2027, 2028, 2029, 2030].map(season => ({ teamId, season, requiredControlledCount: 0 }))),
    spending: { version: 1, budgetSeason: 2027, ledger: createContractLedger(), reservations: [], resolvedReservations: [], oneOffCosts: [],
      authorizations: [0, 1, 2].flatMap(teamId => [2026, 2027, 2028, 2029, 2030].map(season => ({ teamId, season, approvedManYen: 200000, minimumRosterReserveManYen: 0 }))) } };
  owned(state, 'a'); owned(state, 'reserve'); owned(state, 'b', 1); owned(state, 'c', 2);
  state.teams[0].players.push(state.teams[0].farm.shift()); return state;
}
const success = r => { expect(r.ok, r.error).toBe(true); return r.state; };
function claim(state = fixture(), id = 'bid', originTeamId = 1) {
  const p = player(`fa-${id}`, { isFA: true, entryType: '高卒', daysOnActiveRoster: 1080,
    marketEntry: { id: `market-${id}`, kind: 'domestic-fa', enteredDate: `${state.season}-11-01`, originTeamId, compensationRank: 'A',
      compensationBasis: { previousAnnualSalaryManYen: 10000, exercise: 'first' } } });
  state = { ...state, faPool: [...state.faPool, p] };
  const proposal = { id, type: 'sign', teamId: 0, offeredDate: state.date, effectiveDate: `${state.season + 1}-02-01`, marketEntry: json(p.marketEntry),
    contract: contract(p.id, { contractId: `new-${id}`, signedSeason: state.season, agreementPhase: 'offseason', termYears: 3 }) };
  state = success(tx.applyAnnualTransaction(state, { id: `offer-${id}`, type: 'offer-fa', proposal }));
  return success(tx.applyAnnualTransaction(state, { id: `accept-${id}`, type: 'accept-fa', proposalId: id }));
}
const submit = (extra = {}) => ({ id: 'protect', type: 'submit-fa-protection', proposalId: 'bid', teamId: 0, protectedPlayerIds: ['a'], ...extra });
const apply = (s, c = submit()) => tx.applyAnnualTransaction(s, c);
const query = (s, proposalId = 'bid') => tx.quoteFaProtectionList?.(s, { proposalId }) ?? { ok: false, error: 'protection query missing' };
const view = (s, proposalId) => { const r = query(s, proposalId); expect(r.ok, r.error).toBe(true); return r.protection; };
const save = (s = claim(), c = submit()) => success(apply(s, c));
const freeze = x => { if (x && typeof x === 'object') { Object.values(x).forEach(freeze); Object.freeze(x); } return x; };
function reject(s, c = submit()) {
  const before = JSON.stringify(s); freeze(s); expect(tx.quoteAnnualTransaction(s, c).ok).toBe(false);
  const r = apply(s, c); expect(r.ok).toBe(false); expect(r.state).toBe(s); expect(JSON.stringify(s)).toBe(before);
}
const cash = (proposalId = 'bid', teamId = 1) => ({ id: `cash-${proposalId}`, type: 'settle-fa-compensation', proposalId, teamId, method: 'cash-only' });
const spring = s => ({ ...s, season: 2027, phase: 'preseason', date: '2027-02-01' });

describe('FA protection list foundation (no personnel selection or live adoption)', () => {
  it('quotes current controlled first/farm pool and persists a nonfinancial snapshot', () => {
    const before = freeze(claim()), snapshot = JSON.stringify(before);
    expect(view(before)).toMatchObject({ submitted: false, eligiblePlayerIds: ['a', 'reserve'], protectedPlayerIds: [], candidatePlayerIds: ['a', 'reserve'], unavailablePlayerIds: [] });
    expect(tx.quoteAnnualTransaction(before, submit()).ok).toBe(true); expect(JSON.stringify(before)).toBe(snapshot);
    const next = save(before), list = next.faProtectionLists[0];
    expect(list).toEqual({ transactionId: 'protect', proposalId: 'bid', teamId: 0, season: 2027, submittedDate: '2026-11-20', eligiblePlayerIds: ['a', 'reserve'], protectedPlayerIds: ['a'] });
    expect(next.spending).toEqual(before.spending); expect(next.teams).toEqual(before.teams); expect(next.faPool).toEqual(before.faPool);
    expect(next.acquisitions).toEqual(before.acquisitions); expect(next.transactions.at(-1).faProtection).toEqual(list);
    expect(next.transactions.at(-1).faProtection).not.toBe(list);
    expect(view(json(next))).toMatchObject({ submitted: true, candidatePlayerIds: ['reserve'] });
  });
  it('canonicalizes ID order and replays after JSON without duplicating history', () => {
    const command = submit({ protectedPlayerIds: ['reserve', 'a'] }), next = json(save(claim(), command));
    expect(next.faProtectionLists[0].protectedPlayerIds).toEqual(['a', 'reserve']);
    expect(success(apply(next, submit({ protectedPlayerIds: ['a', 'reserve'] })))).toBe(next);
    expect(next.faProtectionLists).toHaveLength(1); expect(next.transactions).toHaveLength(3);
    reject(json(next), submit({ protectedPlayerIds: [] }));
  });
  it('does not expose mutable arrays from a query or retain caller-owned protected IDs', () => {
    const ids = ['a'], next = save(claim(), submit({ protectedPlayerIds: ids })); ids.push('reserve');
    const v = view(next); v.protectedPlayerIds.push('reserve'); v.eligiblePlayerIds.length = 0;
    expect(view(next).candidatePlayerIds).toEqual(['reserve']);
  });
  it.each([0, 1, 28])('permits an explicit protection count of %s', count => {
    const state = fixture(); for (let i = 0; i < 27; i++) owned(state, `p${i}`);
    const ids = ['a', 'reserve', ...Array.from({ length: 27 }, (_, i) => `p${i}`)].slice(0, count);
    expect(view(save(claim(state), submit({ protectedPlayerIds: ids }))).candidatePlayerIds).toHaveLength(29 - count);
  });
  it('rejects more than28 protected IDs without an implicit truncated list', () => {
    const state = fixture(); for (let i = 0; i < 27; i++) owned(state, `p${i}`);
    reject(claim(state), submit({ protectedPlayerIds: ['a', 'reserve', ...Array.from({ length: 27 }, (_, i) => `p${i}`)] }));
  });
  it.each([null, 'a', ['a', 'a'], [null], [''], ['  '], [-1], [1.5], [0, '0'], ['unknown'], ['b']])('rejects invalid protected identities %j', ids => reject(claim(), submit({ protectedPlayerIds: ids })));
  it.each([1, 2, '0'])('rejects submission by wrong or type-coerced club %s', teamId => reject(claim(), submit({ teamId })));
  it.each(['submittedDate', 'season', 'eligiblePlayerIds', 'resolution'])('rejects caller-supplied %s', field => reject(claim(), { ...submit(), [field]: [] }));
  it('requires an accepted pending compensable claim', () => {
    reject(fixture()); reject(claim(), submit({ proposalId: 'missing' }));
    const paid = success(apply(claim(), cash())); reject(paid); expect(query(paid).ok).toBe(false);
  });
  it('allows spring submission but rejects season phase, late years and date rewind', () => {
    expect(view(save(spring(claim()))).submitted).toBe(true);
    reject({ ...spring(claim()), phase: 'season', date: '2027-04-01' });
    reject({ ...spring(claim()), season: 2028, date: '2028-02-01', spending: { ...claim().spending, budgetSeason: 2028 } });
    const next = save({ ...claim(), date: '2026-12-05' }); reject({ ...next, date: '2026-12-04' });
  });
  it.each(['foreign', 'development', 'retired', 'fa', 'waiver'])('excludes current %s players and refuses protecting them', kind => {
    const extra = { foreign: { isForeign: true }, development: { isIkusei: true }, retired: { isRetired: true }, fa: { isFA: true }, waiver: { isWaiverReleased: true } }[kind];
    const state = fixture(); owned(state, 'excluded', 0, extra, kind === 'development' ? { registrationType: 'development', annualSalaryManYen: 240 } : {});
    const pending = claim(state); expect(view(pending).eligiblePlayerIds).toEqual(['a', 'reserve']); reject(pending, submit({ protectedPlayerIds: ['excluded'] }));
  });
  it('keeps injured and expiring players eligible, independent of their next-year renewal', () => {
    const state = fixture(); owned(state, 'injured', 0, { injuryDaysLeft: 200, registrationCooldownDays: 10 }); owned(state, 'expiring', 0, {}, { termYears: 1 });
    const pending = claim(state); expect(view(pending).eligiblePlayerIds).toEqual(['a', 'expiring', 'injured', 'reserve']);
    const renewal = { id: 'renew', type: 'sign', teamId: 0, effectiveDate: '2027-02-01', contract: contract('expiring', { contractId: 'renew-c', purpose: 'renewal', agreementPhase: 'offseason', termYears: 2 }) };
    const withRenewal = { ...pending, spending: { ...pending.spending, ledger: ledgerApply(pending.spending.ledger, renewal) } };
    expect(view(withRenewal).eligiblePlayerIds).toEqual(view(pending).eligiblePlayerIds);
  });
  it('does not include draft newcomers or signed pending FA in the original pool', () => {
    const state = claim(); state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    const next = save(state); expect(view(next).eligiblePlayerIds).toEqual(['a', 'reserve']);
    reject(json(next), submit({ id: 'replacement', protectedPlayerIds: ['rookie'] }));
  });
  it('includes a same-offseason FA acquisition after actual spring joining', () => {
    let state = claim(); state = claim(state, 'second', 2); state = success(apply(state, cash('second', 2)));
    state = success(apply(spring(state), { id: 'join-second', type: 'join-fa', proposalId: 'second' }));
    expect(view(state).eligiblePlayerIds).toEqual(['a', 'fa-second', 'reserve']);
    expect(view(save(state, submit({ protectedPlayerIds: ['fa-second'] })))).toMatchObject({ protectedPlayerIds: ['fa-second'], candidatePlayerIds: ['a', 'reserve'] });
  });
  it('does not include an accepted FA before joining, even after its contract becomes effective', () => {
    const state = spring(claim(claim(), 'second', 2));
    expect(view(state).eligiblePlayerIds).toEqual(['a', 'reserve']);
    expect(state.acquisitions.every(a => !Object.hasOwn(a, 'joinedDate'))).toBe(true);
    reject(state, submit({ protectedPlayerIds: ['fa-second'] }));
  });
  it.each(['preseason', 'offseason'])('includes an actual trade arrival with a %s acquisition contract', agreementPhase => {
    const state = spring(claim()); owned(state, 'traded', 1, {}, { agreementPhase, signedSeason: agreementPhase === 'offseason' ? 2026 : 2027 });
    const next = success(apply(state, { id: 'trade-in', type: 'trade', fromId: 0, toId: 1,
      outgoingIds: ['reserve'], incomingIds: ['traded'], cashManYen: 0, mode: 'spend' }));
    expect(view(next)).toMatchObject({ eligiblePlayerIds: ['a', 'traded'], candidatePlayerIds: ['a', 'traded'] });
    expect(view(save(next, submit({ protectedPlayerIds: ['traded'] })))).toMatchObject({ protectedPlayerIds: ['traded'], candidatePlayerIds: ['a'] });
  });
  it('excludes a joined rookie using its contract even after the draft pool is cleared', () => {
    let state = claim(); state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    state = success(apply(state, { id: 'reserve-rookie', type: 'reserve-rookie', proposal: { id: 'rookie-offer', type: 'sign', teamId: 0,
      effectiveDate: '2027-02-01', contract: contract('rookie', { agreementPhase: 'offseason', termYears: 1 }) } }));
    state = success(apply(spring(state), { id: 'join-rookie', type: 'join-rookie', proposalId: 'rookie-offer' }));
    expect(view(state).eligiblePlayerIds).toEqual(['a', 'reserve']);
    state = { ...state, draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} } };
    expect(view(json(state)).eligiblePlayerIds).toEqual(['a', 'reserve']);
    reject(state, submit({ protectedPlayerIds: ['rookie'] }));
  });
  it('does not exclude a same-year midseason recruit as a new winter acquisition', () => {
    const state = fixture(); owned(state, 'midseason', 0, {}, { agreementPhase: 'season' });
    expect(view(claim(state)).eligiblePlayerIds).toEqual(['a', 'midseason', 'reserve']);
  });
  it('keeps a recent rookie excluded after a trade and JSON when its original draft pool is gone', () => {
    let state = claim(); state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 1 }, confirmedPicks: {} };
    state = success(apply(state, { id: 'reserve-rookie', type: 'reserve-rookie', proposal: { id: 'rookie-offer', type: 'sign', teamId: 1,
      effectiveDate: '2027-02-01', contract: contract('rookie', { agreementPhase: 'offseason', termYears: 1 }) } }));
    state = success(apply(spring(state), { id: 'join-rookie', type: 'join-rookie', proposalId: 'rookie-offer' }));
    state = success(apply(state, { id: 'trade-rookie', type: 'trade', fromId: 0, toId: 1,
      outgoingIds: ['reserve'], incomingIds: ['rookie'], cashManYen: 0, mode: 'spend' }));
    state = json({ ...state, draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} } });
    expect(view(state).eligiblePlayerIds).toEqual(['a']);
    reject(state, submit({ protectedPlayerIds: ['rookie'] }));
  });
  it('does not extend the rookie exemption to the next offseason cohort', () => {
    let state = claim(); state.draftContext = { draftPool: [player('rookie')], drafted: { rookie: 0 }, confirmedPicks: {} };
    state = success(apply(state, { id: 'reserve-rookie', type: 'reserve-rookie', proposal: { id: 'rookie-offer', type: 'sign', teamId: 0,
      effectiveDate: '2027-02-01', contract: contract('rookie', { agreementPhase: 'offseason', termYears: 1 }) } }));
    state = success(apply(spring(state), { id: 'join-rookie', type: 'join-rookie', proposalId: 'rookie-offer' }));
    state = success(apply(state, cash()));
    state = success(apply(state, { id: 'join-bid', type: 'join-fa', proposalId: 'bid' }));
    state = { ...state, phase: 'offseason', date: '2027-11-20', spending: { ...state.spending, budgetSeason: 2028 },
      draftContext: { draftPool: [], drafted: {}, confirmedPicks: {} } };
    state = claim(json(state), 'next-year');
    expect(view(state, 'next-year').eligiblePlayerIds).toEqual(['a', 'fa-bid', 'reserve', 'rookie']);
    expect(view(save(state, submit({ proposalId: 'next-year', protectedPlayerIds: ['rookie'] })), 'next-year').protectedPlayerIds).toEqual(['rookie']);
  });
  it('keeps query validation pure for malformed selectors and invalid whole-state budgets', () => {
    const state = freeze(claim()), snapshot = JSON.stringify(state);
    for (const selector of [null, {}, { proposalId: 'bid', teamId: 0 }, { proposalId: 'unknown' }])
      expect(tx.quoteFaProtectionList(state, selector).ok).toBe(false);
    expect(JSON.stringify(state)).toBe(snapshot);
    const bad = json(state); bad.spending.authorizations = []; expect(query(bad).ok).toBe(false);
  });
  it('keeps separate lists, candidates and receipts for each FA proposal through JSON, replay and cash settlement', () => {
    let state = save(claim(claim(), 'second', 2));
    expect(view(state, 'second')).toMatchObject({ submitted: false, protectedPlayerIds: [], candidatePlayerIds: ['a', 'reserve'] });
    const first = json(state.faProtectionLists[0]);
    state = { ...state, date: '2026-11-21' };
    const other = submit({ id: 'other-list', proposalId: 'second', protectedPlayerIds: ['reserve'] });
    state = json(save(state, other));
    expect(state.faProtectionLists).toEqual([first, { ...first, transactionId: 'other-list', proposalId: 'second',
      submittedDate: '2026-11-21', protectedPlayerIds: ['reserve'] }]);
    expect(view(state)).toMatchObject({ submitted: true, protectedPlayerIds: ['a'], candidatePlayerIds: ['reserve'] });
    expect(view(state, 'second')).toMatchObject({ submitted: true, protectedPlayerIds: ['reserve'], candidatePlayerIds: ['a'] });
    for (const record of state.faProtectionLists) {
      const receipt = state.transactions.find(r => r.id === record.transactionId);
      expect(receipt.faProtection).toEqual(record);
      expect(JSON.parse(receipt.signature)).toMatchObject({ proposalId: record.proposalId, protectedPlayerIds: record.protectedPlayerIds });
    }
    expect(success(apply(state))).toBe(state); expect(success(apply(state, other))).toBe(state);
    reject(json(state), submit({ id: 'replacement', protectedPlayerIds: ['reserve'] }));
    reject(json(state), { ...other, id: 'other-replacement', protectedPlayerIds: ['a'] });
    reject(json(state), { ...other, protectedPlayerIds: ['a'] });
    const lists = json(state.faProtectionLists);
    state = json(success(apply(state, cash())));
    expect(state.faProtectionLists).toEqual(lists);
    expect(view(state, 'second')).toMatchObject({ protectedPlayerIds: ['reserve'], candidatePlayerIds: ['a'] });
    expect(success(apply(state, other))).toBe(state);
    expect(success(apply(state))).toBe(state);
  });
  it('allows up to 28 different protected players on each proposal in the same club/year', () => {
    const initial = fixture(); for (let i = 0; i < 28; i++) owned(initial, `p${i}`);
    const ids = Array.from({ length: 28 }, (_, i) => `p${i}`);
    let state = save(claim(claim(initial), 'second', 2), submit({ protectedPlayerIds: ids }));
    state = save(state, submit({ id: 'other-list', proposalId: 'second', protectedPlayerIds: ['a', 'reserve', ...ids.slice(2)] }));
    expect(state.faProtectionLists.map(r => r.protectedPlayerIds.length)).toEqual([28, 28]);
    expect(view(state).candidatePlayerIds).toEqual(['a', 'reserve']);
    expect(view(state, 'second').candidatePlayerIds).toEqual(['p0', 'p1']);
  });
  it('rejects a duplicate proposal record even with a matching new receipt and transaction signature', () => {
    const state = json(save()), duplicate = { ...json(state.faProtectionLists[0]), transactionId: 'forged' };
    state.faProtectionLists.push(duplicate);
    const receipt = json(state.transactions.at(-1)), command = JSON.parse(receipt.signature); command.id = 'forged';
    receipt.id = 'forged'; receipt.signature = JSON.stringify(command); receipt.faProtection = json(duplicate);
    state.transactions.push(receipt);
    expect(query(state).ok).toBe(false);
    reject(state, { id: 'accept-bid', type: 'accept-fa', proposalId: 'bid' });
  });
  it('freezes each proposal cohort at its own submission, including a later actual FA arrival only in the later list', () => {
    let state = claim(claim(claim(), 'second', 2), 'arrival', 1);
    state = save(state); const first = json(state.faProtectionLists[0]);
    state = success(apply(state, cash('arrival', 1)));
    state = success(apply(spring(state), { id: 'join-arrival', type: 'join-fa', proposalId: 'arrival' }));
    expect(view(state).eligiblePlayerIds).toEqual(['a', 'reserve']);
    expect(view(state, 'second')).toMatchObject({ submitted: false, eligiblePlayerIds: ['a', 'fa-arrival', 'reserve'] });
    state = json(save(state, submit({ id: 'second-list', proposalId: 'second', protectedPlayerIds: ['fa-arrival'] })));
    expect(state.faProtectionLists[0]).toEqual(first);
    expect(view(state).candidatePlayerIds).toEqual(['reserve']);
    expect(view(state, 'second')).toMatchObject({ protectedPlayerIds: ['fa-arrival'], candidatePlayerIds: ['a', 'reserve'] });
  });
  it('keeps pending money and spring join blocker, even when submitted in deficit', () => {
    const state = claim(); state.spending.authorizations.forEach(a => { a.approvedManYen = 0; });
    const next = save(state); expect(next.spending).toEqual(state.spending);
    reject(spring(next), { id: 'join', type: 'join-fa', proposalId: 'bid' });
    const paid = success(apply(next, cash())); expect(paid.faProtectionLists).toEqual(next.faProtectionLists);
    expect(success(apply(spring(paid), { id: 'join', type: 'join-fa', proposalId: 'bid' })).teams[0].farm.some(p => p.id === 'fa-bid')).toBe(true);
  });
  it.each(['foreign', 'retired', 'fa'])('removes a now-%s candidate without rewriting the submitted list', kind => {
    const next = json(save()); next.teams[0].farm[0][{ foreign: 'isForeign', retired: 'isRetired', fa: 'isFA' }[kind]] = true;
    expect(view(next)).toMatchObject({ candidatePlayerIds: [], unavailablePlayerIds: ['reserve'] });
    expect(next.faProtectionLists[0].eligiblePlayerIds).toEqual(['a', 'reserve']);
  });
  it('does not add a later signed newcomer to the submitted pool', () => {
    const next = json(save()); owned(next, 'late'); expect(view(next).candidatePlayerIds).toEqual(['reserve']);
    expect(view(next).eligiblePlayerIds).toEqual(['a', 'reserve']);
  });
  it('drops a traded candidate and does not expose the incoming player through a different pending claim', () => {
    let state = save(claim(claim(), 'second', 2)); state = success(apply(state, cash('second', 2)));
    state = success(apply(spring(state), { id: 'join-second', type: 'join-fa', proposalId: 'second' }));
    state = success(apply(state, { id: 'trade', type: 'trade', fromId: 0, toId: 1, outgoingIds: ['reserve'], incomingIds: ['b'], cashManYen: 0, mode: 'spend' }));
    expect(view(state)).toMatchObject({ candidatePlayerIds: [], unavailablePlayerIds: ['reserve'], eligiblePlayerIds: ['a', 'reserve'] });
  });
  it('rejects a noncanonical protected order in a stored submission signature before replay', () => {
    const state = json(save(claim(), submit({ protectedPlayerIds: ['a', 'reserve'] }))), receipt = state.transactions.at(-1);
    const c = JSON.parse(receipt.signature); c.protectedPlayerIds.reverse(); receipt.signature = JSON.stringify(c);
    expect(query(state).ok).toBe(false);
    reject(state, { id: 'accept-bid', type: 'accept-fa', proposalId: 'bid' });
  });
  it('survives cash settlement, joining, a normal trade and a later season', () => {
    let state = save(); state = success(apply(state, cash())); state = success(apply(spring(state), { id: 'join', type: 'join-fa', proposalId: 'bid' }));
    state = success(apply(state, { id: 'trade', type: 'trade', fromId: 0, toId: 1, outgoingIds: ['reserve'], incomingIds: ['b'], cashManYen: 0, mode: 'spend' }));
    const list = json(state.faProtectionLists); state = { ...json(state), season: 2028, date: '2028-02-01', spending: { ...state.spending, budgetSeason: 2028 } };
    expect(success(apply(state))).toBe(state); expect(state.faProtectionLists).toEqual(list);
  });
  it.each(['list-missing', 'receipt-missing', 'payload-missing', 'list-duplicate', 'wrong-team', 'wrong-season', 'future-date', 'unprotected-foreign-id', 'protected-change', 'payload-change', 'command-change', 'orphan-payload'])('rejects JSON history corruption %s before even unrelated replay', change => {
    const state = json(save()), record = state.faProtectionLists[0], receipt = state.transactions.at(-1);
    if (change === 'list-missing') delete state.faProtectionLists;
    if (change === 'receipt-missing') state.transactions.pop();
    if (change === 'payload-missing') delete receipt.faProtection;
    if (change === 'list-duplicate') state.faProtectionLists.push(json(record));
    if (change === 'wrong-team') record.teamId = 1;
    if (change === 'wrong-season') record.season = 2028;
    if (change === 'future-date') record.submittedDate = '2026-12-01';
    if (change === 'unprotected-foreign-id') record.eligiblePlayerIds.push('invented');
    if (change === 'protected-change') { record.protectedPlayerIds = []; receipt.faProtection.protectedPlayerIds = []; }
    if (change === 'payload-change') receipt.faProtection.eligiblePlayerIds = [];
    if (change === 'command-change') { const c = JSON.parse(receipt.signature); c.teamId = 1; receipt.signature = JSON.stringify(c); }
    if (change === 'orphan-payload') state.transactions[0].faProtection = json(record);
    reject(state, { id: 'accept-bid', type: 'accept-fa', proposalId: 'bid' }); expect(query(state).ok).toBe(false);
  });
  it('supports zero IDs while rejecting their string aliases', () => {
    const state = fixture(); state.teams[0].players = []; state.spending.ledger = { ...state.spending.ledger, records: state.spending.ledger.records.filter(r => r.contract.playerId !== 'a') }; owned(state, 0);
    const pending = claim(state, 0), command = submit({ id: 0, proposalId: 0, protectedPlayerIds: [0] });
    reject(pending, { ...command, protectedPlayerIds: ['0'] });
    const next = json(save(pending, command)); expect(view(next, 0).protectedPlayerIds).toEqual([0]); expect(success(apply(next, command))).toBe(next);
  });
});
