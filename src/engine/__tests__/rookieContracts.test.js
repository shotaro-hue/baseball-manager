import { expect, it, vi } from 'vitest';
import { initDraftPool } from '../draft';
import { makePlayer } from '../playerCore';
import { applyDraftAcquisitions } from '../draftRules';
import { rookieFixture } from './fixtures/rookieWorld';
import { freezeEconomy } from './fixtures/economyWorld';
import { rookieRequest, reduceRookieRequest } from '../rookieContracts';
import { validateEconomySave } from '../economyPersistence';
import { toAnnualState } from '../contractEconomy';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { renewalRequest, reduceRenewalRequest } from '../renewalDecisions';
import { acquisitionRequest, reduceAcquisitionRequest } from '../acquisitionDecisions';
import { createSeasonContract } from '../seasonContract';
import { applyContractLedgerAction } from '../contractLedger';
import { fromAnnualState, reduceEconomyCommand } from '../contractEconomy';

const act = (w, type, playerId = 'rookie') => reduceRookieRequest(w, rookieRequest(w, { type, playerId }));
const success = r => { expect(r.ok, r.error).toBe(true); return r.world; };
const row = w => quoteAnnualSpendingPlan(toAnnualState(w).spending).find(r => r.teamId === 0 && r.season === 2027);

it.each([['rookie', 600, 'controlled'], ['development', 240, 'development']])('reserves %s at its recorded salary without joining or spending current salary', (id, salary, registrationType) => {
  const w = freezeEconomy(rookieFixture()), request = rookieRequest(w, { type: 'reserve', playerId: id });
  const next = success(reduceRookieRequest(w, request));
  expect(next.teams.flatMap(t => [...t.players, ...t.farm]).map(p => [p.id, p.salary])).toEqual(w.teams.flatMap(t => [...t.players, ...t.farm]).map(p => [p.id, p.salary]));
  expect(next.contractEconomy.engine.spending.ledger).toEqual(w.contractEconomy.engine.spending.ledger);
  expect(next.contractEconomy.engine.spending.reservations[0]).toMatchObject({ kind: 'rookie', proposal: { teamId: 0, effectiveDate: '2027-02-01', contract: {
    playerId: id, annualSalaryManYen: salary, registrationType, guaranteed: true, termYears: 1, startSeason: 2027, endSeason: 2027 } } });
  expect(row(next).reservedManYen - row(w).reservedManYen).toBe(salary);
  expect(next.contractEconomy.randomRoot).toEqual(w.contractEconomy.randomRoot);
  const restored = JSON.parse(JSON.stringify(next)); validateEconomySave(restored);
  expect(reduceRookieRequest(restored, request)).toMatchObject({ ok: true, replayed: true, world: restored });
  expect(restored.contractEconomy.engine.transactions).toHaveLength(1);
});

it.each([false, true])('declines a rookie (funded=%s), releases only its hold and replays after reload', funded => {
  let w = rookieFixture(); if (funded) w = success(act(w, 'reserve'));
  w = success(act(w, 'reserve', 'development'));
  const request = rookieRequest(w, { type: 'decline', playerId: 'rookie' }), next = success(reduceRookieRequest(freezeEconomy(w), request));
  expect(next.offseasonPlan.draftResult.drafted.rookie).toBe('refused');
  expect(next.contractEconomy.engine.spending.reservations.map(h => h.proposal.contract.playerId)).toEqual(['development']);
  expect(act(next, 'reserve').ok).toBe(false);
  const restored = JSON.parse(JSON.stringify(next)); validateEconomySave(restored);
  expect(reduceRookieRequest(restored, request)).toMatchObject({ ok: true, replayed: true });
});

