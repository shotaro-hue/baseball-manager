import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { TradeTab } from './TradeTab';
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
