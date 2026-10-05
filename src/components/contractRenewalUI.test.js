import React from 'react';
import { act, create } from 'react-test-renderer';
import { describe, it, expect, vi } from 'vitest';
import { ContractRenewalPhaseScreen } from './ContractRenewalPhaseScreen';
import { calcPlayerDemand } from '../engine/contract';
import { emptyStats } from '../engine/playerCore';

const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const player = (id, extra = {}) => ({ id, name: `選手${id}`, age: 26, pos: '外野', salary: 1000, contractYearsLeft: 1, personality: { money: 50 }, stats: { ...emptyStats(), PA: 500, AB: 450, H: 150, HR: 20, BB: 40, HBP: 5, SF: 5 }, ...extra });
function setup(players, demandOverride = {}, farm = []) {
  const team = { id: 0, name: '球団', players, farm, lineup: players.map(p => p.id), wins: 80, losses: 60 };
  const props = { teams: [team], myId: 0, year: 2026, demands: Object.fromEntries(players.map(p => [p.id, demandOverride[p.id] || calcPlayerDemand(p)])), onSign: vi.fn(), onRelease: vi.fn(), onNext: vi.fn() };
  let view;
  act(() => { view = create(React.createElement(ContractRenewalPhaseScreen, props)); });
  const button = label => view.root.findAllByType('button').find(n => text(n) === label);
  const click = label => act(() => button(label).props.onClick());
  const select = id => act(() => view.root.findAllByType('button').find(n => n.props['aria-label'] === `選手${id}の契約更改`).props.onClick());
  const salary = value => act(() => view.root.findByType('input').props.onChange({ target: { value } }));
  const rerender = players => act(() => view.update(React.createElement(ContractRenewalPhaseScreen, { ...props, teams: [{ ...team, players }] })));
  return { view, props, button, click, select, salary, rerender };
}

