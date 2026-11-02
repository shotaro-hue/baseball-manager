import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { TradeTab } from './TradeTab';
import { tradeFixture } from '../../engine/__tests__/fixtures/tradeWorld';
import { reduceTradeRequest } from '../../engine/humanTrade';
vi.mock('../../engine/trade', async original => ({ ...await original(), evalTradeForCpu: () => ({ fair: true, favorable: false, reasons: [] }) }));
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.restoreAllMocks(); });
const p = id => ({ id, name: `選手${id}`, age: 26, pos: '一塁手', batting: { contact: 50 } });
function setup(result = true) {
  const mine = { id: 0, name: '自球団', players: [p(0), p(2)], budget: 1000 }, other = { id: 1, name: '相手球団', players: [p(1), p(3)], budget: 1000 };
  const onTrade = vi.fn(() => result);
  act(() => { view = create(React.createElement(TradeTab, { myTeam: mine, teams: [mine, other], onTrade, cpuOffers: [] })); });
  const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
  const clickText = label => act(() => view.root.findAll(n => n.type === 'button').find(n => text(n).includes(label)).props.onClick());
  clickText('相手球団と交渉する');
  clickText('獲得候補を選ぶ');
  act(() => view.root.findAllByType('input').find(n => n.props['aria-label'] === '選手1を獲得候補に選ぶ').props.onChange({ target: { checked: true } }));
  return { onTrade, clickText, text: () => text(view.root) };
}
it('a counteroffer asks for a player from my club and sends that player to the CPU', () => {
  const h = setup();
  vi.spyOn(Math, 'random').mockReturnValueOnce(.9).mockReturnValue(.1);
  h.clickText('トレードを提案する');
  expect(h.onTrade).not.toHaveBeenCalled();h.clickText('確認して提案する');
  expect(h.text()).toContain('選手0も一緒に欲しい');
  h.clickText('受け入れる');
  expect(h.onTrade).not.toHaveBeenCalled();h.clickText('逆提案を確定する');
  expect(h.onTrade.mock.calls[0][0].map(p => p.id)).toEqual([0]);
  expect(h.onTrade.mock.calls[0][1].map(p => p.id)).toEqual([1]);
});
it('does not display a successful trade when final execution rejects it', () => {
  const h = setup(false);
  vi.spyOn(Math, 'random').mockReturnValue(.1);
  h.clickText('トレードを提案する');
  h.clickText('確認して提案する');
  expect(h.onTrade).toHaveBeenCalledOnce();
  expect(h.text()).not.toContain('トレード成立！');
});

const content = n => typeof n === 'string' ? n : (n.children || []).map(content).join('');
const button = label => view.root.findAllByType('button').find(n => content(n) === label);
const click = label => act(() => button(label).props.onClick());
const selectedTitle = () => content(view.root.findByProps({ 'aria-label': '選択したトレード案件' }).findByType('h2'));
function mailWorld() {
  const w = tradeFixture();
  w.mailbox = ['A', 'B'].map(id => ({ id, type: 'trade', title: `案件${id}`, offer: {
    from: w.teams[1], want: [w.teams[0].players[0]], offer: [w.teams[1].players[0]], cash: 0 } }));
  return w;
}
it.each(['承諾', '辞退'])('opens legacy case B after completing case A by %s', decision => {
  const w = mailWorld(), callback = vi.fn(() => true);
  const props = { myTeam: w.teams[0], teams: w.teams, offerMails: w.mailbox,
    onAcceptOffer: callback, onDeclineOffer: callback, focusRequest: { id: 'A', token: 1 } };
  act(() => { view = create(React.createElement(TradeTab, props)); });
  click(`${decision}内容を確認する`); click(`${decision}を確定する`);
  expect(content(view.root)).toContain('この提案は対応済みです');
  act(() => view.update(React.createElement(TradeTab, { ...props, focusRequest: { id: 'B', token: 2 } })));
  expect(selectedTitle()).toBe('案件B');
  click('辞退内容を確認する'); click('辞退を確定する');
  expect(callback.mock.calls.map(c => c[0])).toEqual([0, 1]);
});
it.each(['success', 'save-failure', 'recovery'])('keeps annual case A fixed until %s completes, then opens pending case B', async outcome => {
  let w = mailWorld(), release, submitted;
  const commit = vi.fn(request => { submitted = request; return new Promise(resolve => { release = resolve; }); });
  const recover = vi.fn(() => Promise.resolve({ ok: true }));
  let focusRequest = { id: 'A', token: 1 };
  const render = () => React.createElement(TradeTab, { myTeam: w.teams[0], teams: w.teams, offerMails: w.mailbox,
    annualGs: { ...w, getProgressSessionToken: () => 1, commitTradeRequest: commit, recoverEconomyCommand: recover }, focusRequest });
  act(() => { view = create(render()); });
  click('辞退内容を確認する'); click('辞退を確定する');
  const request = structuredClone(submitted);
  focusRequest = { id: 'B', token: 2 }; act(() => view.update(render()));
  expect(selectedTitle()).toBe('案件A');
  expect(content(view.root.findByProps({ 'aria-label': '提案辞退の確認' }))).toContain('案件A');
  expect(submitted.action.mailId).toBe('A'); expect(commit).toHaveBeenCalledOnce();
  const result = reduceTradeRequest(w, submitted); expect(result.ok, result.error).toBe(true);
  if (outcome !== 'success') {
    if (outcome === 'recovery') w = result.world;
    await act(async () => { release({ ok: false, reason: outcome === 'recovery' ? 'economy_adoption_required' : 'save_failed' }); });
    // Another notification after the save attempt must not replace retry/recovery.
    focusRequest = { id: 'B', token: 3 }; act(() => view.update(render()));
    expect(selectedTitle()).toBe('案件A');
    expect(content(view.root.findByProps({ 'aria-label': '提案辞退の確認' }))).toContain('案件A');
    if (outcome === 'save-failure') {
      click('同じ条件で保存を再試行する');
      expect(submitted).toEqual(request);
    }
  }
  w = result.world; act(() => view.update(render()));
  if (outcome === 'recovery') await act(async () => button('保存済みのトレードを復旧する').props.onClick());
  else await act(async () => release({ ok: true }));
  expect(selectedTitle()).toBe('案件B');
  expect(w.mailbox.map(m => Boolean(m.resolved))).toEqual([true, false]);
  expect(w.contractEconomy.engine.transactions).toHaveLength(1);
  // A normal rerender must not reopen an already-consumed focus request.
  click('交渉画面へ戻る'); act(() => view.update(render()));
  expect(view.root.findAllByProps({ 'aria-label': '選択したトレード案件' })).toHaveLength(0);
});
