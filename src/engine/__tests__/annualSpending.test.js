import { describe, expect, it } from 'vitest';
import { createSeasonContract } from '../seasonContract';
import { createContractLedger, applyContractLedgerAction as apply, closeContractLedgerThrough } from '../contractLedger';
import { quoteAnnualSpendingPlan as quote, assessAnnualSpendingChange as assess,
  reserveContractProposal as reserve, cancelContractReservation as cancel, commitContractReservation as commit } from '../annualSpending';

const proposal = ({ id = 's1', contractId = 'c1', playerId = 0, teamId = 0, salary = 10000,
  years = 3, date = '2026-07-01', guaranteed = true } = {}) => ({ id, type: 'sign', teamId, effectiveDate: date,
  contract: createSeasonContract({ contractId, playerId, signedSeason: 2026, agreementPhase: 'preseason', purpose: 'acquisition',
    termYears: years, annualSalaryManYen: salary, guaranteed }) });
const plan = extra => ({ version: 1, budgetSeason: 2026, ledger: createContractLedger(), reservations: [], resolvedReservations: [], oneOffCosts: [],
  authorizations: [0, 1].flatMap(teamId => Array.from({ length: 7 }, (_, i) => ({ teamId, season: 2026 + i,
    approvedManYen: 30000, minimumRosterReserveManYen: 0 }))), ...extra });
const row = (p, season = 2026, teamId = 0) => quote(p).find(r => r.teamId === teamId && r.season === season);
const move = (id, contractId, teamId, toTeamId, date = '2026-07-16') => ({ id, type: 'transfer', contractId, teamId, toTeamId, effectiveDate: date });
const cash = (id, teamId, amountManYen, season = 2026, kind = 'trade') => ({ id, teamId, season, kind, amountManYen });

