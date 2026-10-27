import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it } from 'vitest';
import { ContractTab } from '../tabs/ContractTab';
let view;
afterEach(() => { if (view) act(() => view.unmount()); });
const p = (id, extra = {}) => ({ id, name: `候補${id}`, pos: '捕手', age: 25, salary: 1000, contractYearsLeft: 1, personality: {}, ...extra });
const team = { id: 0, name: '自球団', budget: 10000, players: [p(0), p(1)], farm: [] };
const text = n => typeof n === 'string' ? n : (n?.children || []).map(text).join('');

it.each([{育成:true,isIkusei:false},{育成:false,isIkusei:true}])('offers only the remaining development term in the normal contract tab: %j',flags=>{
  const development=p(0,{...flags,salary:240,ikuseiYears:2});
  act(()=>{view=create(React.createElement(ContractTab,{team:{...team,players:[],farm:[development]},year:2026,focusRequest:{id:0,token:1}}));});
  expect(view.root.findByProps({'aria-label':'契約年数'}).findAllByType('option').map(o=>o.props.value)).toEqual([1]);
});

it('initially shows actionable players, not players waiting for an answer, and lazily renders payroll detail', () => {
  act(() => { view = create(React.createElement(ContractTab, { team, year: 2026, mailbox: [{ type: 'contract_decision_pending', decision: { playerId: 1, teamId: 0, offeredYear: 2026 } }] })); });
  const list = view.root.findByProps({ 'aria-label': '所属選手の契約一覧' });
  expect(text(list)).toContain('候補0'); expect(text(list)).not.toContain('候補1');
  expect(view.root.findAll(n => n.props['data-ds'] === 'contract-payroll')).toHaveLength(0);
});

it('a missing notification ID clears the previously selected contract rather than showing a different player', () => {
  const render = token => React.createElement(ContractTab, { team, year: 2026, focusRequest: { id: token === 1 ? 0 : 'departed', token } });
  act(() => { view = create(render(1)); });
  expect(view.root.findAllByType('h3').some(n => text(n) === '候補0')).toBe(true);
  act(() => view.update(render(2)));
  expect(text(view.root)).toContain('この選手は現在所属していません');
  expect(view.root.findAllByType('h3').some(n => text(n) === '候補0')).toBe(false);
});

it('a prior-year legacy pending mail does not block current contract negotiation', () => {
  act(() => { view = create(React.createElement(ContractTab, { team, year: 2026, focusRequest: { id: 0, token: 1 },
    mailbox: [{ type: 'contract_decision_pending', dateLabel: '2025年 2日目', decision: { playerId: 0, teamId: 0, salary: 1000, years: 1 } }] })); });
  expect(view.root.findAllByType('button').some(n => text(n) === '提示条件を確認する')).toBe(true);
});
