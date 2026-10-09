import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { FinanceTab } from './FinanceTab';
import { fmtSal } from '../../utils';
const player = (id, salary, extra = {}) => ({ id, salary, name: `選手${id}`, pos: '捕手', contractYearsLeft: 2, ...extra });
const team = (extra = {}) => ({ id: 0, name: '球団', wins: 0, losses: 0, budget: 1000, coaches: [], players: [player(0, 100), player(1, 300)], farm: [player(2, 200), player(3, 50, { 育成: true })], ...extra });
const draw = t => renderToStaticMarkup(React.createElement(FinanceTab, { team: t, gameDay: 1 }));
const freeze = obj => { Object.values(obj).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(obj); };
describe('FinanceTab contract salary', () => {
  it('shows every owned category and total, including farm in salary leaders', () => {
    const html = draw(team());
    for (const value of ['選手契約年俸（年額）', '一軍支配下', '二軍支配下', '育成', fmtSal(650), '選手2', '選手3', '支払済み額ではありません']) expect(html).toContain(value);
    expect(html.indexOf('選手1')).toBeLessThan(html.indexOf('選手2'));
    expect(html.indexOf('選手2')).toBeLessThan(html.indexOf('選手0'));
  });
  it('renders deeply frozen input repeatedly without changing team or formation', () => {
    const t = freeze(team({ lineup: [0, 1], defense: { 0: '捕手' }, rotation: [1] }));
    const before = JSON.stringify(t);
    expect(draw(t)).toBe(draw(t));
    expect(JSON.stringify(t)).toBe(before);
  });
  it('distinguishes zero, missing and invalid salaries without fabricated totals', () => {
    const html = draw(team({ players: [player(0, 0), player(1, null), player(2, -1)], farm: [] }));
    for (const value of ['0万円', '未記録', '不正値', '集計不完全', '確認済み']) expect(html).toContain(value);
    expect(html).not.toContain('NaN');
  });
  it('renders an empty club and deduplicates farm overlaps', () => {
    const html = draw(team({ players: [], farm: [] }));
    expect(html).toContain('所属選手はいません');
    const t = team(); t.farm.push(t.players[0], t.farm[1]);
    expect(draw(t)).toContain(fmtSal(650));
  });
});
