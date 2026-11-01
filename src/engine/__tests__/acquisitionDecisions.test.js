import { expect, it, vi } from 'vitest';
import { acquisitionFixture, acquisitionClock as at } from './fixtures/acquisitionWorld';
import { freezeEconomy } from './fixtures/economyWorld';
import { acquisitionRequest, reduceAcquisitionRequest, dueAcquisitionDecisions } from '../acquisitionDecisions';
import { advanceEconomyDecisions } from '../economyDecisions';
import { renewalRequest, reduceRenewalRequest } from '../renewalDecisions';
import { validateEconomySave, economyOverwriteIssue } from '../economyPersistence';
import { quoteAnnualSpendingPlan } from '../annualSpending';
import { toAnnualState, fromAnnualState } from '../contractEconomy';
import { replyTiming } from '../decisionClock';
import { createSeasonContract } from '../seasonContract';
import { applyContractLedgerAction } from '../contractLedger';

const good = r => { expect(r.ok, r.error).toBe(true); validateEconomySave(r.world); return r.world; };
const act = (w, a) => good(reduceAcquisitionRequest(freezeEconomy(w), acquisitionRequest(w, a)));
const offer = (extra = {}) => ({ type: 'offer', playerId: 'free', salary: 10000, years: 3, ...extra });
const reply = w => act(w, { type: 'resolve-due' });
const row = (w, season) => quoteAnnualSpendingPlan(toAnnualState(w).spending).find(r => r.teamId === 0 && r.season === season);

it('reserves every year and charges only remaining months on July 1 acceptance', () => {
  const w = acquisitionFixture({ date: '2026-06-27' });
  const h = act(w, offer()), saved = JSON.parse(JSON.stringify(h));
  expect(h.teams).toEqual(w.teams.map(t => ({ ...t, budget: h.teams.find(n => n.id === t.id).budget })));
  const result = reply(at(saved, '2026-07-01'));
  expect(result.contractEconomy.decisions[0].status).toBe('accepted');
  expect([2026, 2027, 2028].map(y => row(result, y).salaryManYen - row(w, y).salaryManYen)).toEqual([5000, 10000, 10000]);
  expect(result.faPool).toHaveLength(0);
  expect([...result.teams[0].players, ...result.teams[0].farm].filter(p => p.id === 'free')).toHaveLength(1);
  expect(reply(result)).toEqual(result);
  expect(economyOverwriteIssue(h, result)).toBeNull();
});

it.each([420, 10000])('freezes the salary-aware %i answer, without randomness or mail dependency', salary => {
  const w = acquisitionFixture();
  w.faPool[0].personality = { money: 0, winning: 100, playing: 0, hometown: 0, loyalty: 0, stability: 0, future: 0 };
  const random = vi.spyOn(Math, 'random').mockImplementation(() => { throw Error('global draw'); });
  let h; try { h = act(w, offer({ salary })); } finally { random.mockRestore(); }
  const n = at(JSON.parse(JSON.stringify(h)), '2026-07-20'); n.mailbox = [];
  n.faPool[0].personality.money = 100; n.teams[0].wins = 0; n.teams[0].losses = 100;
  const r = reply(n);
  expect(r.contractEconomy.decisions[0].status).toBe(salary === 420 ? 'rejected' : 'accepted');
  validateEconomySave(JSON.parse(JSON.stringify(r)));
});

it.each(['season', 'offseason'])('locks %s offers at due, preserves replacements and rolls back invalid replacements', phase => {
  const w = acquisitionFixture({ phase, date: phase === 'season' ? '2026-07-16' : '2026-12-01' });
  const h = act(w, offer()), d = h.contractEconomy.decisions[0];
  const actions = [{ type: 'cancel', proposalId: d.proposalId }, offer({ replaceProposalId: d.proposalId, salary: 12000 })];
  for (const a of actions) {
    act(at(h, phase === 'season' ? '2026-07-17' : '2026-12-01', phase === 'offseason' ? 1 : 0), a);
    const due = at(h, d.dueDate ?? '2026-12-01', d.dueTurn ?? 0);
    const r = reduceAcquisitionRequest(due, acquisitionRequest(due, a));
    expect(r.ok).toBe(false); expect(r.world).toBe(due);
  }
  const bad = reduceAcquisitionRequest(h, acquisitionRequest(h, offer({ replaceProposalId: d.proposalId, salary: 90000 })));
  expect(bad.ok).toBe(false); expect(bad.world).toBe(h);
  const replaced = act(h, offer({ replaceProposalId: d.proposalId, salary: 12000 }));
  expect(replaced.contractEconomy.decisions.map(d => d.status)).toEqual(['replaced', 'pending']);
  expect(replaced.contractEconomy.engine.spending.reservations).toHaveLength(1);
});

