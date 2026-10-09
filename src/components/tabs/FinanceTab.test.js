import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { FinanceTab } from './FinanceTab';
const p = (id, salary, extra = {}) => ({ id, name: `選手${id}`, salary, pos: '外', contractYearsLeft: 1, ...extra });
const team = () => ({ name: '球団', players: [p(1, 100), p(2, 200)], farm: [p(3, 300), p(4, 50, { 育成: true })], coaches: [], wins: 0, losses: 0, budget: 900, lineup: [1, 2], rotation: [2] });
function freeze(value) { Object.freeze(value); Object.values(value).forEach(v => { if(v && typeof v === 'object') freeze(v); }); return value; }
describe('FinanceTab read-only salary display', () => {
  it('includes farm and development contracts in the annual total', () => {
    const html = renderToStaticMarkup(React.createElement(FinanceTab, { team: team() }));
    expect(html).toContain('選手契約年俸（年額）');
    expect(html).toContain('650万円');
    expect(html).toContain('選手3');
    expect(html).toContain('二軍支配下');
    expect(html).toContain('育成');
  });
  it('does not mutate a deeply frozen roster, lineup or budget on repeated render', () => {
    const t = freeze(team()); const before = JSON.stringify(t);
    for(let i = 0; i < 2; i++) expect(() => renderToStaticMarkup(React.createElement(FinanceTab, { team: t }))).not.toThrow();
    expect(JSON.stringify(t)).toBe(before);
  });
});
it('shows unknown amounts as an incomplete total and omits them from ranking', () => {
  const t = team(); t.players[0].salary = undefined; t.farm[0].salary = -1;
  const html = renderToStaticMarkup(React.createElement(FinanceTab, { team: t }));
  expect(html).toContain('250万円'); expect(html).toContain('合計は不完全');
  expect(html).toContain('年俸未記録 1人・不正値 1人');
  expect(html).toContain('確認できた分');
  expect(html).not.toContain('NaN'); expect(html).not.toContain('undefined万円');
  expect(html).not.toContain('選手1'); expect(html).not.toContain('選手3');
});
it('shows a measured zero separately from an empty owned roster', () => {
  const t = team(); t.players = [p(1,0)]; t.farm=[];
  const html = renderToStaticMarkup(React.createElement(FinanceTab, { team:t }));
  expect(html).toContain('0万円'); expect(html).toContain('選手1'); expect(html).not.toContain('合計は不完全');
  t.players=[];
  expect(renderToStaticMarkup(React.createElement(FinanceTab, { team:t }))).toContain('所属選手はいません');
});

it('updates the mounted finance view after promotion and a contract change', () => {
  const t = team(); let view;
  act(() => { view = TestRenderer.create(React.createElement(FinanceTab, { team:t })); });
  const summaryText = () => JSON.stringify(view.root.findByProps({ 'aria-label':'選手契約年俸（年額）' }).findAllByType('span').map(n => n.children.filter(c => typeof c === 'string').join('')));
  expect(summaryText()).toContain('300万円');
  const next = { ...t, players:[...t.players,{...t.farm[0],salary:400}], farm:t.farm.slice(1) };
  act(() => { view.update(React.createElement(FinanceTab,{team:next})); });
  expect(summaryText()).toContain('700万円');
  expect(summaryText()).toContain('0万円');
  const html = renderToStaticMarkup(React.createElement(FinanceTab,{team:next}));
  expect(html).toContain('750万円');
  act(() => view.unmount());
});
