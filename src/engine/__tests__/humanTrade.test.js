import { expect, it } from 'vitest';
import { tradeFixture } from './fixtures/tradeWorld';
import { freezeEconomy, renewalEnvelope } from './fixtures/economyWorld';
import { tradeRequest, reduceTradeRequest, previewHumanTrade } from '../humanTrade';
import { reduceEconomyCommand, toAnnualState, fromAnnualState } from '../contractEconomy';
import { contractLiabilityRows, contractEmploymentAt, applyContractLedgerAction } from '../contractLedger';
import { validateEconomySave } from '../economyPersistence';
import { pendingDevelopmentFixture } from './fixtures/pendingDevelopmentWorld';
import { own } from './faPersonnelFixtures';

const action = extra => ({ toId: 1, outgoingIds: [0], incomingIds: ['b'], cashManYen: 500, ...extra });
const success = r => { expect(r.ok, r.error).toBe(true); return r.world; };
const reject = (w, r) => {
  const before = JSON.stringify(w), result = reduceTradeRequest(freezeEconomy(w), r);
  expect(result.ok).toBe(false); expect(result.world).toBe(w); expect(JSON.stringify(w)).toBe(before);
};
it.each([500, -500])('quotes and saves signed cash %s once with July 16 payroll and histories', cashManYen => {
  const w = freezeEconomy(tradeFixture()), request = tradeRequest(w, action({ cashManYen }));
  const before = JSON.stringify(w), quote = previewHumanTrade(w, request);
  expect(quote.ok, quote.error).toBe(true); expect(JSON.stringify(w)).toBe(before);
  const next = success(reduceTradeRequest(w, request));
  expect(next.teams.map(t => t.players[0].id)).toEqual(['b', 0]);
  expect(next.teams[0].lineup).not.toContain(0);
  expect(next.teams[0].players[0]).toMatchObject({ salary: 1000, contractYearsLeft: 3 });
  expect(next.contractEconomy.engine.spending.oneOffCosts.map(c => c.amountManYen)).toEqual([cashManYen, -cashManYen]);
  expect(contractLiabilityRows(next.contractEconomy.engine.spending.ledger).filter(r => r.playerId === 0).map(r => r.amountManYen)).toEqual([5484, 4516]);
  expect(next.teams.map(t => t.budget)).toEqual(quote.teams.map(t => t.budget));
  expect(next.teams.map(t => t.history.length)).toEqual([1, 1]);
  expect(next.news).toHaveLength(1); expect(next.seasonHistory.transfers).toHaveLength(1);
  const restored = JSON.parse(JSON.stringify(next)); expect(validateEconomySave(restored)).toBe('annual');
  expect(reduceTradeRequest(restored, request)).toMatchObject({ ok: true, replayed: true, world: restored });
  expect(restored.news).toHaveLength(1); expect(restored.seasonHistory.transfers).toHaveLength(1);
});
it('transfers an accepted future renewal with its original guarantee and end season', () => {
  let w = tradeFixture(), renewal = renewalEnvelope(w, { salary: 1600 });
  w = success(reduceEconomyCommand(w, renewal));
  w = success(reduceEconomyCommand(w, { ...renewal, baseRevision: w.contractEconomy.revision,
    transaction: { id: 'accept', type: 'accept-renewal', proposalId: 'renewal', contractId: w.teams[0].players[0].contractId } }));
  const next = success(reduceTradeRequest(w, tradeRequest(w, action())));
  expect(contractEmploymentAt(next.contractEconomy.engine.spending.ledger, '2027-02-01').find(e => e.contract.playerId === 0))
    .toMatchObject({ teamId: 1, contract: { annualSalaryManYen: 1600, endSeason: 2029, guaranteed: true } });
  expect(validateEconomySave(next)).toBe('annual');
});
it('requires pending renewal cancellation before trading either player', () => {
  let w = tradeFixture(); w = success(reduceEconomyCommand(w, renewalEnvelope(w)));
  reject(w, tradeRequest(w, action()));
});
it('shows the current salary after an earlier raise, not the original signing rate', () => {
  let w = tradeFixture();
  w.contractEconomy.engine.spending.ledger = applyContractLedgerAction(w.contractEconomy.engine.spending.ledger, {
    id: 'raise', type: 'increase', contractId: w.teams[0].players[0].contractId,
    teamId: 0, effectiveDate: '2026-06-01', annualSalaryManYen: 12000 });
  w = fromAnnualState(w, toAnnualState(w));
  const quote = previewHumanTrade(w, tradeRequest(w, action()));
  expect(quote.ok, quote.error).toBe(true);
  expect(quote.contracts.find(c => c.playerId === 0).annualSalaryManYen).toBe(12000);
});
it.each([69, 70])('uses the shared cap for a one-way acquisition at %s players', count => {
  const w = tradeFixture({ count }), r = tradeRequest(w, action({ outgoingIds: [] }));
  expect(previewHumanTrade(w, r).ok).toBe(count === 69);
  if (count === 69) success(reduceTradeRequest(w, r)); else reject(w, r);
});
it.each(['fa', 'personnel'].flatMap(kind => [false, true].flatMap(rookie => [69, 70].map(occupied => ({ kind, rookie, occupied })))))
('respects pending joins at the shared boundary: %j', ({ kind, rookie, occupied }) => {
  let w = pendingDevelopmentFixture(kind);
  if (rookie) w.offseasonPlan = { year: w.year, draftResult: { pool: [{ id: 'rookie', salary: 1000 }], drafted: { rookie: w.myId } } };
  let state = toAnnualState(w);
  const initial = (kind === 'fa' ? 3 : 2) + Number(rookie);
  for (let i = initial; i < occupied; i++) own(state, `extra-${i}`, w.myId, {}, { signedSeason: 2027 });
  w = fromAnnualState(w, state);
  const r = tradeRequest(w, { toId: 3, outgoingIds: [], incomingIds: ['d'], cashManYen: 500 });
  expect(previewHumanTrade(w, r).ok).toBe(occupied === 69);
  if (occupied === 69) success(reduceTradeRequest(w, r)); else reject(w, r);
});
it.each(['2026-07-31', '2026-08-01'])('validates deadline %s', date => {
  const w = tradeFixture({ date }), r = tradeRequest(w, action());
  if (date.endsWith('07-31')) success(reduceTradeRequest(w, r)); else reject(w, r);
});
it('allows only nonworsening cashless deficit swaps', () => {
  const w = tradeFixture({ salary: 1000, years: 3, approved: 900 });
  success(reduceTradeRequest(w, tradeRequest(w, action({ cashManYen: 0 }))));
  reject(w, tradeRequest(w, action({ cashManYen: 1 })));
});
it('revalidates future budgets and ignores the legacy displayed wallet', () => {
  let w = tradeFixture(); const r = tradeRequest(w, action()); expect(previewHumanTrade(w, r).ok).toBe(true);
  for (const list of [w.contractEconomy.budgetPolicies, w.contractEconomy.engine.spending.authorizations])
    list.find(a => a.teamId === 0 && a.season === 2028).approvedManYen = 999;
  w = fromAnnualState(w, toAnnualState(w)); w.teams[0].budget = 99999999;
  reject(w, r);
});
it.each(['revision', 'date', 'epoch', 'saveId', 'teamId'])('rejects a confirmation after %s changes', field => {
  let w = tradeFixture(); const r = tradeRequest(w, action());
  if (field === 'revision') w = success(reduceEconomyCommand(w, renewalEnvelope(w)));
  else if (field === 'date') { w.contractEconomy.clock.date = '2026-07-17'; w.schedule[1].date.day = 17; }
  else if (field === 'epoch') w.contractEconomy.epoch = 'different';
  else if (field === 'teamId') w.myId = 1;
  else w.saveId = 'different';
  reject(w, r);
});
it.each([{ outgoingIds: [0, 0] }, { incomingIds: [0] }, { toId: 0 }, { cashManYen: 0.5 }, { cashManYen: NaN }, { salary: 0 }])('rejects invalid intent %j', extra => {
  const w = tradeFixture(); reject(w, tradeRequest(w, action(extra)));
});
it('binds accepted mail terms and resolves that mail only in the committed world', () => {
  const w = tradeFixture(); w.mailbox = [{ id: 'offer', type: 'trade', offer: {
    from: w.teams[1], want: [w.teams[0].players[0]], offer: [w.teams[1].players[0]], cash: 5000000 } }];
  const r = tradeRequest(w, action({ mailId: 'offer', cashManYen: -500 }));
  expect(previewHumanTrade(w, r).ok).toBe(true); expect(w.mailbox[0].resolved).toBeUndefined();
  const next = success(reduceTradeRequest(w, r)); expect(next.mailbox[0]).toMatchObject({ read: true, resolved: true });
  reject(w, tradeRequest(w, action({ mailId: 'offer', cashManYen: 0 })));
});
it('declines an expired received offer once without changing budgets, contracts or ownership', () => {
  const w = tradeFixture({ date: '2026-08-01' }); w.mailbox = [{ id: 'offer', type: 'trade', offer: {
    from: w.teams[1], want: [w.teams[0].players[0]], offer: [w.teams[1].players[0]], cash: 5000000 } }];
  const request = tradeRequest(w, action({ mailId: 'offer', cashManYen: -500, decline: true }));
  const next = success(reduceTradeRequest(w, request));
  expect(next.teams).toBe(w.teams); expect(next.contractEconomy.engine.spending).toBe(w.contractEconomy.engine.spending);
  expect(next.mailbox[0]).toMatchObject({ resolved: true, read: true }); expect(next.news).toBe(w.news);
  expect(next.contractEconomy.revision).toBe(1); expect(validateEconomySave(next)).toBe('annual');
  expect(reduceTradeRequest(JSON.parse(JSON.stringify(next)), request)).toMatchObject({ ok: true, replayed: true });
});
