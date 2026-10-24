import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { NewsTab } from './NewsTab';

const option = { text: '登録された回答', popMod: 5, moraleMod: 7 };
const news = (answered = false) => [{ id: 'one', type: 'interview', headline: '会見1', question: '今後の方針は？', options: [option], answered }, { id: 'two', type: 'game', headline: '試合結果' }];
let view;
afterEach(() => { if (view) act(() => view.unmount()); view = null; });
function render(items, onInterview = vi.fn()) { act(() => { view = create(React.createElement(NewsTab, { news: items, onInterview })); }); }
const nodeText=n=>typeof n==='string'?n:(n.children||[]).map(nodeText).join('');
function open(headline) { act(() => view.root.findAllByType('button').find(n => nodeText(n).includes(headline)).props.onClick()); }
const text = () => nodeText(view.root);
const transferText = () => view.root.findAllByType('details').map(nodeText).join('');
const detail = () => nodeText(view.root.findByProps({className:'reading-detail'}));
it('uses persisted answered state on initial render and never guesses an unsaved answer', () => {
  render(news(true)); open('会見1');
  expect(text()).toContain('回答済み'); expect(detail()).not.toContain('回答待ち'); expect(text()).not.toContain(option.text);
});
it('derives selected detail from refreshed news after answering or hydration', () => {
  const onInterview = vi.fn(); render(news(), onInterview); open('会見1');
  expect(text()).toContain(option.text);
  act(() => view.update(React.createElement(NewsTab, { news: news(true), onInterview })));
  expect(text()).toContain('回答済み'); expect(text()).not.toContain(option.text);
  open('試合結果'); open('会見1'); expect(text()).not.toContain(option.text);
});
it('does not locally declare success when the command was rejected', () => {
  const onInterview = vi.fn(() => false); render(news(), onInterview); open('会見1');
  const choice = view.root.findAllByType('button').find(n => nodeText(n).includes(option.text));
  act(() => choice.props.onClick());
  expect(onInterview).toHaveBeenCalledWith('one', option);
  expect(text()).toContain(option.text); expect(detail()).not.toContain('回答済み');
});
it('closes details when the selected article no longer exists', () => {
  render(news()); open('会見1');
  act(() => view.update(React.createElement(NewsTab, { news: [] })));
  expect(text()).not.toContain('今後の方針は？'); expect(text()).not.toContain(option.text);
});

it.each([undefined, null, 0, -0, NaN, Infinity, -Infinity, 'invalid', '0', '', true, false, [500], {}])('omits cash labels for absent, zero or nonfinite cash %s without mutating history', cash => {
  const transfers = [{ id: 'cpu', year: 2026, headline: 'CPU間トレード', playersIn: ['加入'], playersOut: ['放出'], cash }];
  const before = structuredClone(transfers);
  act(() => { view = create(React.createElement(NewsTab, { news: [], transfers })); });
  expect(transferText()).toContain('CPU間トレード'); expect(transferText()).toContain('加入'); expect(transferText()).toContain('放出');
  expect(transferText()).not.toMatch(/金銭|NaN|Infinity/);
  expect(transfers).toEqual(before);
});
it('omits cash for CPU history with no cash property', () => {
  const transfers = [{ id: 'cpu', year: 2026, headline: 'CPU間トレード' }];
  act(() => { view = create(React.createElement(NewsTab, { news: [], transfers })); });
  expect(transferText()).not.toMatch(/金銭|NaN/); expect(transfers[0]).not.toHaveProperty('cash');
});
it.each([[1250, '金銭支払い 1,250万円'], [-1250, '金銭受取 1,250万円'], ['500', '金銭支払い 500万円'], ['-500', '金銭受取 500万円']])('preserves signed cash %s in 万円, including saved numeric strings', (cash, label) => {
  const transfers = [{ id: 'player', year: 2026, cash }];
  act(() => { view = create(React.createElement(NewsTab, { news: [], transfers })); });
  expect(transferText()).toContain(label); expect(transfers[0].cash).toBe(cash);
});
