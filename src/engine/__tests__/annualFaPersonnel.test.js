import { describe, expect, it } from 'vitest';
import { applyAnnualTransaction as apply, quoteAnnualTransaction as quote, quoteFaProtectionList } from '../annualTransactions';
import { contractEmploymentAt, contractLiabilityRows, applyContractLedgerAction } from '../contractLedger';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { fixture, claim, protect, own, terms, player, success, run, json, choice, settle, spring, freeze } from './faPersonnelFixtures';

const pending = () => protect();
const join = (proposalId = 'bid', id = 'join-personnel') => ({ id, type: 'join-fa-personnel', proposalId });
const row = (s, teamId, season = 2027) => quoteAnnualSpendingPlan(s.spending).find(r => r.teamId === teamId && r.season === season);
function reject(s, c = settle()) {
  const snapshot = JSON.stringify(s); freeze(s);
  expect(quote(s, c).ok).toBe(false); const r = apply(s, c);
  expect(r.ok, 'unexpected accepted command').toBe(false); expect(r.state).toBe(s); expect(JSON.stringify(s)).toBe(snapshot);
  return r;
}
function competing(origins = [1, 2]) {
  let s = fixture();
  origins.forEach((origin, i) => { s = protect(claim(s, `bid${i}`, origin), `bid${i}`); });
  return s;
}