it('accepts July 31, but expires even a not-yet-due acquisition on August 1 alongside a renewal', () => {
  const w = acquisitionFixture({ date: '2026-07-27' });
  expect(reply(at(act(w, offer()), '2026-07-31')).contractEconomy.decisions[0].status).toBe('accepted');
  const late = act(acquisitionFixture({ date: '2026-07-31' }), offer());
  const mixed = good(reduceRenewalRequest(late, renewalRequest(late, { type: 'offer', playerId: 0, salary: 12000, years: 3 })));
  const aug = at(mixed, '2026-08-03');
  const r = good(advanceEconomyDecisions(aug, acquisitionRequest(aug, { type: 'resolve-due' })));
  expect(r.contractEconomy.decisions.map(d => d.status)).toEqual(['expired', 'accepted']);
  expect(r.faPool).toHaveLength(1); expect(r.teams[0].players[0].salary).toBe(10000);
  expect(dueAcquisitionDecisions(at(late, '2026-08-01'))).toHaveLength(1);
});

it('accepts offseason terms into future employment without adding to the current roster', () => {
  const h = act(acquisitionFixture({ phase: 'offseason', date: '2026-12-01', turn: 30 }), offer());
  const r = reply(at(h, '2026-12-01', 34));
  expect(r.contractEconomy.engine.acquisitions).toHaveLength(1);
  expect(r.teams[0].players.map(p => p.id)).toEqual([0]);
  expect(row(r, 2027).salaryManYen).toBe(10000);
  expect(reduceAcquisitionRequest(at(acquisitionFixture({ phase: 'offseason', date: '2026-12-01' }), '2026-12-01', 31), acquisitionRequest(at(acquisitionFixture({ phase: 'offseason', date: '2026-12-01' }), '2026-12-01', 31), offer())).ok).toBe(false);
  expect(reply(at(h, '2026-12-01', 38)).contractEconomy.decisions[0].status).toBe('expired');
});

it.each(['unknown', 'missing-salary', 'clause', 'fraction', 'four-years'])('rejects unsupported %s offers without mutation', type => {
  const w = acquisitionFixture(), a = offer();
  if (type === 'unknown') delete w.faPool[0].marketEntry;
  if (type === 'missing-salary') delete w.faPool[0].salary;
  if (type === 'clause') a.incentives = { optOut: true };
  if (type === 'fraction') a.salary = 10000.5;
  if (type === 'four-years') a.years = 4;
  const r = reduceAcquisitionRequest(w, acquisitionRequest(w, a));
  expect(r.ok).toBe(false); expect(r.world).toBe(w);
});

it('replays the exact request, rejects changed/stale intent, and detects lost/altered evidence', () => {
  const w = acquisitionFixture(), req = acquisitionRequest(w, offer()), h = good(reduceAcquisitionRequest(w, req));
  expect(reduceAcquisitionRequest(h, req)).toMatchObject({ ok: true, replayed: true });
  expect(reduceAcquisitionRequest(h, { ...req, action: offer({ salary: 11000 }) }).ok).toBe(false);
  expect(reduceAcquisitionRequest(h, { ...req, epoch: 'another' }).ok).toBe(false);
  for (const mutate of [n => { n.contractEconomy.decisions = []; }, n => { n.contractEconomy.decisions[0].willAccept = false; }, n => { n.contractEconomy.decisions[0].dueDate = '2026-07-17'; }]) {
    const n = structuredClone(h); mutate(n); expect(() => validateEconomySave(n)).toThrow();
  }
});

it.each(['season', 'offseason'])('uses reachable 2/3/4 %s reply bands at exact boundaries', phase => {
  const clock = { season: 2026, phase, date: phase === 'season' ? '2026-07-16' : '2026-12-01', offseasonTurn: 4 };
  for (const [score, wait] of [[54, 4], [55, 3], [74, 3], [75, 2]]) expect(replyTiming(clock, score)).toMatchObject(
    phase === 'season' ? { dueDate: `2026-07-${16 + wait}`, dueTurn: null } : { dueTurn: 4 + wait, dueDate: null });
});