it.each(['salary-missing', 'salary-zero', 'salary-negative', 'salary-fraction', 'other-club', 'refused', 'season', 'applied', 'missing-result', 'budget', 'stale', 'epoch', 'extra-terms', 'join'])('fails closed for %s', kind => {
  const w = rookieFixture(); let action = { type: 'reserve', playerId: 'rookie' };
  if (kind === 'salary-missing') delete w.offseasonPlan.draftResult.pool[0].salary;
  if (kind === 'salary-zero') w.offseasonPlan.draftResult.pool[0].salary = 0;
  if (kind === 'salary-negative') w.offseasonPlan.draftResult.pool[0].salary = -1;
  if (kind === 'salary-fraction') w.offseasonPlan.draftResult.pool[0].salary = 600.5;
  if (kind === 'other-club') action.playerId = 'other';
  if (kind === 'refused') w.offseasonPlan.draftResult.drafted.rookie = 'refused';
  if (kind === 'season') w.contractEconomy.clock = { season: 2026, phase: 'season', date: '2026-12-01', offseasonTurn: 0 };
  if (kind === 'applied') w.offseasonPlan.draftApplied = true;
  if (kind === 'missing-result') delete w.offseasonPlan.draftResult;
  if (kind === 'budget') for (const list of [w.contractEconomy.budgetPolicies, w.contractEconomy.engine.spending.authorizations]) list.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = 599;
  if (kind === 'extra-terms') action.salary = 1;
  if (kind === 'join') action.type = 'join';
  const request = rookieRequest(w, action);
  if (kind === 'stale') w.contractEconomy.revision++;
  if (kind === 'epoch') request.epoch = 'other';
  const before = JSON.stringify(w), r = reduceRookieRequest(freezeEconomy(w), request);
  expect(r.ok).toBe(false); expect(r.world).toBe(w); expect(JSON.stringify(w)).toBe(before);
});

it('revalidates duplicate attributes and rejects a second reservation', () => {
  const w = rookieFixture(); w.offseasonPlan.draftResult.pool.push({ ...w.offseasonPlan.draftResult.pool[0], age: 30 });
  expect(act(w, 'reserve').ok).toBe(false);
  expect(act(success(act(rookieFixture(), 'reserve')), 'reserve').ok).toBe(false);
});

function fill(w, count) {
  let ledger = w.contractEconomy.engine.spending.ledger;
  for (let i = 1; i < count; i++) {
    const id = `extra-${i}`;
    w.teams[0].farm.push({ id, name: id, pos: '一塁手', salary: 420 });
    ledger = applyContractLedgerAction(ledger, { id: `initial-${id}`, type: 'sign', teamId: 0, effectiveDate: '2026-02-01',
      contract: createSeasonContract({ contractId: `c-${id}`, playerId: id, signedSeason: 2026, agreementPhase: 'preseason',
        purpose: 'acquisition', termYears: 3, annualSalaryManYen: 420, guaranteed: true, registrationType: 'controlled' }) });
  }
  w.contractEconomy.engine.spending.ledger = ledger;
  return fromAnnualState(w, toAnnualState(w));
}

it('counts a 69+1 rookie once, permits development and releases the slot before accepting pending FA', () => {
  let w = fill(rookieFixture(), 69);
  delete w.offseasonPlan.draftResult.drafted.rookie;
  w = success(reduceAcquisitionRequest(w, acquisitionRequest(w, { type: 'offer', playerId: 'free', salary: 10000, years: 1 })));
  w.offseasonPlan.draftResult.drafted.rookie = 0;
  w = success(act(w, 'reserve')); w = success(act(w, 'reserve', 'development'));
  expect(w.contractEconomy.engine.spending.reservations).toHaveLength(3);
  const before = structuredClone(w); before.contractEconomy.clock.offseasonTurn = 4;
  const invalid = success(reduceAcquisitionRequest(before, acquisitionRequest(before, { type: 'resolve-due' })));
  expect(invalid.contractEconomy.decisions[0].status).toBe('invalidated');
  w = success(act(w, 'decline')); w.contractEconomy.clock.offseasonTurn = 4;
  const accepted = success(reduceAcquisitionRequest(w, acquisitionRequest(w, { type: 'resolve-due' })));
  expect(accepted.contractEconomy.decisions[0].status).toBe('accepted');
  expect(accepted.teams[0].farm).toHaveLength(68);
});

it.each(['missing-receipt', 'changed-terms', 'lost-assignment', 'revived-decline'])('rejects %s on save/reload', kind => {
  let w = success(act(rookieFixture(), 'reserve'));
  if (kind === 'missing-receipt') w.contractEconomy.engine.transactions = [];
  if (kind === 'changed-terms') w.contractEconomy.engine.spending.reservations[0].proposal.contract.annualSalaryManYen = 700;
  if (kind === 'lost-assignment') w.offseasonPlan.draftResult.drafted.rookie = 'refused';
  if (kind === 'revived-decline') { w = success(act(w, 'decline')); w.offseasonPlan.draftResult.drafted.rookie = 0; }
  expect(() => validateEconomySave(w)).toThrow();
});