describe('contract renewal workflow', () => {
  it('includes non-expiring and farm salaries and marks missing payroll as unrecorded', () => {
    const ui = setup([player(0), player(1, { salary: 2000, contractYearsLeft: 3 })], {}, [player(2, { salary: 800 })]);
    expect(text(ui.view.root)).toContain('年俸総額の見込み 3,800万円');
    ui.select(0); ui.click('戦力外を検討する'); ui.click('戦力外を確定する');
    expect(text(ui.view.root)).toContain('年俸総額の見込み 2,800万円');
    act(() => ui.view.unmount());
    const missing = setup([player(0, { salary: undefined })]);
    expect(text(missing.view.root)).toContain('年俸総額の見込み 未記録');
    act(() => missing.view.unmount());
  });
  it('keeps per-player draft salary and years after switching and returning', () => {
    const ui = setup([player(0), player(1)]);
    ui.select(0); ui.salary('1234');
    act(() => ui.view.root.findByType('select').props.onChange({ target: { value: '3' } }));
    ui.click('← 選手一覧に戻る'); ui.select(1); ui.salary(''); ui.select(0);
    expect(ui.view.root.findByType('input').props.value).toBe('1234');
    expect(ui.view.root.findByType('select').props.value).toBe(3);
    ui.select(1); expect(ui.view.root.findByType('input').props.value).toBe('');
    ui.click('オファーを出す'); expect(ui.props.onSign).not.toHaveBeenCalled();
    act(() => ui.view.unmount());
  });
  it('keeps a multiyear agreement in the cohort after the parent updates it', () => {
    const p = player(0); const ui = setup([p]); ui.select(0);
    act(() => ui.view.root.findByType('select').props.onChange({ target: { value: '3' } }));
    const send = ui.button('オファーを出す').props.onClick;
    act(() => { send(); send(); });
    expect(ui.props.onSign).toHaveBeenCalledTimes(1);
    ui.rerender([{ ...p, salary: ui.props.demands[0].demandSalary, contractYearsLeft: 3 }]);
    expect(text(ui.view.root)).toContain('合意条件：');
    expect(ui.button('更改結果を確認する').props.disabled).toBe(false);
    ui.click('更改結果を確認する'); expect(ui.props.onNext).not.toHaveBeenCalled();
    expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('3年');
    const confirm = ui.button('確定して次へ進む').props.onClick;
    act(() => { confirm(); confirm(); }); expect(ui.props.onNext).toHaveBeenCalledTimes(1);
    expect(ui.props.onNext).toHaveBeenCalledWith([]);
    act(() => ui.view.unmount());
  });
  it('requires release confirmation and retains the removed player and payroll impact', () => {
    const ui = setup([player(0)]); ui.select(0); ui.click('戦力外を検討する');
    expect(ui.props.onRelease).not.toHaveBeenCalled(); ui.click('戻る');
    expect(ui.props.onRelease).not.toHaveBeenCalled();
    ui.click('戦力外を検討する'); const release = ui.button('戦力外を確定する').props.onClick;
    act(() => { release(); release(); }); expect(ui.props.onRelease).toHaveBeenCalledTimes(1);
    ui.rerender([]); expect(text(ui.view.root)).toContain('戦力外');
    expect(text(ui.view.root)).toContain('年俸総額の見込み 0万円');
    ui.click('更改結果を確認する'); expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('選手0：戦力外');
    act(() => ui.view.unmount());
  });
  it('keeps rejection history through a retry and blocks final review while unresolved', () => {
    const p = player(0, { salary: 10000 });
    const demand = { demandSalary: 50000, minOfferSalary: 7500, minAcceptSalary: 40000, resistanceFactor: 1 };
    const ui = setup([p], { 0: demand }); ui.select(0);
    for (let i = 0; i < 3; i++) { ui.salary('7500'); ui.click('オファーを出す'); }
    expect(ui.button('更改結果を確認する').props.disabled).toBe(true);
    expect(text(ui.view.root)).toContain('再交渉待ち');
    ui.click('再交渉する'); expect(text(ui.view.root)).toContain('第3回');
    ui.salary('50000'); ui.click('オファーを出す');
    expect(ui.props.onSign).toHaveBeenCalledWith(0, 50000, 1, expect.any(Number), expect.any(Number));
    act(() => ui.view.unmount());
  });
  it('passes FA player ID 0 only after the final confirmation', () => {
    const p = player(0, { salary: 10000, daysOnActiveRoster: 10000 });
    const ui = setup([p], { 0: { demandSalary: 50000, minOfferSalary: 7500, minAcceptSalary: 40000 } }); ui.select(0);
    for (let i = 0; i < 3; i++) { ui.salary('7500'); ui.click('オファーを出す'); }
    expect(text(ui.view.root)).toContain('FA宣言'); expect(ui.props.onNext).not.toHaveBeenCalled();
    ui.click('更改結果を確認する'); ui.click('確定して次へ進む');
    expect(ui.props.onNext).toHaveBeenCalledWith([0]);
    act(() => ui.view.unmount());
  });
  it('distinguishes measured zeros, absent counts, and zero ERA', () => {
    const ui = setup([player(0, { isPitcher: true, stats: { IP: 10, ER: 0, W: 0, Kp: 0 } })]); ui.select(0);
    const stats = ui.view.root.findAll(n => n.type === 'div' && n.props.className === 'renewal-stats')[0];
    expect(text(stats)).toContain('防御率 0.00'); expect(text(stats)).toContain('勝利 0');
    expect(text(stats)).toContain('セーブ 未記録'); expect(text(stats)).toContain('奪三振 0');
    act(() => ui.view.unmount());
  });
  it('handles delayed team loading and an empty renewal cohort', () => {
    let view; const onNext = vi.fn();
    const props = { teams: [], myId: 0, onNext };
    act(() => { view = create(React.createElement(ContractRenewalPhaseScreen, props)); });
    expect(text(view.root)).toContain('読み込み中');
    act(() => view.update(React.createElement(ContractRenewalPhaseScreen, { ...props, teams: [{ id: 0, name: '球団', players: [] }] })));
    expect(text(view.root)).toContain('契約更改が必要な選手はいません');
    act(() => view.unmount());
  });
});