it.each(['domestic-fa', 'overseas-fa'])('keeps %s compensation reserve and spring arrival separate from payroll/roster', kind => {
  const w = acquisitionFixture({ phase: 'offseason', date: '2026-12-01' });
  Object.assign(w.faPool[0], { entryType: '高卒', daysOnActiveRoster: 1300,
    marketEntry: { id: 'declared', kind, enteredDate: '2026-12-01', originTeamId: 1,
      compensationRank: 'A', compensationBasis: { previousAnnualSalaryManYen: 10000, exercise: 'first' } } });
  const h = act(w, offer());
  expect(row(h, 2027).reservedManYen).toBe(18000);
  const r = reply(at(h, '2026-12-01', 4));
  expect(r.contractEconomy.engine.spending.faCompensations).toEqual([{ proposalId: h.contractEconomy.decisions[0].proposalId, resolution: 'pending' }]);
  expect(r.contractEconomy.engine.acquisitions).toHaveLength(1);
  expect(row(r, 2027).salaryManYen).toBe(10000);
  expect(row(r, 2027).reservedManYen).toBe(8000);
});

it.each(['removed', 'relisted', 'retired', 'budget'])('rechecks %s conditions at reply and releases the promise with preserved evidence', change => {
  const h = act(acquisitionFixture(), offer()), n = at(h, '2026-07-20');
  if (change === 'removed') n.faPool = [];
  if (change === 'relisted') n.faPool[0].marketEntry.id = 'new-listing';
  if (change === 'retired') n.faPool[0].isRetired = true;
  if (change === 'budget') {
    n.contractEconomy.engine.spending.oneOffCosts.push({ id: 'cost', teamId: 0, season: 2027, kind: 'scouting', amountManYen: 45000 });
  }
  const projected = fromAnnualState(n, toAnnualState(n));
  const r = reply(projected);
  expect(r.contractEconomy.decisions[0]).toMatchObject({ status: 'invalidated', willAccept: true });
  expect(r.contractEconomy.engine.spending.reservations).toHaveLength(0);
  expect(r.contractEconomy.engine.spending.ledger.records).toHaveLength(2);
  expect(economyOverwriteIssue(h, r)).toBeNull();
});

it('checks the final contract year before reserving competing formal offers', () => {
  const w = acquisitionFixture();
  w.faPool.push({ ...w.faPool[0], id: 'second', marketEntry: { ...w.faPool[0].marketEntry, id: 'second-entry' } });
  w.contractEconomy.engine.spending.oneOffCosts.push({ id: 'future-cost', teamId: 0, season: 2028, kind: 'scouting', amountManYen: 35000 });
  const h = act(fromAnnualState(w, toAnnualState(w)), offer());
  const r = reduceAcquisitionRequest(h, acquisitionRequest(h, offer({ playerId: 'second' })));
  expect(r.ok).toBe(false); expect(r.world).toBe(h);
});

it('rechecks the 70-player boundary at acceptance without treating an offer as a reserved roster place', () => {
  const w = acquisitionFixture();
  const addOwned = (world, i) => {
    const id = `extra-${i}`;
    world.teams[0].farm.push({ id, name: id, pos: '一塁手', salary: 420 });
    world.contractEconomy.engine.spending.ledger = applyContractLedgerAction(world.contractEconomy.engine.spending.ledger, {
      id: `initial-${id}`, type: 'sign', teamId: 0, effectiveDate: '2026-02-01',
      contract: createSeasonContract({ contractId: `contract-${id}`, playerId: id, signedSeason: 2026, agreementPhase: 'preseason',
        purpose: 'acquisition', termYears: 1, annualSalaryManYen: 420, guaranteed: true, registrationType: 'controlled' }) });
  };
  for (let i = 0; i < 68; i++) addOwned(w, i);
  const h = act(fromAnnualState(w, toAnnualState(w)), offer());
  const n = at(h, '2026-07-20'); addOwned(n, 68);
  const r = reply(fromAnnualState(n, toAnnualState(n)));
  expect(r.contractEconomy.decisions[0].status).toBe('invalidated');
  expect(r.teams[0].players.length + r.teams[0].farm.length).toBe(70);
  expect(r.faPool).toHaveLength(1);
});

it('keeps development acquisitions at one year and preserves their classification on acceptance', () => {
  const w = acquisitionFixture(); Object.assign(w.faPool[0], { isIkusei: true, 育成: true, salary: 240 });
  expect(reduceAcquisitionRequest(w, acquisitionRequest(w, offer({ salary: 240, years: 2 }))).ok).toBe(false);
  const r = reply(at(act(w, offer({ salary: 240, years: 1 })), '2026-07-20'));
  expect(r.teams[0].farm.find(p => p.id === 'free')).toMatchObject({ isIkusei: true, salary: 240, contractYears: 1 });
});