it.each([false, true])('rejects conflicting recorded salaries regardless of duplicate order (reverse=%s)', reverse => {
  const w = rookieFixture(), duplicate = { ...w.offseasonPlan.draftResult.pool[0], salary: 1000 };
  if (reverse) w.offseasonPlan.draftResult.pool.unshift(duplicate); else w.offseasonPlan.draftResult.pool.push(duplicate);
  expect(act(w, 'reserve').ok).toBe(false);
});

it.each(['salary', 'years', 'contract-id'])('rejects a native receipt impersonating human %s terms', kind => {
  const w = rookieFixture(), request = rookieRequest(w, { type: 'reserve', playerId: 'rookie' });
  const offered = success(reduceRookieRequest(w, request));
  const transaction = JSON.parse(offered.contractEconomy.engine.transactions[0].signature), c = transaction.proposal.contract;
  if (kind === 'salary') c.annualSalaryManYen = 420;
  if (kind === 'years') { c.termYears = 2; c.endSeason++; }
  if (kind === 'contract-id') c.contractId = 'other-id';
  let candidate;
  if (kind === 'years') {
    offered.contractEconomy.engine.spending.reservations[0].proposal = transaction.proposal;
    offered.contractEconomy.engine.transactions[0].signature = JSON.stringify(transaction, (_, v) => v && typeof v === 'object' && !Array.isArray(v)
      ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
    candidate = fromAnnualState(offered, toAnnualState(offered));
  } else candidate = success(reduceEconomyCommand(w, { saveId: w.saveId, epoch: w.contractEconomy.epoch, baseRevision: 0, transaction }));
  expect(() => validateEconomySave(candidate)).toThrow();
  expect(reduceRookieRequest(candidate, request).ok).toBe(false);
});

// A fixed random stream exercises real generation, including makePlayer's 240
// floor, without substituting an already-valid 600 salary into the draft path.
function withFixedRandom(fn) {
  let seed = 4;
  const random = vi.spyOn(Math, 'random').mockImplementation(() => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  });
  try { return fn(); } finally { random.mockRestore(); }
}

it('funds a low-ability real generated draft pick at the controlled minimum', () => {
  expect(withFixedRandom(() => makePlayer('先発', 40, true, 18)).salary).toBe(240);
  const pool = withFixedRandom(() => initDraftPool());
  const candidate = [...pool].sort((a, b) => a.salary - b.salary)[0];
  const w = rookieFixture();
  w.offseasonPlan.draftResult = { pool, drafted: { [candidate.id]: 0 } };
  const next = success(act(freezeEconomy(w), 'reserve', candidate.id));
  expect(candidate.salary).toBe(420);
  expect(next.contractEconomy.engine.spending.reservations[0].proposal.contract).toMatchObject({
    annualSalaryManYen: 420, registrationType: 'controlled', guaranteed: true, termYears: 1 });
});

it('prepares scouted draft salaries without changing class or higher offers', () => {
  const scouts = [{ id: 'low', salary: 240 }, { id: 'high', salary: 600 }, { id: 'dev', salary: 240, isIkusei: true }]
    .map(p => ({ ...p, age: 18, prospectType: '高卒', readinessScore: 30, batting: { contact: 30, power: 30, eye: 30 } }));
  const pool = withFixedRandom(() => initDraftPool({ scoutResults: scouts }));
  expect(scouts.map(p => p.salary)).toEqual([240, 600, 240]);
  expect(['low', 'high', 'dev'].map(id => pool.find(p => p.id === id).salary)).toEqual([420, 600, 240]);
  expect(pool.find(p => p.id === 'dev').isIkusei).toBe(true);
});