describe('annual spending permission and offer reservations', () => {
  it('counts salary, guarantees, holds, one-off costs and the unfunded roster floor separately', () => {
    const original = plan();
    original.authorizations[0].minimumRosterReserveManYen = 2000;
    original.oneOffCosts = [cash(0, 0, 800, 2026, 'coach')];
    const held = reserve(original, { kind: 'offer', proposal: proposal() });
    expect(row(held)).toMatchObject({ approvedManYen: 30000, salaryManYen: 0, guaranteeManYen: 0,
      reservedManYen: 5000, oneOffManYen: 800, minimumRosterReserveManYen: 2000, remainingManYen: 22200 });
    expect(row(held, 2027).remainingManYen).toBe(20000);
    expect(original.reservations).toEqual([]);
  });
  it('replaces the held offer with exact committed annual liability once', () => {
    const p = proposal(), held = reserve(plan(), { kind: 'offer', proposal: p });
    const before = JSON.stringify(held), accepted = commit(held, p);
    expect(accepted.reservations).toEqual([]);
    expect([2026, 2027, 2028].map(y => row(accepted, y).salaryManYen)).toEqual([5000, 10000, 10000]);
    expect(quote(accepted).map(r => r.remainingManYen)).toEqual(quote(held).map(r => r.remainingManYen));
    expect(JSON.stringify(held)).toBe(before);
    const restored = JSON.parse(JSON.stringify(accepted));
    expect(commit(restored, structuredClone(p))).toBe(restored);
    expect(cancel(restored, p.id)).toBe(restored);
  });
  it('retains unrelated rookie/renewal holds when accepting or cancelling another offer', () => {
    const a = proposal(), b = proposal({ id: 's2', contractId: 'c2', playerId: 1, salary: 500, years: 1 });
    const held = reserve(reserve(plan(), { kind: 'offer', proposal: a }), { kind: 'rookie', proposal: b });
    expect(row(commit(held, a)).reservedManYen).toBe(250);
    expect(row(cancel(held, a.id)).reservedManYen).toBe(250);
    const cancelled = cancel(held, a.id);
    expect(cancel(cancelled, a.id)).toBe(cancelled);
    expect(() => commit(cancelled, a)).toThrow();
  });
  it('reserves a replacement before discarding the old hold and rejects stale acceptance', () => {
    const a = proposal(), b = proposal({ id: 's2', salary: 12000 });
    const held = reserve(plan(), { kind: 'offer', proposal: a });
    const replaced = reserve(held, { kind: 'offer', proposal: b, replaceId: a.id });
    expect(replaced.reservations).toHaveLength(1);
    expect(row(replaced).reservedManYen).toBe(6000);
    expect(() => commit(replaced, a)).toThrow();
    expect(row(held).reservedManYen).toBe(5000);
  });
  it.each(['cancel', 'replace'])('does not revive a %s-resolved proposal after reload or permit conflicting ID reuse', operation => {
    const a = proposal(), held = reserve(plan(), { kind: 'offer', proposal: a });
    const resolved = operation === 'cancel' ? cancel(held, a.id)
      : reserve(held, { kind: 'offer', proposal: proposal({ id: 's2' }), replaceId: a.id });
    const loaded = JSON.parse(JSON.stringify(resolved));
    expect(() => reserve(loaded, { kind: 'offer', proposal: proposal({ salary: 12000 }) })).toThrow();
    expect(reserve(loaded, { kind: 'offer', proposal: a })).toBe(loaded);
    expect(cancel(loaded, a.id)).toBe(loaded);
    expect(() => commit(loaded, a)).toThrow();
  });
  it('does not let a before/after snapshot erase or rewrite a resolved offer identity', () => {
    const resolved = cancel(reserve(plan(), { kind: 'offer', proposal: proposal() }), 's1');
    expect(resolved.resolvedReservations).toHaveLength(1);
    expect(() => assess(resolved, { ...resolved, resolvedReservations: [] })).toThrow();
    const altered = structuredClone(resolved.resolvedReservations);
    altered[0].proposal.contract.annualSalaryManYen = 20000;
    expect(() => assess(resolved, { ...resolved, resolvedReservations: altered })).toThrow();
  });
  it('requires an existing active offer to remain identical or acquire a matching resolution', () => {
    const p = proposal(), held = reserve(plan(), { kind: 'offer', proposal: p });
    expect(() => assess(held, { ...held, reservations: [] })).toThrow();
    const rewritten = [{ kind: 'offer', proposal: proposal({ salary: 12000 }) }];
    expect(() => assess(held, { ...held, reservations: rewritten })).toThrow();
  });
  it('rejects corrupt resolved histories rather than reopening or silently fixing them', () => {
    const p = proposal(), cancelled = cancel(reserve(plan(), { kind: 'offer', proposal: p }), p.id);
    const item = cancelled.resolvedReservations[0];
    for (const invalid of [
      { ...cancelled, resolvedReservations: undefined },
      { ...cancelled, resolvedReservations: [item, item] },
      { ...cancelled, resolvedReservations: [{ ...item, resolution: 'accepted' }] },
      { ...cancelled, reservations: [{ kind: 'offer', proposal: p }] },
      { ...cancelled, ledger: apply(cancelled.ledger, p) },
    ]) expect(() => quote(invalid)).toThrow();
  });
  it.each([0, 1])('accepts club %i among competing bids and resolves only overlapping offers for that player', winnerTeam => {
    const a = proposal(), b = proposal({ id: 's2', contractId: 'c2', teamId: 1 });
    const rookie = proposal({ id: 's3', contractId: 'c3', playerId: 1, salary: 500, years: 1 });
    let held = reserve(reserve(plan(), { kind: 'offer', proposal: a }), { kind: 'offer', proposal: b });
    held = reserve(held, { kind: 'rookie', proposal: rookie });
    const winner = winnerTeam === 0 ? a : b, loser = winnerTeam === 0 ? b : a;
    const accepted = commit(held, winner);
    expect(accepted.reservations.map(h => h.proposal.id)).toEqual(['s3']);
    expect(row(accepted, 2026, winnerTeam).salaryManYen).toBe(5000);
    expect(() => commit(accepted, loser)).toThrow();
    expect(reserve(accepted, { kind: 'offer', proposal: loser })).toBe(accepted);
    expect(commit(accepted, winner)).toBe(accepted);
  });
  it('preserves a nonoverlapping future hold for the same player', () => {
    const current = proposal({ years: 1 });
    const future = { id: 'future', type: 'sign', teamId: 1, effectiveDate: '2027-02-01',
      contract: createSeasonContract({ contractId: 'future', playerId: 0, signedSeason: 2026, agreementPhase: 'offseason',
        purpose: 'acquisition', termYears: 1, annualSalaryManYen: 1000, guaranteed: true }) };
    const held = reserve(reserve(plan(), { kind: 'offer', proposal: current }), { kind: 'offer', proposal: future });
    expect(commit(held, current).reservations.map(h => h.proposal.id)).toEqual(['future']);
  });
  it('can release a losing hold in a deficit club while another club accepts the player', () => {
    let input = plan({ ledger: apply(createContractLedger(), proposal({ id: 'old', contractId: 'old', playerId: 9, teamId: 1, salary: 30000, date: '2026-02-01' })) });
    const a = proposal(), b = proposal({ id: 's2', contractId: 'c2', teamId: 1 });
    input.authorizations = input.authorizations.map(a => a.teamId === 1 ? { ...a, approvedManYen: 50000 } : a);
    let held = reserve(reserve(input, { kind: 'offer', proposal: a }), { kind: 'offer', proposal: b });
    held = { ...held, authorizations: held.authorizations.map(a => a.teamId === 1 ? { ...a, approvedManYen: 29000 } : a) };
    const accepted = commit(held, a);
    expect(row(accepted, 2027, 1).remainingManYen).toBe(-1000);
    expect(accepted.reservations).toHaveLength(0);
  });
  it('rejects conflicting proposal IDs and duplicate committed-plus-held liabilities', () => {
    const p = proposal(), held = reserve(plan(), { kind: 'offer', proposal: p });
    expect(reserve(held, { kind: 'offer', proposal: structuredClone(p) })).toBe(held);
    expect(() => reserve(held, { kind: 'offer', proposal: proposal({ salary: 2000 }) })).toThrow();
    expect(() => commit(held, proposal({ salary: 2000 }))).toThrow();
    const accepted = commit(held, p);
    expect(() => quote({ ...accepted, reservations: held.reservations })).toThrow();
  });
  it('checks the seventh year and does not invent an omitted future authorization', () => {
    const p = proposal({ years: 7 }), input = plan();
    const missing = { ...input, authorizations: input.authorizations.filter(a => a.season !== 2032) };
    expect(() => reserve(missing, { kind: 'offer', proposal: p })).toThrow();
    const short = { ...input, authorizations: input.authorizations.map(a => a.teamId === 0 && a.season === 2032 ? { ...a, approvedManYen: 9999 } : a) };
    expect(() => reserve(short, { kind: 'offer', proposal: p })).toThrow();
    expect(row(input, 2032).remainingManYen).toBe(30000);
  });
  it('rechecks the current cap at acceptance and preserves the held proposal on failure', () => {
    const p = proposal(), held = reserve(plan(), { kind: 'offer', proposal: p });
    const reduced = { ...held, authorizations: held.authorizations.map(a => a.teamId === 0 ? { ...a, approvedManYen: 100 } : a) };
    const before = JSON.stringify(reduced);
    expect(() => commit(reduced, p)).toThrow();
    expect(JSON.stringify(reduced)).toBe(before);
  });
  it('retains guaranteed debt after release and refuses fabricated or rewritten headroom', () => {
    let ledger = apply(createContractLedger(), proposal({ date: '2026-02-01' }));
    ledger = apply(ledger, { id: 'end', type: 'end', contractId: 'c1', teamId: 0,
      effectiveDate: '2026-07-16', reason: 'release', settlement: 'retain' });
    const before = plan({ ledger });
    expect(row(before)).toMatchObject({ salaryManYen: 5484, guaranteeManYen: 4516, remainingManYen: 20000 });
    expect(row(before, 2027).guaranteeManYen).toBe(10000);
    expect(() => assess(before, { ...before, ledger: createContractLedger() })).toThrow();
    const caps = before.authorizations.map(a => ({ ...a, approvedManYen: 999999 }));
    expect(() => assess(before, { ...before, authorizations: caps })).toThrow();
  });
  it('does not let an unrelated deficit block another club spending within its own cap', () => {
    const before = plan({ ledger: apply(createContractLedger(), proposal({ date: '2026-02-01' })) });
    before.authorizations = before.authorizations.map(a => a.teamId === 0 ? { ...a, approvedManYen: 9000 } : a);
    const after = { ...before, ledger: apply(before.ledger, proposal({ id: 's2', contractId: 'c2', playerId: 1, teamId: 1, salary: 500, years: 1 })) };
    expect(assess(before, after).ok).toBe(true);
  });
  it('returns all affected club/year rows when a contract makes a future year unaffordable', () => {
    const before = plan(); before.authorizations.find(a => a.teamId === 0 && a.season === 2028).approvedManYen = 9000;
    const after = { ...before, ledger: apply(before.ledger, proposal()) };
    const result = assess(before, after);
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ teamId: 0, season: 2028, remainingManYen: -1000 });
  });
  it('allows signed trade cash only, without turning prize income into permission', () => {
    expect(row(plan({ oneOffCosts: [cash(0, 0, -500)] })).remainingManYen).toBe(30500);
    expect(() => quote(plan({ oneOffCosts: [cash(0, 0, -500, 2026, 'scouting')] }))).toThrow();
    expect(() => quote(plan({ oneOffCosts: [cash(0, 0, -500, 2026, 'prize')] }))).toThrow();
  });
  it('requires both sides of new trade cash in each budget year', () => {
    const before = plan();
    expect(() => assess(before, { ...before, oneOffCosts: [cash('receive', 0, -500)] })).toThrow();
    const balanced = { ...before, oneOffCosts: [cash('receive', 0, -500), cash('pay', 1, 500)] };
    expect(assess(before, balanced).ok).toBe(true);
    expect(() => assess(before, { ...before, oneOffCosts: [cash('receive', 0, -500), cash('pay', 1, 500, 2027)] })).toThrow();
    const poor = { ...before, authorizations: before.authorizations.map(a => a.teamId === 1 ? { ...a, approvedManYen: 100 } : a) };
    expect(assess(poor, { ...poor, oneOffCosts: balanced.oneOffCosts }).ok).toBe(false);
  });
  it('rejects missing/duplicate records and safe-integer overflow rather than treating them as zero', () => {
    const input = plan();
    for (const invalid of [null, {}, { ...input, version: 2 }, { ...input, authorizations: undefined },
      { ...input, authorizations: [...input.authorizations, input.authorizations[0]] },
      { ...input, oneOffCosts: [cash(0, 0, undefined)] },
      { ...input, oneOffCosts: [cash(0, 0, Number.MAX_SAFE_INTEGER), cash(1, 0, 1)] }]) expect(() => quote(invalid)).toThrow();
    expect(row(plan({ authorizations: [{ teamId: 0, season: 2026, approvedManYen: 0, minimumRosterReserveManYen: 0 }] })).remainingManYen).toBe(0);
  });
  it('keeps closed-year costs unchanged and forbids backdated new spending', () => {
    const before = plan({ budgetSeason: 2027, ledger: closeContractLedgerThrough(createContractLedger(), 2026),
      oneOffCosts: [cash('old', 0, 500, 2026)] });
    expect(quote(before).every(r => r.season >= 2027)).toBe(true);
    expect(() => assess(before, { ...before, oneOffCosts: [] })).toThrow();
    expect(() => assess(before, { ...before, oneOffCosts: [...before.oneOffCosts, cash('new', 0, 100, 2026)] })).toThrow();
    const alteredHistory = before.authorizations.map(a => a.season === 2026 ? { ...a, minimumRosterReserveManYen: 100 } : a);
    expect(() => assess(before, { ...before, authorizations: alteredHistory })).toThrow();
  });
  it('holds a next-season renewal without changing the current salary, including replay after year closure', () => {
    const current = proposal({ years: 1, date: '2026-02-01' });
    const next = { id: 'renewal', type: 'sign', teamId: 0, effectiveDate: '2027-02-01',
      contract: createSeasonContract({ contractId: 'c2', playerId: 0, signedSeason: 2026, agreementPhase: 'offseason',
        purpose: 'renewal', termYears: 3, annualSalaryManYen: 12000, guaranteed: true }) };
    const before = plan({ ledger: apply(createContractLedger(), current) });
    const held = reserve(before, { kind: 'renewal', proposal: next });
    expect(row(held)).toMatchObject({ salaryManYen: 10000, reservedManYen: 0 });
    expect(row(held, 2027)).toMatchObject({ salaryManYen: 0, reservedManYen: 12000 });
    const accepted = commit(held, next);
    const following = { ...accepted, budgetSeason: 2027, ledger: closeContractLedgerThrough(accepted.ledger, 2026) };
    expect(commit(following, JSON.parse(JSON.stringify(next)))).toBe(following);
    expect(row(following, 2027)).toMatchObject({ salaryManYen: 12000, reservedManYen: 0 });
  });
});