describe('FA personnel settlement and spring joining (unconnected)', () => {
  it('quotes without mutation and atomically stores reduced cash, immutable terms and a pending move', () => {
    const s = freeze(pending()), before = JSON.stringify(s);
    const q = quote(s, settle()); expect(q.ok, q.error).toBe(true);
    expect(q.personnel.winnerProposalIds).toEqual(['bid']); expect(JSON.stringify(s)).toBe(before);
    const next = run(s, settle());
    expect(next.teams[0].farm.map(p => p.id)).toEqual(['other']);
    expect(next.teams[1]).toEqual(s.teams[1]);
    expect(next.faPersonnelMoves[0]).toMatchObject({ proposalId: 'bid', transactionId: 'personnel', fromTeamId: 0,
      teamId: 1, chosenDate: s.date, effectiveDate: '2027-02-01', player: { id: 'reserve' } });
    expect(next.spending.oneOffCosts.map(c => c.amountManYen)).toEqual([5000, -5000]);
    expect(row(next, 1).salaryManYen - row(s, 1).salaryManYen).toBe(1000);
    expect(contractEmploymentAt(next.spending.ledger, '2026-11-30').find(e => e.contract.playerId === 'reserve').teamId).toBe(0);
    expect(contractEmploymentAt(next.spending.ledger, '2027-02-01').find(e => e.contract.playerId === 'reserve').teamId).toBe(1);
    expect(next.spending.ledger.records.find(r => r.contract.playerId === 'reserve').contract)
      .toEqual(s.spending.ledger.records.find(r => r.contract.playerId === 'reserve').contract);
    expect(contractLiabilityRows(next.spending.ledger).filter(r => r.season === 2026))
      .toEqual(contractLiabilityRows(s.spending.ledger).filter(r => r.season === 2026));
    expect(next.teams.map(t => t.budget)).toEqual(s.teams.map(t => t.budget));
  });
  it('joins the personnel player once into the spring farm and permits the original FA to join', () => {
    const moved = json(run(pending(), settle())); reject(moved, join());
    const s = spring(moved), next = run(s, join());
    expect(next.teams[1].farm.at(-1)).toMatchObject({ id: 'reserve', salary: 1000, contractId: 'c-reserve', contractYearsLeft: 2 });
    expect(next.faPersonnelMoves[0].joinedDate).toBe('2027-02-01');
    const reloaded = json(next); expect(apply(reloaded, join())).toMatchObject({ ok: true, replayed: true, state: reloaded });
    reject(next, join('bid', 'duplicate'));
    const faJoined = run(next, { id: 'join-fa', type: 'join-fa', proposalId: 'bid' });
    expect(faJoined.teams[0].farm.some(p => p.id === 'fa-bid')).toBe(true);
    const later = { ...faJoined, phase: 'season', date: '2027-04-01' };
    expect(quote(later, settle()).replayed).toBe(true);
  });
  it.each([false, true])('uses same-league priority independent of input order (reverse=%s)', reverse => {
    const s = competing(), choices = [choice('bid0', 1), choice('bid1', 2)];
    if (reverse) choices.reverse(); const command = settle(choices), q = quote(s, command);
    expect(q.ok, q.error).toBe(true); expect(q.personnel).toMatchObject({ winnerProposalIds: ['bid0'], lostProposalIds: ['bid1'] });
    const next = run(s, command);
    expect(next.spending.faCompensations.find(r => r.proposalId === 'bid1').resolution).toBe('pending');
    expect(next.faPersonnelMoves).toHaveLength(1); expect(next.spending.oneOffCosts).toHaveLength(2);
    expect(quoteFaProtectionList(next, { proposalId: 'bid1' }).protection.candidatePlayerIds).toEqual(['other']);
    const retried = run(next, settle([choice('bid1', 2, 'other')], 'retry'));
    expect(retried.faPersonnelMoves).toHaveLength(2);
  });
  it('uses lower exact pennant winning rate when the old clubs share a league', () => {
    const s = competing([1, 3]);
    const next = run(s, settle([choice('bid0', 1), choice('bid1', 3)]));
    expect(next.faPersonnelMoves[0].proposalId).toBe('bid1');
  });
  it('allows independent choices to settle together without standings metadata', () => {
    const s = competing(); delete s.faCompensationStandings;
    const next = run(s, settle([choice('bid0', 1), choice('bid1', 2, 'other')]));
    expect(next.faPersonnelMoves).toHaveLength(2); expect(next.spending.oneOffCosts).toHaveLength(4);
  });
  it.each(['missing', 'incomplete', 'duplicate', 'zero-games', 'wrong-season', 'tie', 'same-old-club'])(
    'rejects unresolvable priority (%s) without moving or paying anything', kind => {
      const s = competing(kind === 'same-old-club' ? [1, 1] : [1, 3]);
      const rows = s.faCompensationStandings[0].teams;
      if (kind === 'missing') delete s.faCompensationStandings;
      if (kind === 'incomplete') rows.splice(3, 1);
      if (kind === 'duplicate') rows.push(json(rows[1]));
      if (kind === 'zero-games') { rows[1].wins = 0; rows[1].losses = 0; }
      if (kind === 'wrong-season') s.faCompensationStandings[0].season = 2025;
      if (kind === 'tie') { rows[3].wins = rows[1].wins * 2; rows[3].losses = rows[1].losses * 2; }
      reject(s, settle([choice('bid0', 1), choice('bid1', kind === 'same-old-club' ? 1 : 3)]));
    });
  it('compares close winning rates without rounded display ties', () => {
    const s = competing([1, 3]), rows = s.faCompensationStandings[0].teams;
    rows[1].wins = 10000001; rows[1].losses = 10000000; rows[3].wins = 10000000; rows[3].losses = 10000000;
    expect(run(s, settle([choice('bid0', 1), choice('bid1', 3)])).faPersonnelMoves[0].teamId).toBe(3);
  });
  it.each(['missing-case', 'duplicate-case', 'wrong-owner', 'protected', 'unsubmitted', 'new-arrival', 'extra-field', 'type-collision'])(
    'rejects invalid selection %s', kind => {
      let s = competing(), selections = [choice('bid0', 1), choice('bid1', 2, 'other')];
      if (kind === 'missing-case') selections.pop();
      if (kind === 'duplicate-case') selections[1] = json(selections[0]);
      if (kind === 'wrong-owner') selections[0].teamId = 2;
      if (kind === 'protected') selections[0].playerId = 'a';
      if (kind === 'unsubmitted') s = claim();
      if (kind === 'new-arrival') { own(s, 'late'); selections[0].playerId = 'late'; }
      if (kind === 'extra-field') selections[0].salary = 1;
      if (kind === 'type-collision') selections[0].teamId = '1';
      reject(s, settle(selections));
    });
  it.each(['foreign', 'development', 'retired', 'fa', 'waiver', 'rookie'])('rechecks current %s eligibility after submission', kind => {
    const s = pending(), p = s.teams[0].farm.find(p => p.id === 'reserve');
    if (kind === 'foreign') p.isForeign = true;
    if (kind === 'retired') p.isRetired = true;
    if (kind === 'development') { p.isIkusei = true; s.spending.ledger.records.find(r => r.contract.playerId === p.id).contract.registrationType = 'development'; }
    if (kind === 'fa') p.isFA = true;
    if (kind === 'waiver') p.isWaiverReleased = true;
    if (kind === 'rookie') s.draftContext = { draftPool: [json(p)], drafted: { reserve: 0 }, confirmedPicks: {} };
    reject(s);
  });
  it('keeps injury data and removes departed players from lineup, fielding and pitching references', () => {
    const s = pending(), t = s.teams[0];
    t.farm.find(p => p.id === 'reserve').injuryDaysLeft = 20;
    t.lineup = ['reserve', 'a']; t.lineupDh = ['reserve']; t.rotation = ['reserve'];
    t.fieldingDh = { reserve: '一塁手', a: '二塁手' };
    t.pitchingPattern = { closerId: 'reserve', setupId: 'a', middleOrder: ['reserve', 'a'] };
    const next = run(s, settle());
    expect(next.teams[0]).toMatchObject({ lineup: ['a'], lineupDh: [], rotation: [], fieldingDh: { a: '二塁手' },
      pitchingPattern: { closerId: null, setupId: 'a', middleOrder: ['a'] } });
    expect(run(spring(next), join()).teams[1].farm.at(-1).injuryDaysLeft).toBe(20);
  });
  it('requires a confirmed next-year contract and carries the renewal terms without rewriting the old salary', () => {
    let s = fixture(); own(s, 'expiring', 0, {}, { termYears: 1 }); s = protect(claim(s));
    const cmd = settle([choice('bid', 1, 'expiring')]); reject(json(s), cmd);
    const proposal = { id: 'renew-exp', type: 'sign', teamId: 0, effectiveDate: '2027-02-01',
      contract: terms('expiring', { contractId: 'future-exp', purpose: 'renewal', agreementPhase: 'offseason', termYears: 3, annualSalaryManYen: 1800 }) };
    s = run(s, { id: 'offer-renew', type: 'offer-renewal', proposal, contractId: 'c-expiring' });
    reject(json(s), cmd);
    s = run(s, { id: 'accept-renew', type: 'accept-renewal', proposalId: 'renew-exp', contractId: 'c-expiring' });
    const moved = run(s, cmd), joined = run(spring(moved), join());
    expect(joined.teams[1].farm.at(-1)).toMatchObject({ id: 'expiring', salary: 1800, contractId: 'future-exp', contractYearsLeft: 3 });
    expect(moved.spending.ledger.records.find(r => r.contract.contractId === 'c-expiring')).toEqual(s.spending.ledger.records.find(r => r.contract.contractId === 'c-expiring'));
    expect(moved.faPersonnelMoves[0].transfers.map(a => a.contractId)).toEqual(['future-exp']);
  });
  it('transfers both a continuing current contract and a separately confirmed later renewal', () => {
    const s = pending();
    const c = terms('reserve', { contractId: 'future-reserve', signedSeason: 2028, agreementPhase: 'offseason', purpose: 'renewal', termYears: 2, annualSalaryManYen: 2100 });
    s.spending.ledger = applyContractLedgerAction(s.spending.ledger, { id: 'future-reserve-sign', type: 'sign', teamId: 0, effectiveDate: '2029-02-01', contract: c });
    const next = run(s, settle());
    expect(next.faPersonnelMoves[0].transfers.map(a => a.contractId)).toEqual(['c-reserve', 'future-reserve']);
    expect([2027, 2028, 2029, 2030].map(y => row(next, 1, y).salaryManYen - row(s, 1, y).salaryManYen)).toEqual([1000, 1000, 2100, 2100]);
  });
  it('uses the actual spring date for prorated salary without changing the original annual rate', () => {
    const s = { ...spring(pending()), date: '2027-03-16' }, next = run(s, settle());
    const liability = contractLiabilityRows(next.spending.ledger).filter(r => r.contractId === 'c-reserve' && r.season === 2027);
    expect(liability.map(r => [r.teamId, r.amountManYen])).toEqual([[0, 148], [1, 852]]);
    expect(run(next, join()).teams[1].farm.at(-1).salary).toBe(1000);
  });
  it.each([2027, 2028, 2029, 2030])('rejects a new salary burden in underfunded year %s atomically', season => {
    const s = pending(), r = s.spending.authorizations.find(a => a.teamId === 1 && a.season === season);
    if (season >= 2029) {
      const c = terms('reserve', { contractId: 'later', signedSeason: 2028, agreementPhase: 'offseason', purpose: 'renewal', termYears: 2 });
      s.spending.ledger = applyContractLedgerAction(s.spending.ledger, { id: 'later-sign', type: 'sign', teamId: 0, effectiveDate: '2029-02-01', contract: c });
    }
    r.approvedManYen = 0;
    s.spending.oneOffCosts.push({ id: `existing-coach-${season}`, teamId: 1, season, kind: 'coach', amountManYen: 10000 });
    reject(s);
  });
  it('counts the 70th personnel player once before and after joining', () => {
    let s = fixture(); for (let i = 0; i < 68; i++) own(s, `extra-${i}`, 1);
    s = protect(claim(s)); const next = run(s, settle());
    expect(next.teams[1].farm).toHaveLength(69);
    expect(run(spring(next), join()).teams[1].farm).toHaveLength(70);
    expect(next.faPersonnelMoves).toHaveLength(1);
  });
  it.each(['owned', 'rookie', 'pending-fa'])('rejects the 71st slot including %s reservations', kind => {
    let s = fixture(); for (let i = 0; i < (kind === 'owned' ? 69 : 68); i++) own(s, `extra-${i}`, 1);
    if (kind === 'rookie') s.draftContext = { draftPool: [player('drafted')], drafted: { drafted: 1 }, confirmedPicks: {} };
    if (kind === 'pending-fa') s = claim(s, 'receiver-fa', 3, {}, 'A', 1);
    s = protect(claim(s)); reject(s);
  });
  it('preserves original choices and replays a reordered JSON batch once', () => {
    const selections = [choice('bid0', 1), choice('bid1', 2, 'other')], s = json(run(competing(), settle(selections)));
    const result = apply(s, settle([...selections].reverse())); expect(result.ok, result.error).toBe(true);
    expect(result.replayed).toBe(true); expect(result.state).toBe(s);
    reject(s, settle([choice('bid0', 1, 'other'), choice('bid1', 2)]));
    reject(json(result.state), settle(selections, 'another-settlement'));
  });
  it.each(['move', 'receipt', 'cash', 'ledger', 'protection', 'join-receipt', 'orphan-payload', 'choice', 'duplicate-move', 'priority'])(
    'rejects altered or orphaned %s history before replay', kind => {
      let s = kind === 'priority' ? run(competing(), settle([choice('bid0', 1), choice('bid1', 2)])) : run(pending(), settle());
      if (kind === 'join-receipt') { s = run(spring(s), join()); s.transactions = s.transactions.filter(r => r.id !== 'join-personnel'); }
      if (kind === 'move') s.faPersonnelMoves[0].player.name = 'changed';
      if (kind === 'receipt') delete s.transactions.find(r => r.id === 'personnel').faPersonnel;
      if (kind === 'cash') s.spending.oneOffCosts[0].amountManYen++;
      if (kind === 'ledger') s.spending.ledger.records.find(r => r.contract.playerId === 'reserve').changes = [];
      if (kind === 'protection') s.faProtectionLists = [];
      if (kind === 'orphan-payload') s.faPersonnelMoves = [];
      if (kind === 'choice') s.transactions.find(r => r.id === 'personnel').signature = JSON.stringify({ id: 'personnel', type: 'settle-fa-personnel', selections: [] });
      if (kind === 'duplicate-move') s.faPersonnelMoves.push(json(s.faPersonnelMoves[0]));
      if (kind === 'priority') s.faCompensationStandings[0].teams[1].league = 'パ';
      reject(s);
    });
  it('allows later trades and subsequent years while retaining the original compensation history', () => {
    let s = run(spring(run(pending(), settle())), join());
    s = run(s, { id: 'join-original-fa', type: 'join-fa', proposalId: 'bid' });
    s = run({ ...s, phase: 'season', date: '2027-06-01' }, { id: 'later-trade', type: 'trade', fromId: 1, toId: 2,
      outgoingIds: ['reserve'], incomingIds: ['c'], cashManYen: 0, mode: 'spend' });
    expect(s.teams[2].players.some(p => p.id === 'reserve') || s.teams[2].farm.some(p => p.id === 'reserve')).toBe(true);
    s = json({ ...s, season: 2028, phase: 'preseason', date: '2028-02-01', spending: { ...s.spending, budgetSeason: 2028 } });
    expect(quote(s, settle())).toMatchObject({ ok: true, replayed: true });
  });
  it('blocks date rewind and season progression with an unjoined personnel player', () => {
    const s = run(pending(), settle()); reject({ ...json(s), date: '2026-12-04' });
    const faJoined = run(spring(s), { id: 'join-original-fa', type: 'join-fa', proposalId: 'bid' });
    reject({ ...faJoined, phase: 'season', date: '2027-04-01' }, join());
  });
  it('preserves numeric player IDs, including zero, through JSON and replay', () => {
    const s = fixture(); own(s, 0); const command = settle([choice('bid', 1, 0)]);
    const next = json(run(protect(claim(s)), command));
    expect(next.faPersonnelMoves[0].player.id).toBe(0);
    expect(apply(next, command)).toMatchObject({ ok: true, replayed: true });
    expect(run(spring(next), join()).teams[1].farm.at(-1).id).toBe(0);
  });
  it('does not reactivate an older draft assignment when a recorded former rookie moves into a pending snapshot', () => {
    let s = fixture(); own(s, 'former-rookie', 0, {}, { signedSeason: 2025, agreementPhase: 'offseason' });
    const record = s.spending.ledger.records.find(r => r.contract.playerId === 'former-rookie');
    s.spending.resolvedReservations.push({ kind: 'rookie', resolution: 'accepted', proposal: {
      id: record.actionId, type: 'sign', teamId: 0, effectiveDate: record.effectiveDate, contract: json(record.contract) } });
    s.draftContext = { draftPool: [player('former-rookie')], drafted: { 'former-rookie': 0 }, confirmedPicks: {} };
    s = protect(claim(s));
    const next = run(s, settle([choice('bid', 1, 'former-rookie')]));
    expect(next.spending.authorizations.find(a => a.teamId === 0 && a.season === 2027).minimumRosterReserveManYen).toBe(0);
    expect(run(spring(next), join()).teams[1].farm.some(p => p.id === 'former-rookie')).toBe(true);
  });
  it('rejects a personnel departure whose restored roster reserve creates an actual deficit', () => {
    let s = fixture();
    s.spending.ledger.records.find(r => r.contract.playerId === 'reserve').contract.annualSalaryManYen = 420;
    s.teams[0].farm.find(p => p.id === 'reserve').salary = 420;
    s = { ...spring(protect(claim(s, 'bid', 1, { previousAnnualSalaryManYen: 420, exercise: 'repeat' }, 'B'))), date: '2027-03-31' };
    s.rosterRequirements.find(r => r.teamId === 0 && r.season === 2027).requiredControlledCount = 4;
    s.spending.authorizations.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = 3546;
    expect(row(s, 0).remainingManYen).toBe(0);
    reject(s);
  });
  it('rejects an orphan future-contract transfer even when both move snapshots omit it', () => {
    const s = pending(), c = terms('reserve', { contractId: 'future-reserve', signedSeason: 2028,
      agreementPhase: 'offseason', purpose: 'renewal', termYears: 2 });
    s.spending.ledger = applyContractLedgerAction(s.spending.ledger, { id: 'future-reserve-sign', type: 'sign', teamId: 0,
      effectiveDate: '2029-02-01', contract: c });
    const next = json(run(s, settle()));
    next.faPersonnelMoves[0].transfers.pop();
    next.transactions.find(r => r.id === 'personnel').faPersonnel.moves[0].transfers.pop();
    reject(next);
  });
});
