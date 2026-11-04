import { describe, expect, it } from 'vitest';
import { completion } from './fixtures/postingIncome';
import { postingWinter, postingCommand } from './fixtures/postingDepartures';
import { playableClub, nextSeasonForDepartureTest } from './fixtures/inSeasonDepartures';
import { freezeEconomy, renewalEnvelope } from './fixtures/economyWorld';
import { reduceEconomyCommand, quoteEconomyCommand, toAnnualState, fromAnnualState } from '../contractEconomy';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { quoteAnnualSpendingPlan, assessAnnualSpendingChange } from '../annualSpending';
import { contractLiabilityRows } from '../contractLedger';
import { quoteAnnualBudgetPolicy } from '../annualBudgetPolicy';
import { createInitialTeams } from '../bootstrapTeams';
import { createSeasonContract } from '../seasonContract';

const e = w => w.contractEconomy.engine;
const json = w => JSON.parse(JSON.stringify(w));
const allowance = (w, y = 2027, teamId = 0) => e(w).spending.authorizations.find(r => r.teamId === teamId && r.season === y).approvedManYen;
const apply = (w, c = completion(w)) => { const r = reduceEconomyCommand(w, c); expect(r.ok, r.error).toBe(true); return r.world; };
const deny = (w, c = completion(w)) => {
  const old = structuredClone(w); freezeEconomy(w); expect(quoteEconomyCommand(w, c).ok).toBe(false);
  const r = reduceEconomyCommand(w, c); expect(r.ok).toBe(false); expect(r.world).toBe(w); expect(w).toEqual(old);
};

