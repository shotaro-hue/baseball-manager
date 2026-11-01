import { describe, expect, it } from 'vitest';
import { freezeEconomy } from './fixtures/economyWorld';
import { renewalFixture } from './fixtures/renewalWorld';
import { toAnnualState } from '../contractEconomy';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { renewalRequest, reduceRenewalRequest, dueRenewalDecisions, validateRenewalDecisions } from '../renewalDecisions';


const good = result => { expect(result.ok, result.error).toBe(true); validateEconomySave(result.world); return result.world; };
const perform = (w, action) => good(reduceRenewalRequest(freezeEconomy(w), renewalRequest(w, action)));
const offer = (extra = {}) => ({ type: 'offer', playerId: 0, salary: 12000, years: 3, ...extra });
const held = (w = renewalFixture(), extra) => perform(w, offer(extra));
const rows = w => quoteAnnualSpendingPlan(toAnnualState(w).spending);
const row = (w, season) => rows(w).find(r => r.teamId === 0 && r.season === season);
const at = (w, date, turn = 0) => ({ ...structuredClone(w),
  schedule: [null, { date: { month: Number(date.slice(5, 7)), day: Number(date.slice(8)) } }],
  contractEconomy: { ...structuredClone(w.contractEconomy), clock: { ...w.contractEconomy.clock, date, offseasonTurn: turn } } });
const reply = w => perform(w, { type: 'resolve-due' });

