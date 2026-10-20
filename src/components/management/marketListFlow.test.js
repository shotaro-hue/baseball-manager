import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { TradeTab } from '../tabs/TradeTab';
import HubScoutTab from '../hub/HubScoutTab';
import HubFaTab from '../hub/HubFaTab';
let view;
afterEach(() => { if (view) act(() => view.unmount()); });
const p = id => ({ id, name: `候補${id}`, pos: '捕手', age: 25, salary: 1000, contractYearsLeft: 1, batting: { contact: 50, power: 50 }, stats: {} });
const mine = { id: 0, name: '自球団', budget: 10000, players: [p(0)], farm: [p(2)] }, other = { ...mine, id: 1, name: '相手球団', players: [p(1)], farm: [] };
const text = n => typeof n === 'string' ? n : (n?.children || []).map(text).join('');
const button = label => view.root.findAllByType('button').find(n => text(n) === label || n.props['aria-label'] === label);
const click = label => act(() => button(label).props.onClick());

it('trade renders one compact club list at a time, including farm players, with detail only on demand', () => {
  act(() => { view = create(React.createElement(TradeTab, { myTeam: mine, teams: [mine, other], onTrade: vi.fn() })); });
  click('相手球団と交渉する');
  expect(view.root.findAllByType('input').filter(n => n.props.type === 'checkbox')).toHaveLength(2);
  expect(text(view.root)).not.toContain('保存された一軍成績');
  click('獲得候補を選ぶ');
  expect(view.root.findAllByType('input').filter(n => n.props.type === 'checkbox')).toHaveLength(1);
  click('候補1の条件を見る');
  expect(text(view.root)).toContain('スカウト評価');
});

it('scout separates reports and dispatch without losing a pending report selection', () => {
  act(() => { view = create(React.createElement(HubScoutTab, { myTeam: { ...mine, scoutResults: [p(3)] }, scoutRegions: [{ id: 0, name: '関東', cost: 100 }] })); });
  expect(button('関東への派遣を検討')).toBeUndefined();
  click('派遣先・調査中'); expect(button('関東への派遣を検討')).toBeTruthy();
  click('報告済み候補'); click('候補3の条件を見る');
  expect(text(view.root)).toContain('獲得条件');
});

it('FA rows defer statistics and compare controls to the selected candidate', () => {
  act(() => { view = create(React.createElement(HubFaTab, { myTeam: mine, faPool: [p(3), p(4)], gameDay: 1, year: 2026, myId: 0, onToggleCompare: vi.fn() })); });
  expect(view.root.findAllByType('button').filter(n => text(n) === '比較に追加')).toHaveLength(0);
  click('候補3の条件を見る');
  expect(view.root.findAllByType('button').filter(n => text(n) === '比較に追加')).toHaveLength(1);
});