it.each([['rookie', 240, 420], ['rookie', 419, 420], ['rookie', 600, 600], ['development', 240, 240], ['development', 239, 240]])(
  'funds the reviewed minimum for an old unfunded %s salary %s, preserving the input', (id, beforeSalary, salary) => {
    const w = rookieFixture(); w.offseasonPlan.draftResult.pool.find(p => p.id === id).salary = beforeSalary;
    const before = JSON.stringify(w), request = rookieRequest(w, { type: 'reserve', playerId: id });
    const next = success(reduceRookieRequest(freezeEconomy(w), request));
    expect(JSON.stringify(w)).toBe(before);
    expect(next.offseasonPlan.draftResult.pool.find(p => p.id === id).salary).toBe(salary);
    const contract = next.contractEconomy.engine.spending.reservations[0].proposal.contract;
    expect(contract).toMatchObject({ annualSalaryManYen: salary, termYears: 1, guaranteed: true });
    expect(JSON.parse(next.contractEconomy.engine.transactions[0].signature).proposal.contract).toEqual(contract);
    expect(row(next).reservedManYen - row(w).reservedManYen).toBe(salary);
    validateEconomySave(next);
    expect(reduceRookieRequest(JSON.parse(JSON.stringify(next)), request)).toMatchObject({ ok: true, replayed: true });
  });

it.each([false, true])('does not hide differing old salaries behind the same minimum (reverse=%s)', reverse => {
  const w = rookieFixture(); w.offseasonPlan.draftResult.pool[0].salary = 240;
  const duplicate = { ...w.offseasonPlan.draftResult.pool[0], salary: 419 };
  if (reverse) w.offseasonPlan.draftResult.pool.unshift(duplicate); else w.offseasonPlan.draftResult.pool.push(duplicate);
  expect(act(w, 'reserve').ok).toBe(false);
});

it('rejects a 419 budget for a corrected 420 offer without changing the old world', () => {
  const w = rookieFixture(); w.offseasonPlan.draftResult.pool[0].salary = 240;
  for (const list of [w.contractEconomy.budgetPolicies, w.contractEconomy.engine.spending.authorizations])
    list.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = 419;
  const before = JSON.stringify(w), result = act(freezeEconomy(w), 'reserve');
  expect(result.ok).toBe(false); expect(result.world).toBe(w); expect(JSON.stringify(w)).toBe(before);
});

it('does not repair a reserved draft salary or rewrite prior receipts when funding another rookie', () => {
  let w = success(act(rookieFixture(), 'reserve', 'development'));
  const receipts = structuredClone(w.contractEconomy.engine.transactions);
  w.offseasonPlan.draftResult.pool[0].salary = 240;
  w = success(act(w, 'reserve'));
  expect(w.contractEconomy.engine.transactions.slice(0, 1)).toEqual(receipts);
  w.offseasonPlan.draftResult.pool[0].salary = 240;
  const before = JSON.stringify(w);
  expect(() => validateEconomySave(w)).toThrow();
  expect(act(w, 'reserve').ok).toBe(false); expect(JSON.stringify(w)).toBe(before);
});

it('preserves legacy immediate joining and its existing controlled salary floor', () => {
  const w = rookieFixture(); w.offseasonPlan.draftResult.pool[0].salary = 240;
  const { pool, drafted } = w.offseasonPlan.draftResult;
  const result = applyDraftAcquisitions(w.teams, pool, drafted, w.year);
  expect(result.ok).toBe(true);
  expect(result.teams[0].farm.map(p => [p.id, p.salary, p.育成, p.contractYears])).toEqual([
    ['rookie', 420, false, 1], ['development', 420, false, 1] ]);
});

it.each(['FA', 'renewal'])('shares the exact next-year budget boundary with %s holds', kind => {
  for (const [approved, ok] of [[10419, false], [10420, true]]) {
    let w = rookieFixture(); w.offseasonPlan.draftResult.pool[0].salary = 240;
    for (const list of [w.contractEconomy.budgetPolicies, w.contractEconomy.engine.spending.authorizations])
      list.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = approved;
    w = success(act(w, 'reserve'));
    const r = kind === 'FA'
      ? reduceAcquisitionRequest(freezeEconomy(w), acquisitionRequest(w, { type: 'offer', playerId: 'free', salary: 10000, years: 1 }))
      : reduceRenewalRequest(freezeEconomy(w), renewalRequest(w, { type: 'offer', playerId: 0, salary: 10000, years: 1 }));
    expect(r.ok, r.error).toBe(ok);
    if (ok) {
      expect(row(r.world).reservedManYen).toBe(10420);
      validateEconomySave(r.world);
    } else expect(r.world).toBe(w);
  }
});