describe('two-club cashless trade exception', () => {
  function deficitPlan({ firstSalary = 10000, secondSalary = 10000, secondYears = 7 } = {}) {
    let ledger = apply(createContractLedger(), proposal({ date: '2026-02-01', salary: firstSalary, years: 7 }));
    ledger = apply(ledger, proposal({ id: 's2', contractId: 'c2', playerId: 1, teamId: 1, date: '2026-02-01', salary: secondSalary, years: secondYears }));
    const input = plan({ ledger });
    input.authorizations = input.authorizations.map(a => ({ ...a, approvedManYen: a.teamId === 0 ? 9000 : 30000 }));
    return input;
  }
  function swapped(before) {
    const first = apply(before.ledger, move('t1', 'c1', 0, 1));
    return { ...before, ledger: apply(first, move('t2', 'c2', 1, 0)) };
  }
  it('allows a deficit-preserving salary swap only through the explicit cashless mode', () => {
    const before = deficitPlan(), after = swapped(before);
    expect(assess(before, after).ok).toBe(false);
    expect(assess(before, after, { mode: 'cashless-trade' }).ok).toBe(true);
    expect(row(after, 2032).remainingManYen).toBe(-1000);
  });
  it('checks the buyer as well as the seller and rejects a worsening future deficit', () => {
    const before = deficitPlan({ secondSalary: 11000 }), after = swapped(before);
    const result = assess(before, after, { mode: 'cashless-trade' });
    expect(result.ok).toBe(false);
    expect(result.violations.some(r => r.teamId === 0 && r.season === 2032)).toBe(true);
  });
  it('rejects a one-way transfer as an exception while allowing it through ordinary funded approval', () => {
    const before = deficitPlan();
    const after = { ...before, ledger: apply(before.ledger, move('t1', 'c1', 0, 1)) };
    expect(row(after, 2032, 1).remainingManYen).toBe(10000);
    expect(() => assess(before, after, { mode: 'cashless-trade' })).toThrow();
    expect(assess(before, after).ok).toBe(true);
  });
  it('rejects a reciprocal exchange that worsens a positive remainder in the receiving club', () => {
    const before = deficitPlan({ secondSalary: 5000 }), after = swapped(before);
    const result = assess(before, after, { mode: 'cashless-trade' });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(7);
    expect(result.violations.every(r => r.teamId === 1 && r.remainingManYen > 0)).toBe(true);
    expect(result.violations.find(r => r.season === 2032)).toMatchObject({
      beforeRemainingManYen: 25000, remainingManYen: 20000, changeManYen: -5000 });
    expect(assess(before, after).ok).toBe(true);
  });
  it('allows the ordinary seller to reduce liability even when it remains in deficit', () => {
    let before = deficitPlan();
    before = { ...before, ledger: apply(before.ledger, proposal({ id: 'other', contractId: 'other',
      playerId: 2, date: '2026-02-01', years: 7 })) };
    const after = { ...before, ledger: apply(before.ledger, move('t1', 'c1', 0, 1)) };
    expect(row(after)).toMatchObject({ salaryManYen: 15484, remainingManYen: -6484 });
    expect(row(after, 2032)).toMatchObject({ salaryManYen: 10000, remainingManYen: -1000 });
    expect(assess(before, after).ok).toBe(true);
  });
  it('allows a deficit seller reduction when the funded buyer raises the transferred salary', () => {
    const before = plan({ ledger: apply(createContractLedger(), proposal({ date: '2026-02-01', years: 7 })) });
    before.authorizations = before.authorizations.map(a => a.teamId === 0 ? { ...a, approvedManYen: 4000 } : a);
    const moved = { ...before, ledger: apply(before.ledger, move('t1', 'c1', 0, 1, '2026-07-01')) };
    const after = { ...moved, ledger: apply(moved.ledger, { id: 'raise', type: 'increase', contractId: 'c1',
      teamId: 1, effectiveDate: '2026-07-16', annualSalaryManYen: 20000 }) };
    expect(assess(before, moved).ok).toBe(true);
    expect(row(after)).toMatchObject({ salaryManYen: 5000, remainingManYen: -1000 });
    expect(row(after, 2026, 1)).toMatchObject({ salaryManYen: 9516, remainingManYen: 20484 });
    expect(row(after, 2032, 1)).toMatchObject({ salaryManYen: 20000, remainingManYen: 10000 });
    expect(assess(before, after).ok).toBe(true);
  });
  it.each([30000, 9999])('rejects a seventh-year-only worsening with receiving cap %i', seventhCap => {
    const before = deficitPlan({ secondYears: 6 });
    before.authorizations = before.authorizations.map(a => ({ ...a,
      approvedManYen: a.teamId === 1 && a.season === 2032 ? seventhCap : 30000 }));
    const after = swapped(before), result = assess(before, after, { mode: 'cashless-trade' });
    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]).toMatchObject({ teamId: 1, season: 2032,
      beforeRemainingManYen: seventhCap, remainingManYen: seventhCap - 10000, changeManYen: -10000 });
    expect(assess(before, after).ok).toBe(seventhCap === 30000);
  });
  it('rejects a one-way zero-salary transfer through the exception', () => {
    const before = deficitPlan({ firstSalary: 0 });
    const after = { ...before, ledger: apply(before.ledger, move('t1', 'c1', 0, 1)) };
    expect(() => assess(before, after, { mode: 'cashless-trade' })).toThrow();
    expect(assess(before, after).ok).toBe(true);
  });
  it('does not let a zero-salary return contract disguise a one-sided liability increase', () => {
    const before = deficitPlan({ secondSalary: 0 }), after = swapped(before);
    const result = assess(before, after, { mode: 'cashless-trade' });
    expect(result.ok).toBe(false);
    expect(result.violations.find(r => r.teamId === 1 && r.season === 2032)).toMatchObject({
      beforeRemainingManYen: 30000, remainingManYen: 20000, changeManYen: -10000 });
  });
  it.each(['sign', 'increase', 'cash', 'holds'])('does not let the cashless mode bypass %s checks', kind => {
    const before = deficitPlan(); let after = swapped(before);
    if (kind === 'sign') after = { ...after, ledger: apply(after.ledger, proposal({ id: 's3', contractId: 'c3', playerId: 2, salary: 0, years: 1 })) };
    if (kind === 'increase') after = { ...after, ledger: apply(after.ledger, { id: 'raise', type: 'increase',
      contractId: 'c1', teamId: 1, effectiveDate: '2026-07-16', annualSalaryManYen: 11000 }) };
    if (kind === 'cash') after = { ...after, oneOffCosts: [cash('pay', 0, 500), cash('receive', 1, -500)] };
    if (kind === 'holds') after = { ...after, reservations: [{ kind: 'offer', proposal: proposal({ id: 's3', contractId: 'c3', playerId: 2, salary: 0, years: 1 }) }] };
    expect(() => assess(before, after, { mode: 'cashless-trade' })).toThrow();
  });
});

