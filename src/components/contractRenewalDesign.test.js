import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { ContractRenewalPhaseScreen } from './ContractRenewalPhaseScreen';
import { planningResumeScreen } from '../engine/offseasonPlanning';
import { OFFSEASON_SAVE_SCREENS } from '../engine/offseasonResume';

const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const player = (id, extra = {}) => ({ id, name: `選手${id}`, age: 26, pos: '外野', salary: 1000, contractYearsLeft: 1, daysOnActiveRoster: 0, stats: {}, ...extra });
const views = [];
afterEach(() => views.splice(0).forEach(view => act(() => view.unmount())));
function setup(options = {}) {
  const props = { teams: [{ id: 0, name: '球団', players: [player(0), player(1)], farm: [] }], myId: 0, year: 2026, demands: { 0: { demandSalary: 1000, minAcceptSalary: 1000 }, 1: { demandSalary: 1000, minAcceptSalary: 1000 } }, onSign: vi.fn(), onRelease: vi.fn(), onNext: vi.fn(), ...options };
  let view; act(() => { view = create(React.createElement(ContractRenewalPhaseScreen, props)); }); views.push(view);
  const button = name => view.root.findAllByType('button').find(n => text(n) === name || n.props['aria-label'] === name);
  const click = name => act(() => button(name).props.onClick());
  return { view, props, button, click, update: extra => act(() => view.update(React.createElement(ContractRenewalPhaseScreen, { ...props, ...extra }))) };
}
it('places FA and negotiation explanations after the offer inside disclosures', () => {
  const ui = setup(); ui.click('選手0の契約更改');
  const detail = ui.view.root.findByProps({ className: 'renewal-detail' });
  const sections = detail.findAll(n => n.type === 'section');
  expect(text(sections[0])).toContain('今季の成績');
  const fa = detail.findAllByType('details').find(n => text(n).includes('FAまでの目安'));
  expect(fa).toBeDefined(); expect(fa.props.open).not.toBe(true);
  expect(text(ui.view.root.findByProps({ className: 'renewal-list' }))).not.toContain('最短あと');
  expect(detail.findByProps({ className: 'renewal-cut-note' }).props.id).toBeDefined();
  expect(detail.findByType('input').props['aria-describedby']).toBe(detail.findByProps({ className: 'renewal-cut-note' }).props.id);
});
for (const embedded of [false, true]) it(`confirms frozen player and terms before one offer (${embedded ? 'embedded' : 'standalone'})`, () => {
  const ui = setup({ embedded }); ui.click('選手0の契約更改');
  ui.click('オファーを出す'); expect(ui.props.onSign).not.toHaveBeenCalled();
  expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('選手0へ1,000万円・1年');
  const confirm = ui.button('この条件を提示する').props.onClick;
  act(() => { confirm(); confirm(); }); expect(ui.props.onSign).toHaveBeenCalledTimes(1);
  expect(ui.props.onSign).toHaveBeenCalledWith(0, 1000, 1, expect.any(Number), expect.any(Number));
});
it('keeps pending filter after agreement and clears details when changing to an excluding filter', () => {
  const ui = setup(); ui.click('未合意'); ui.click('選手0の契約更改');
  ui.click('オファーを出す'); ui.click('この条件を提示する'); ui.click('← 選手一覧に戻る');
  expect(ui.button('未合意').props['aria-pressed']).toBe(true);
  expect(ui.view.root.findAllByProps({ 'aria-label': '選手0の契約更改' })).toHaveLength(0);
  ui.click('選手1の契約更改'); ui.click('完了');
  expect(ui.view.root.findAllByProps({ 'aria-label': '選手との交渉' })).toHaveLength(0);
});
it('discards a stale saved selection and lets pending targets be selected', () => {
  const onViewChange = vi.fn(); const ui = setup({ savedView: { selectedId: 'missing', filter: 'pending' }, onViewChange });
  expect(onViewChange).toHaveBeenLastCalledWith({ selectedId: null, filter: 'pending' });
  ui.click('選手0の契約更改'); expect(ui.view.root.findByType('input').props.value).toBe('1000');
});
it('shows an input error without opening confirmation or advancing a round', () => {
  const ui = setup(); ui.click('選手0の契約更改');
  for (const value of ['', '-1', 'NaN']) {
    act(() => ui.view.root.findByType('input').props.onChange({ target: { value } }));
    ui.click('オファーを出す');
    expect(ui.props.onSign).not.toHaveBeenCalled();
    expect(ui.view.root.findAllByProps({ role: 'dialog' })).toHaveLength(0);
    expect(text(ui.view.root.findByProps({ role: 'alert' }))).toContain('提示年俸');
  }
});
it('keeps the total based on prior salary while editing a draft and omits duplicate embedded payroll', () => {
  const ui = setup(); ui.click('選手0の契約更改');
  act(() => ui.view.root.findByType('input').props.onChange({ target: { value: '9000' } }));
  expect(text(ui.view.root)).toContain('年俸総額の見込み 2,000万円');
  ui.update({ embedded: true });
  expect(text(ui.view.root)).not.toContain('年俸総額の見込み');
  expect(text(ui.view.root)).toContain('未解決 2 / 2人');
});
it('resumes the existing standalone route from its saved session without new save fields', () => {
  const plan = { version: 1, year: 2026, myId: 0, stage: 'open', resumeScreen: 'contract_renewal_phase', session: { entries: [] } };
  expect(OFFSEASON_SAVE_SCREENS.has('contract_renewal_phase')).toBe(true);
  expect(planningResumeScreen(plan, 2026, 0)).toBe('contract_renewal_phase');
});
for (const embedded of [false, true]) for (const batch of [false, true]) it(`unlocks after ${batch ? 'batch' : 'individual'} confirmation when the parent has resolved its target (${embedded ? 'embedded' : 'standalone'})`, () => {
  const ui = setup({ embedded });
  if (batch) {
    ui.click('まとめて提示を開く');
    act(() => ui.view.root.findByProps({ 'aria-label': '選手0をまとめて提示の対象にする' }).props.onChange({ target: { checked: true } }));
    ui.click('選択した選手の提示内容を確認');
  } else { ui.click('選手0の契約更改'); ui.click('オファーを出す'); }
  ui.update({ teams: [{ ...ui.props.teams[0], players: [player(0, { contractSignedYear: 2026, contractYears: 2 }), player(1)] }] });
  ui.click(batch ? '各選手へ1回ずつ提示する' : 'この条件を提示する');
  expect(ui.props.onSign).not.toHaveBeenCalled();
  if (batch) { ui.click('結果を閉じる'); ui.click('まとめて提示を閉じる'); }
  ui.click('選手1の契約更改'); ui.click('オファーを出す');
  expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('選手1');
  ui.click('この条件を提示する'); expect(ui.props.onSign).toHaveBeenCalledTimes(1);
});