describe('posting income and next-season permission', () => {
  it.each(['retain', 'waive'])('atomically records money and departure without changing ordinary policy (%s)', settlement => {
    const w = postingWinter(), old = structuredClone(w), c = completion(w, { id: 0, settlement,
      ...(settlement === 'waive' ? { terminationAgreementId: 0 } : {}) });
    freezeEconomy(w); const q = quoteEconomyCommand(w, c); expect(q.ok, q.error).toBe(true); expect(w).toEqual(old);
    const next = apply(w, c), income = next.contractEconomy.incomeReceipts[0];
    expect(income).toMatchObject({ kind: 'posting', version: 1, transactionId: 0, teamId: 0, playerId: 0,
      season: 2026, amountManYen: 253125, feeUsdCents: 1687500000,
      budgetAllocation: { season: 2027, amountManYen: 253125 } });
    expect(next.contractEconomy.budgetPolicies).toEqual(old.contractEconomy.budgetPolicies);
    expect(allowance(next)).toBe(1253125); expect(allowance(next, 2028)).toBe(1000000); expect(allowance(next, 2027, 1)).toBe(1000000);
    expect(e(next).postingDepartures).toHaveLength(1); expect(next.teams[0].players.some(p => p.id === 0)).toBe(false);
    expect(contractLiabilityRows(e(next).spending.ledger).filter(r => r.season <= 2026))
      .toEqual(contractLiabilityRows(e(w).spending.ledger).filter(r => r.season <= 2026));
    expect(validateEconomySave(json(next))).toBe('annual'); expect(economyOverwriteIssue(w, next)).toBeNull();
    expect(reduceEconomyCommand(json(next), c)).toMatchObject({ ok: true, replayed: true });
    deny(json(next), { ...c, transaction: { ...c.transaction, overseasContract: { kind: 'minor', signingBonusUsdCents: 5 } } });
    deny(json(next), { ...c, baseRevision: next.contractEconomy.revision, transaction: { ...c.transaction, id: 'another-id' } });
  });

  it('records a real zero minor fee and natural expiry without manufacturing a waiver', () => {
    const w = postingWinter({ years: 1 }), next = apply(w, completion(w, { overseasContract: { kind: 'minor', signingBonusUsdCents: 0 } }));
    expect(next.contractEconomy.incomeReceipts[0]).toMatchObject({ amountManYen: 0, budgetAllocation: { season: 2027, amountManYen: 0 } });
    expect(e(next).spending.ledger).toEqual(e(w).spending.ledger); expect(allowance(next)).toBe(1000000);
    expect(validateEconomySave(next)).toBe('annual');
  });

  it.each([{ reason: 'release' }, { reason: 'posting' }, { exchangeRate: 9999 }, { id: null },
    { overseasContract: { kind: 'major', guaranteedUsdCents: 100, bonus: 1 } }])('rejects extra or malformed completion fields %j', extra => {
    const w = postingWinter(); deny(w, completion(w, extra));
  });

  it('protects income history independently of transaction receipt prefixes', () => {
    const w = apply(postingWinter()), bad = json(w); bad.contractEconomy.revision++;
    bad.contractEconomy.incomeReceipts[0].amountManYen++;
    expect(economyOverwriteIssue(w, bad)).toBe('economy_history_conflict');
  });

  it('adds separate completed cases in the same year once each', () => {
    let w = postingWinter(); w.teams[0].farm[0].postingRequested = true;
    w = apply(w); const next = apply(w, completion(w, { id: 'second', overseasContract: { kind: 'minor', signingBonusUsdCents: 650000000 } }, 0, w.teams[0].farm[0].id));
    expect(allowance(next)).toBe(1277500); expect(next.contractEconomy.incomeReceipts).toHaveLength(2);
  });

  it('uses fee money for vacancy maintenance in the funded year but not later deficits', () => {
    let w = postingWinter();
    for (const list of [e(w).spending.authorizations, w.contractEconomy.budgetPolicies]) list.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = 1000;
    w = fromAnnualState(w, toAnnualState(w));
    const next = apply(w); expect(next.teams[0].budget).toBe(252705);
    let bad = postingWinter();
    for (const list of [e(bad).spending.authorizations, bad.contractEconomy.budgetPolicies]) list.find(r => r.teamId === 0 && r.season === 2028).approvedManYen = 1000;
    bad = fromAnnualState(bad, toAnnualState(bad)); deny(bad);
  });

  it('funds a subsequent offer while preserving every later-year admission check', () => {
    let w = postingWinter();
    for (const list of [e(w).spending.authorizations, w.contractEconomy.budgetPolicies]) list.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = 1000;
    w = fromAnnualState(w, toAnnualState(w)); const posted = apply(w, completion(w, { settlement: 'waive', terminationAgreementId: 'consent' }));
    const offer = renewalEnvelope(posted, { salary: 5000 }); offer.transaction.contractId = posted.teams[0].players[0].contractId;
    offer.transaction.proposal.contract = createSeasonContract({ ...offer.transaction.proposal.contract, playerId: 1, agreementPhase: 'offseason', termYears: 1 });
    expect(quoteEconomyCommand(w, { ...offer, baseRevision: w.contractEconomy.revision }).ok).toBe(false);
    expect(apply(posted, offer).contractEconomy.incomeReceipts).toEqual(posted.contractEconomy.incomeReceipts);
    const multi = json(offer); multi.transaction.proposal.contract = createSeasonContract({ ...multi.transaction.proposal.contract, termYears: 3, annualSalaryManYen: 1000001 });
    deny(json(posted), multi);
    const s = toAnnualState(posted).spending;
    expect(() => assessAnnualSpendingChange(s, { ...s, authorizations: s.authorizations.map(r => ({ ...r, approvedManYen: r.approvedManYen + 1 })) })).toThrow();
  });

  it('keeps supplements in budget quotes without cascading them into later base approvals', () => {
    let w = postingWinter();
    const policy = { policyVersion: 'test', allocationPercent: 100, smoothingYears: 1, maxChangePercent: 10,
      forecasts: w.teams.flatMap(t => Array.from({ length: 8 }, (_, i) => ({ teamId: t.id, season: 2027 + i,
        source: 'profile', operatingSurplusesManYen: [1000000], supportManYen: 0, previousApprovedManYen: null }))) };
    const q = quoteAnnualBudgetPolicy(w, policy); w.contractEconomy.budgetPolicies = q.budgetPolicies;
    e(w).spending.authorizations = q.authorizations; e(w).rosterRequirements = q.rosterRequirements;
    w = fromAnnualState(w, toAnnualState(w)); const next = apply(w);
    const quoted = quoteAnnualBudgetPolicy(freezeEconomy(next), freezeEconomy(policy));
    expect(quoted.authorizations.find(r => r.teamId === 0 && r.season === 2027).approvedManYen).toBe(1253125);
    expect(quoted.budgetPolicies.find(r => r.teamId === 0 && r.season === 2027).approvedManYen).toBe(1000000);
    expect(quoted.authorizations.find(r => r.teamId === 0 && r.season === 2028).approvedManYen).toBe(1000000);
    const reinstalled = json(next); reinstalled.contractEconomy.budgetPolicies = quoted.budgetPolicies;
    e(reinstalled).spending.authorizations = quoted.authorizations; expect(validateEconomySave(reinstalled)).toBe('annual');
  });

  it('retains the allowance through spring and expires by year without deleting history', () => {
    const teams = [playableClub(), playableClub(1)]; teams.forEach(t => [...t.players, ...t.farm].forEach(p => { p.contractYearsLeft = 4; }));
    const posted = apply(postingWinter({ teams, years: 4 })), spring = nextSeasonForDepartureTest(posted), later = nextSeasonForDepartureTest(spring);
    expect(allowance(spring)).toBe(1253125); expect(allowance(later, 2028)).toBe(1000000);
    expect(later.contractEconomy.incomeReceipts).toEqual(posted.contractEconomy.incomeReceipts);
    expect(allowance(later, 2027)).toBe(1253125); expect(validateEconomySave(json(later))).toBe('annual');
  });

  it.each([
    ['missing allocation', w => { delete w.contractEconomy.incomeReceipts[0].budgetAllocation; }],
    ['wrong season', w => { w.contractEconomy.incomeReceipts[0].budgetAllocation.season++; }],
    ['wrong club', w => { w.contractEconomy.incomeReceipts[0].teamId = 1; }],
    ['extra money', w => { w.contractEconomy.incomeReceipts[0].amountManYen++; }],
    ['income deleted', w => { w.contractEconomy.incomeReceipts = []; }],
    ['parent receipt deleted', w => { e(w).transactions.pop(); }],
    ['orphan departure', w => { e(w).postingDepartures[0].id = 'other'; }],
    ['unproven allowance', w => { e(w).spending.authorizations.find(r => r.season === 2027).approvedManYen++; }],
    ['new income kind disguised as old', w => { w.contractEconomy.incomeReceipts[0].kind = 'other'; }],
  ])('rejects %s after JSON reload', (_, edit) => {
    const bad = json(apply(postingWinter())); edit(bad); expect(() => validateEconomySave(freezeEconomy(bad))).toThrow();
  });

  it('keeps standalone old departures income-free and rejects backfill or missing request', () => {
    const w = postingWinter(), old = apply(w, postingCommand(w));
    expect(old.contractEconomy.incomeReceipts).toEqual([]); expect(validateEconomySave(old)).toBe('annual'); deny(old);
    w.teams[0].players[0].postingRequested = false; deny(w);
  });

  it('pairs a real generated-roster request with a genuine missing-request rejection', () => {
    const teams = createInitialTeams(), w = postingWinter({ teams, years: teams[0].players[0].contractYearsLeft });
    const c = completion(w, {}, w.teams[0].id, w.teams[0].players[0].id);
    const bad = json(w); bad.teams[0].players[0].postingRequested = false; deny(bad, c);
    const next = apply(w, c); expect(validateEconomySave(json(next))).toBe('annual');
    expect(next.contractEconomy.budgetPolicies).toEqual(w.contractEconomy.budgetPolicies);
  });
});
