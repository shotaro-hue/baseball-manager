import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { act, create } from 'react-test-renderer';
import { describe, expect, it } from 'vitest';
import { FinanceTab } from './FinanceTab';
import { ContractTab } from './ContractTab';
import { ContractPayroll } from './ContractPayroll';
import { fmtSal } from '../../utils';
import { startClubFinance, applyClubGameFinance, forecastClubFinance } from '../../engine/clubFinance';
const player = (id, salary, extra = {}) => ({ id, salary, name: `選手${id}`, pos: '捕手', contractYearsLeft: 2, ...extra });
const team = (extra = {}) => ({ id: 0, name: '球団', wins: 0, losses: 0, budget: 1000, coaches: [], players: [player(0, 100), player(1, 300)], farm: [player(2, 200), player(3, 50, { 育成: true })], ...extra });
const drawContract = t => {
  let view;
  act(() => { view = create(React.createElement(ContractTab, { team: t, year: 2026 })); });
  expect(view.root.findAllByType(ContractPayroll)).toHaveLength(0);
  const disclosure = view.root.findAllByType('details').find(n => n.props.onToggle);
  act(() => disclosure.props.onToggle({ currentTarget: { open: true } }));
  const payroll = view.root.findByType(ContractPayroll);
  const html = renderToStaticMarkup(React.createElement(ContractPayroll, payroll.props));
  act(() => view.unmount());
  return html;
};
const draw = t => renderToStaticMarkup(React.createElement(FinanceTab, { team: t, gameDay: 1 }));
const freeze = obj => { Object.values(obj).forEach(v => { if (v && typeof v === 'object') freeze(v); }); return Object.freeze(obj); };
describe('FinanceTab contract salary', () => {
  it('preserves the coach salary reference without changing player payroll, reference surplus or saved data', () => {
    const t = freeze(startClubFinance(team({ budget: 500000, coaches: [{ salary: 120 }, { salary: 0 }, { salary: 240 }] }), 2026));
    const before = JSON.stringify(t), html = draw(t), forecast = forecastClubFinance(t);
    expect(html).toContain('コーチ給与（参考）');
    expect(html).toContain('コーチ給与合計（参考）</dt><dd>360万円</dd>');
    expect(html).toContain('契約給与・支払済み額ではありません');
    expect(html).toContain('コーチ給与は選手の契約年俸総額・参考収支には含みません');
    expect(html).toContain('契約年俸控除後の参考収支（年間）</dt><dd>' + fmtSal(forecast.operatingSurplus.min - 650));
    expect(html).toContain(fmtSal(t.budget));
    expect(JSON.stringify(t)).toBe(before);
  });
  it.each([
    [[], '0万円'],
    [[{ salary: 0 }], '0万円'],
    [undefined, '— 未記録'],
    [[{ salary: 120 }, { salary: null }], '— 算出不可'],
    [[{ salary: 120 }, { salary: '240' }], '— 算出不可'],
    [[{ salary: -1 }], '— 算出不可'],
  ])('does not present missing or invalid coach salaries as recorded zero (%j)', (coaches, expected) => {
    expect(draw(team({ coaches }))).toContain(`コーチ給与合計（参考）</dt><dd>${expected}</dd>`);
  });
  it('shows estimated receipts, operating costs and the distinct spending envelope for the new model', () => {
    const t = startClubFinance(team({ budget: 500000 }), 2026), html = draw(t);
    for (const text of ['主催売上', '運営費', '放映権', '会員', '編成予算', '現金残高', '推定値']) expect(html).toContain(text);
    expect(html).toContain('10.00億円');
  });
  it('restores the annual salary-adjusted reference without subtracting payroll from the spending budget', () => {
    const t = startClubFinance(team({ budget: 500000 }), 2026);
    const forecast = forecastClubFinance(t);
    const expected = forecast.operatingSurplus.min === forecast.operatingSurplus.max
      ? fmtSal(forecast.operatingSurplus.min - 650)
      : `${fmtSal(forecast.operatingSurplus.min - 650)} 〜 ${fmtSal(forecast.operatingSurplus.max - 650)}`;
    const html = draw(t);
    expect(html).toContain(`契約年俸控除後の参考収支（年間）</dt><dd>${expected}</dd>`);
    expect(html).toContain('支払済み額でも編成予算の残枠でもありません');
    expect(html).toContain(fmtSal(t.budget));
  });
  it('shows unavailable when any annual payroll is missing or invalid, but preserves recorded zero', () => {
    const missing = startClubFinance(team({ players: [player(0, 0), player(1, null), player(4, -1)], farm: [player(2, 100)] }), 2026);
    expect(draw(missing)).toContain('契約年俸控除後の参考収支（年間）</dt><dd>— 算出不可</dd>');
    expect(draw(missing)).toContain('年俸を全員分集計できないため算出不可');
    const zero = startClubFinance(team({ players: [player(0, 0)], farm: [] }), 2026);
    const forecast = forecastClubFinance(zero);
    const html = draw(zero);
    expect(html).toContain(`契約年俸控除後の参考収支（年間）</dt><dd>${fmtSal(forecast.operatingSurplus.min)}`);
    expect(html).not.toContain('年俸を全員分集計できないため算出不可');
    expect(draw(team())).not.toContain('契約年俸控除後の参考収支（年間）');
  });
  it('uses actual schedule and ledger games, not an unrelated gameDay or a second home-only scaling', () => {
    const t = applyClubGameFinance(startClubFinance(team(), 2026), { year: 2026, gameDay: 1, isHomeTeam: true });
    const schedule = [null, ...Array.from({ length: 143 }, (_, i) => ({ matchups: [i % 2 ? { homeId: 1, awayId: 0 } : { homeId: 0, awayId: 1 }] }))];
    const expected = forecastClubFinance(t, schedule), before = JSON.stringify(t);
    const html = renderToStaticMarkup(React.createElement(FinanceTab, { team: t, gameDay: 99, schedule }));
    expect(html).toContain('主催72試合');
    expect(html).toContain(fmtSal(expected.revenue.min));
    expect(html).toContain('実施1試合');
    expect(JSON.stringify(t)).toBe(before);
  });
  it('describes stadium improvements as a baseline price change when a manual price is fixed', () => {
    const html = draw(startClubFinance(team({ customAvgTicketPrice: 3300 }), 2026));
    expect(html).toContain('改修1段階につき+3.5%');
    expect(html).toContain('手動設定中のチケット価格は維持されます');
    expect(html).toContain('3,300円/枚');
  });
  it('explains legacy model boundaries and uses played games instead of calendar position for its projection', () => {
    const t = team({ wins: 1, revenueThisSeason: 10000 });
    expect(draw(t)).toContain('翌年度');
    expect(draw(t)).toContain(fmtSal(1430000));
  });
  it('shows every owned category and total, including farm in salary leaders', () => {
    const html = drawContract(team());
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
    const html = drawContract(team({ players: [], farm: [] }));
    expect(html).toContain('所属選手はいません');
    const t = team(); t.farm.push(t.players[0], t.farm[1]);
    expect(drawContract(t)).toContain(fmtSal(650));
  });
});