describe('contract termination without new spending', () => {
  function deficitPlan({ guaranteed = true, coachCost = 0 } = {}) {
    const input = plan({ ledger: apply(createContractLedger(), proposal({ date: '2026-02-01', years: 7, guaranteed })),
      oneOffCosts: coachCost ? [cash('coach', 0, coachCost, 2026, 'coach')] : [] });
    input.authorizations = input.authorizations.map(a => a.teamId === 0 ? { ...a, approvedManYen: 9000 } : a);
    return input;
  }
  const ending = (reason = 'release', settlement = 'retain') => ({ id: 'end', type: 'end', contractId: 'c1',
    teamId: 0, effectiveDate: '2026-07-16', reason, settlement });
  const ended = (before, reason, settlement) => ({ ...before, ledger: apply(before.ledger, ending(reason, settlement)) });

  it.each(['release', 'retirement', 'posting'])('allows retained %s debt without creating new annual spending', reason => {
    const before = deficitPlan(), snapshot = structuredClone(before), after = ended(before, reason, 'retain');
    expect(assess(before, after).ok).toBe(true);
    expect(row(after)).toMatchObject({ salaryManYen: 5484, guaranteeManYen: 4516, remainingManYen: -1000 });
    for (let season = 2026; season <= 2032; season++) {
      const r = row(after, season);
      expect(r.salaryManYen + r.guaranteeManYen).toBe(10000);
      expect(r.remainingManYen).toBe(-1000);
      if (season > 2026) expect(r).toMatchObject({ salaryManYen: 0, guaranteeManYen: 10000 });
    }
    expect(before).toEqual(snapshot);
  });
  it.each([
    ['release', false], ['retirement', true], ['posting', true],
  ])('allows a lawful %s waiver while preserving elapsed salary and a remaining deficit', (reason, guaranteed) => {
    const before = deficitPlan({ guaranteed, coachCost: 4000 }), after = ended(before, reason, 'waive');
    expect(assess(before, after).ok).toBe(true);
    expect(row(after)).toMatchObject({ salaryManYen: 5484, guaranteeManYen: 0, oneOffManYen: 4000, remainingManYen: -484 });
    for (let season = 2027; season <= 2032; season++) {
      expect(row(after, season)).toMatchObject({ salaryManYen: 0, guaranteeManYen: 0, remainingManYen: 9000 });
    }
  });
  it.each(['sign', 'expense', 'hold'])('does not exempt new %s spending combined with a retained termination', kind => {
    const before = deficitPlan(); let after = ended(before, 'release', 'retain');
    const newProposal = proposal({ id: 'new', contractId: 'new', playerId: 1, salary: 0, years: 1 });
    if (kind === 'sign') after = { ...after, ledger: apply(after.ledger, newProposal) };
    if (kind === 'expense') after = { ...after, oneOffCosts: [cash('new', 0, 100, 2026, 'scouting')] };
    if (kind === 'hold') after = { ...after, reservations: [{ kind: 'offer', proposal: newProposal }] };
    expect(assess(before, after).ok).toBe(false);
  });
  it('rejects a new contract masked by a larger waived obligation even when the net deficit improves', () => {
    const before = deficitPlan({ guaranteed: false, coachCost: 10000 });
    const after = ended(before, 'release', 'waive');
    after.ledger = apply(after.ledger, proposal({ id: 'new', contractId: 'new', playerId: 1, salary: 1000, years: 1 }));
    expect(row(before).remainingManYen).toBe(-11000);
    expect(row(after).remainingManYen).toBe(-6984);
    expect(assess(before, after).ok).toBe(false);
  });
  it('rejects a raise on another contract masked by a waived obligation', () => {
    const input = deficitPlan({ guaranteed: false, coachCost: 10000 });
    const before = { ...input, ledger: apply(input.ledger,
      proposal({ id: 'other', contractId: 'other', playerId: 1, salary: 1000, date: '2026-02-01', years: 7 })) };
    const after = ended(before, 'release', 'waive');
    after.ledger = apply(after.ledger, { id: 'raise', type: 'increase', contractId: 'other', teamId: 0,
      effectiveDate: '2026-07-16', annualSalaryManYen: 2000 });
    expect(row(after).remainingManYen).toBeGreaterThan(row(before).remainingManYen);
    expect(row(after).remainingManYen).toBeLessThan(0);
    expect(assess(before, after).ok).toBe(false);
  });
  it('rejects a raise on the ending contract masked by its waived future liability', () => {
    const before = deficitPlan({ guaranteed: false, coachCost: 4000 });
    const raised = { ...before, ledger: apply(before.ledger, { id: 'raise', type: 'increase', contractId: 'c1',
      teamId: 0, effectiveDate: '2026-07-01', annualSalaryManYen: 20000 }) };
    const after = ended(raised, 'release', 'waive');
    expect(row(before).remainingManYen).toBe(-5000);
    expect(row(after)).toMatchObject({ salaryManYen: 5968, remainingManYen: -968 });
    expect(assess(before, after).ok).toBe(false);
  });
  it('rejects a masked raise even when termination leaves the annual salary fingerprint unchanged', () => {
    const before = deficitPlan({ guaranteed: false });
    const raised = apply(before.ledger, { id: 'raise', type: 'increase', contractId: 'c1',
      teamId: 0, effectiveDate: '2026-07-01', annualSalaryManYen: 25000 });
    const after = { ...before, ledger: apply(raised, { ...ending('release', 'waive'), effectiveDate: '2026-09-01' }) };
    expect(row(before)).toMatchObject({ salaryManYen: 10000, guaranteeManYen: 0, remainingManYen: -1000 });
    expect(row(after)).toMatchObject({ salaryManYen: 10000, guaranteeManYen: 0, remainingManYen: -1000 });
    expect(assess(before, after).ok).toBe(false);
  });
  it('preserves release history, all seven annual debts and idempotence after JSON reload', () => {
    const before = deficitPlan(), after = ended(before, 'release', 'retain');
    const loaded = JSON.parse(JSON.stringify(after));
    expect(quote(loaded)).toEqual(quote(after));
    expect(loaded.ledger.records[0].contract).toEqual(before.ledger.records[0].contract);
    expect(loaded.ledger.records[0].changes).toEqual([ending()]);
    expect(apply(loaded.ledger, ending())).toBe(loaded.ledger);
    expect(assess(before, loaded).ok).toBe(true);
    expect(assess(loaded, loaded).ok).toBe(true);
    expect(() => apply(loaded.ledger, ending('release', 'waive'))).toThrow();
    expect(quote(loaded).filter(r => r.teamId === 0).map(r => r.salaryManYen + r.guaranteeManYen))
      .toEqual([10000, 10000, 10000, 10000, 10000, 10000, 10000]);
  });
});