describe('human renewal decision lifecycle', () => {
  it('reserves 12000 for three future years, then records one agreement without raising current salary', () => {
    const w = renewalFixture(), h = held(w);
    expect(h.teams[0].players[0].salary).toBe(10000);
    expect([2027, 2028, 2029].map(y => row(h, y).reservedManYen)).toEqual([12000, 12000, 12000]);
    expect(h.contractEconomy.decisions[0]).toMatchObject({ status: 'pending', willAccept: true, dueDate: '2026-07-18' });
    expect(dueRenewalDecisions(h)).toHaveLength(0);
    const n = reply(at(h, '2026-07-18'));
    expect(n.teams[0].players[0].salary).toBe(10000);
    expect([2027, 2028, 2029].map(y => row(n, y).salaryManYen)).toEqual([12000, 12000, 12000]);
    expect(row(n, 2027).reservedManYen).toBe(0);
    expect(n.contractEconomy.decisions[0].status).toBe('accepted');
    expect(n.mailbox.at(-1)).toMatchObject({ type: 'contract_reply', resolution: 'signed' });
    expect(n.contractEconomy.engine.transactions).toHaveLength(2);
    expect(reply(n)).toEqual(n);
  });

  it('replays exactly the same request after reload, but rejects changed terms or stale non-replays', () => {
    const w = renewalFixture(), request = renewalRequest(w, offer()), n = good(reduceRenewalRequest(w, request));
    expect(reduceRenewalRequest(JSON.parse(JSON.stringify(n)), request)).toMatchObject({ ok: true, replayed: true });
    expect(reduceRenewalRequest(n, { ...request, action: offer({ salary: 13000 }) }).ok).toBe(false);
    expect(reduceRenewalRequest(n, { ...request, saveId: 'other' }).ok).toBe(false);
    expect(reduceRenewalRequest(n, { ...request, epoch: 'other' }).ok).toBe(false);
  });

  it('replaces atomically and cancellation retains current salary and old decision history', () => {
    const h = held(), oldId = h.contractEconomy.decisions[0].proposalId;
    const n = perform(h, offer({ salary: 13000, replaceProposalId: oldId }));
    expect(n.contractEconomy.decisions.map(d => d.status)).toEqual(['replaced', 'pending']);
    expect(row(n, 2027).reservedManYen).toBe(13000);
    expect(reduceRenewalRequest(n, renewalRequest(n, offer({ replaceProposalId: oldId }))).ok).toBe(false);
    const cancelled = perform(n, { type: 'cancel', proposalId: n.contractEconomy.decisions[1].proposalId });
    expect(cancelled.contractEconomy.decisions.map(d => d.status)).toEqual(['replaced', 'cancelled']);
    expect(row(cancelled, 2027).reservedManYen).toBe(0);
    expect(cancelled.teams[0].players[0].salary).toBe(10000);
  });

  it('does not discard an existing reservation when the replacement seventh year is unaffordable', () => {
    const h = structuredClone(held());
    for (const list of [h.contractEconomy.engine.spending.authorizations, h.contractEconomy.budgetPolicies])
      list.find(r => r.teamId === 0 && r.season === 2033).approvedManYen = 11999;
    const request = renewalRequest(h, offer({ years: 7, replaceProposalId: h.contractEconomy.decisions[0].proposalId }));
    const r = reduceRenewalRequest(h, request);
    expect(r.ok).toBe(false); expect(r.world).toBe(h);
    expect(h.contractEconomy.engine.spending.reservations).toHaveLength(1);
  });

  it('records player refusal as rejected even when planning reserve restoration leaves a deficit', () => {
    const w = renewalFixture();
    w.contractEconomy.engine.spending.renewalPlans = [{ teamId: 0, playerId: 0,
      sourceContractId: w.teams[0].players[0].contractId, season: 2027, amountManYen: 10000, basis: 'explicit-test-plan' }];
    const h = structuredClone(held(w, { salary: 420, years: 1 }));
    for (const list of [h.contractEconomy.engine.spending.authorizations, h.contractEconomy.budgetPolicies])
      list.find(r => r.teamId === 0 && r.season === 2027).approvedManYen = 100;
    const n = reply(at(h, '2026-07-20'));
    expect(n.contractEconomy.decisions[0].status).toBe('rejected');
    expect(n.contractEconomy.engine.spending.resolvedReservations[0].resolution).toBe('rejected');
    expect(n.teams[0].players[0].salary).toBe(10000);
    expect(row(n, 2027).reservedManYen).toBe(0);
    expect(row(n, 2027).renewalPlanReserveManYen).toBe(10000);
  });

  it('invalidates an acceptance if the latest authorization is insufficient', () => {
    const h = structuredClone(held());
    for (const list of [h.contractEconomy.engine.spending.authorizations, h.contractEconomy.budgetPolicies])
      list.find(r => r.teamId === 0 && r.season === 2029).approvedManYen = 11999;
    const n = reply(at(h, '2026-07-18'));
    expect(n.contractEconomy.decisions[0].status).toBe('invalidated');
    expect(n.contractEconomy.engine.spending.ledger.records).toHaveLength(2);
    expect(n.contractEconomy.engine.spending.reservations).toHaveLength(0);
  });

  it.each(['2026-08-01', '2026-11-30'])('accepts renewal on %s after the acquisition deadline', date => {
    const h = held(renewalFixture({ date: date === '2026-08-01' ? '2026-07-30' : '2026-11-28' }));
    expect(reply(at(h, date)).contractEconomy.decisions[0].status).toBe('accepted');
  });

  it('uses persisted offseason turns and rejects new offers after turn 30', () => {
    const h = held(renewalFixture({ phase: 'offseason', date: '2026-12-01', turn: 30 }));
    expect(h.contractEconomy.decisions[0]).toMatchObject({ dueTurn: 32, dueDate: null });
    expect(dueRenewalDecisions(h)).toHaveLength(0);
    expect(reply(at(h, '2026-12-01', 32)).contractEconomy.decisions[0].status).toBe('accepted');
    const late = renewalFixture({ phase: 'offseason', date: '2026-12-01', turn: 31 });
    expect(reduceRenewalRequest(late, renewalRequest(late, offer())).ok).toBe(false);
  });

  it('answers from decisions after all display mail has been removed', () => {
    const h = { ...held(), mailbox: [] };
    const n = reply(at(h, '2026-07-18'));
    expect(n.contractEconomy.decisions[0].status).toBe('accepted');
    expect(n.mailbox).toHaveLength(1);
  });

  it.each([{ performanceBonusRate: 1 }, { titleBonus: 1 }, { optOut: true }, { hiddenClause: true }])('rejects unsupported new clauses %j', incentives => {
    const w = renewalFixture();
    expect(reduceRenewalRequest(w, renewalRequest(w, offer({ incentives }))).ok).toBe(false);
  });

  it('preserves recorded legacy clauses and rejects tampering with fixed reply evidence or its history', () => {
    const w = renewalFixture(); w.teams[0].players[0].contractIncentives = { titleBonus: 500 };
    const h = held(w);
    expect(h.teams[0].players[0].contractIncentives).toEqual({ titleBonus: 500 });
    const damaged = structuredClone(h); damaged.contractEconomy.decisions[0].willAccept = false;
    expect(() => validateRenewalDecisions(damaged)).toThrow();
    const dropped = structuredClone(h); dropped.contractEconomy.revision++; dropped.contractEconomy.decisions = [];
    expect(economyOverwriteIssue(h, dropped)).toBe('economy_history_conflict');
    const changed = structuredClone(h); changed.contractEconomy.revision++; changed.contractEconomy.decisions[0].dueDate = '2026-07-19';
    expect(economyOverwriteIssue(h, changed)).toBe('economy_history_conflict');
  });

  it('does not accept a different club, invalid mode or user-supplied reply outcome', () => {
    const w = renewalFixture();
    for (const action of [offer({ playerId: 'b' }), offer({ accepted: true }), { type: 'accept', proposalId: 'x' }])
      expect(reduceRenewalRequest(w, renewalRequest(w, action)).ok).toBe(false);
    const legacy = { ...w }; delete legacy.contractEconomy;
    expect(reduceRenewalRequest(legacy, renewalRequest(w, offer())).ok).toBe(false);
  });

  it('detects removed decisions and altered terminal evidence even without a previous root', () => {
    const h = held(), n = reply(at(h, '2026-07-18'));
    for (const damage of [
      w => { w.contractEconomy.decisions = []; },
      w => { w.contractEconomy.decisions[0].kind = 'unknown'; },
      w => { w.contractEconomy.decisions[0].resolvedClock.date = '2026-07-16'; },
      w => { delete w.contractEconomy.decisions[0].resolutionTransactionId; },
    ]) {
      const w = structuredClone(n); damage(w);
      expect(() => validateEconomySave(w)).toThrow();
    }
  });

  it('keeps offers crossing the end of November due on the equivalent offseason turn', () => {
    const h = held(renewalFixture({ date: '2026-11-30' }));
    const off = renewalFixture({ phase: 'offseason', date: '2026-12-01' });
    const w = { ...off, mailbox: h.mailbox, contractEconomy: { ...off.contractEconomy,
      revision: h.contractEconomy.revision, decisions: h.contractEconomy.decisions,
      engine: { ...off.contractEconomy.engine, transactions: h.contractEconomy.engine.transactions,
        spending: { ...off.contractEconomy.engine.spending, reservations: h.contractEconomy.engine.spending.reservations } } } };
    expect(dueRenewalDecisions(w)).toHaveLength(0);
    expect(reply(at(w, '2026-12-01', 1)).contractEconomy.decisions[0].status).toBe('accepted');
  });
});
