import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HubFaTab from './HubFaTab';
import { rngf } from '../../utils';
import { addMarketSigning, marketMetrics, marketNeeds, marketPlacement, validateMarketContract } from './faMarket';
import { MAX_ROSTER, FOREIGN_DEADLINE_DAY } from '../../constants';

vi.mock('../../utils', async importOriginal => ({ ...await importOriginal(), rngf: vi.fn() }));
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const player = (id, extra = {}) => ({ id, name: `候補${id}`, age: 26, pos: '外野', salary: 1000, isFA: true, stats: {}, ...extra });
const team = extra => ({ id: 0, budget: 10000, players: [], farm: [], history: [], ...extra });
const views = [];
afterEach(() => { for (const view of views.splice(0)) act(() => view.unmount()); vi.clearAllMocks(); });
function setup(pool = [player(0)], extra = {}) {
  let props = { myTeam: team(), myId: 0, faPool: pool, faYears: {}, gameDay: 10, year: 2026,
    upd: vi.fn(), setFaPool: vi.fn(), setFaYears: vi.fn(), notify: vi.fn(), onPlayerClick: vi.fn(), onToggleCompare: vi.fn(), ...extra };
  let view;
  act(() => { view = create(React.createElement(HubFaTab, props)); }); views.push(view);
  const button = label => view.root.findAllByType('button').find(n => text(n) === label);
  const click = label => act(() => button(label).props.onClick());
  const select = id => act(() => view.root.findAllByType('button').find(n => n.props['aria-label'] === `候補${id}の条件を見る`).props.onClick());
  const update = extra => act(() => { props = { ...props, ...extra }; view.update(React.createElement(HubFaTab, props)); });
  return { view, get props() { return props; }, button, click, select, update };
}

describe('FA market saved data and signing rules', () => {
  it('distinguishes measured zero, missing counts, and undefined rates', () => {
    expect(Object.fromEntries(marketMetrics(player(0, { stats: { AB: 10, H: 0, HR: 0, RBI: 0 } })))).toMatchObject({ 打率: '0.000', 本塁打: 0, 打点: 0, 打席: '未記録', OPS: '—' });
    expect(Object.fromEntries(marketMetrics(player(0, { isPitcher: true, stats: { IP: 9, ER: 0, W: 0 } })))).toMatchObject({ 防御率: '0.00', 勝利: 0, 奪三振: '未記録' });
    expect(Object.fromEntries(marketMetrics(player(0, { isPitcher: true, stats: { IP: 0, ER: 0 } })))).toMatchObject({ 防御率: '—' });
  });
  it('shows structural needs from actual active and farm counts', () => {
    const players = [...Array.from({ length: 4 }, (_, i) => player(i, { isPitcher: true, subtype: '先発' })), ...Array.from({ length: 3 }, (_, i) => player(i + 4, { isPitcher: true, pos: '中継ぎ' })), player(8, { isPitcher: true, pos: '抑え' }), player(9, { pos: '捕手' })];
    expect(marketNeeds(team({ players: [...players, player(10, { pos: '捕手' })], farm: [player(11, { pos: '捕手' })] }))).toEqual([]);
    expect(marketNeeds(team({ players, farm: [player(10, { pos: '捕手' }), player(11, { pos: '捕手' })] }))).toEqual(['捕手（登録） 1/2人']);
    expect(marketNeeds(team())).toEqual(['先発 0/4人', '中継ぎ 0/3人', '抑え 0/1人', '捕手（登録） 0/2人', '捕手（登録＋ファーム） 0/3人']);
  });
  it('preserves roster, foreign count, and foreign position balance restrictions', () => {
    const foreign = player(20, { isForeign: true, isPitcher: true });
    const pitchers = Array.from({ length: 3 }, (_, i) => player(i, { isForeign: true, isPitcher: true }));
    expect(marketPlacement(team({ players: pitchers }), foreign).farm).toBe(true);
    expect(marketPlacement(team({ players: pitchers }), { ...foreign, isPitcher: false }).farm).toBe(false);
    expect(marketPlacement(team({ players: [...pitchers, player(4, { isForeign: true })] }), foreign).farm).toBe(true);
    expect(marketPlacement(team({ players: Array.from({ length: MAX_ROSTER }, (_, i) => player(i)) }), player(30)).farm).toBe(true);
  });
  it('keeps upfront multiyear cost, contract fields, and acquisition history', () => {
    const p = player(0, { isWaiverReleased: true });
    const result = addMarketSigning(team(), p, 1000, 3, 2026);
    expect(result.budget).toBe(7000);
    expect(result.players[0]).toMatchObject({ id: 0, salary: 1000, contractYears: 3, contractYearsLeft: 3, isFA: false });
    expect(result.history[0]).toMatchObject({ exitYear: 2026, exitReason: 'waiver_fa', tenure: 0 });
    const full = team({ players: Array.from({ length: MAX_ROSTER }, (_, i) => player(i + 1)) });
    expect(addMarketSigning(full, player(0, { isForeign: true }), 1200, 2, 2026).farm[0].id).toBe(0);
    expect(addMarketSigning(full, player(0, { isForeign: true }), 1200, 2, 2026).history[0].exitReason).toBe('foreign_fa');
  });
  it('rejects missing or invalid terms and budget rather than creating free contracts', () => {
    const p = player(0); const args = { team: team(), pool: [p], player: p, salary: 1000, years: 1, gameDay: 10 };
    expect(validateMarketContract(args)).toBeNull();
    for (const salary of [undefined, NaN, Infinity, 0, -1]) expect(validateMarketContract({ ...args, salary })).toBeTruthy();
    for (const years of [0, 1.5, 4]) expect(validateMarketContract({ ...args, years })).toBeTruthy();
    expect(validateMarketContract({ ...args, team: team({ budget: undefined }) })).toContain('未記録');
    expect(validateMarketContract({ ...args, team: team({ budget: 0 }) })).toContain('不足');
    expect(validateMarketContract({ ...args, pool: [] })).toContain('市場にいません');
  });
});

describe('mobile FA decision flow', () => {
  it('keeps ID 0 selectable, detail/comparison entrances, and confirmation before signing', () => {
    const ui = setup(); ui.select(0);
    ui.click('選手詳細・年度別成績'); expect(ui.props.onPlayerClick).toHaveBeenCalledWith(ui.props.faPool[0], 'FA市場');
    act(() => ui.view.root.findByProps({ className: 'fa-actions' }).findAllByType('button').find(n => text(n) === '比較に追加').props.onClick());
    expect(ui.props.onToggleCompare).toHaveBeenCalledWith(ui.props.faPool[0], 'FA市場');
    ui.click('契約条件を確認する'); expect(ui.props.upd).not.toHaveBeenCalled();
    expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('契約後の予算');
    ui.click('戻って見直す'); expect(ui.props.upd).not.toHaveBeenCalled();
    ui.click('契約条件を確認する'); const confirm = ui.button('契約を確定する').props.onClick;
    act(() => { confirm(); confirm(); }); expect(ui.props.upd).toHaveBeenCalledTimes(1);
    const [id, update] = ui.props.upd.mock.calls[0]; expect(id).toBe(0); expect(update(ui.props.myTeam).budget).toBe(9000);
    expect(ui.props.setFaPool.mock.calls[0][0](ui.props.faPool)).toEqual([]);
    expect(ui.props.setFaYears.mock.calls[0][0]({ 0: 3, 1: 2 })).toEqual({ 1: 2 });
    expect(text(ui.view.root)).toContain('契約完了');
  });
  it('preserves domestic year selection across switching candidates', () => {
    const ui = setup([player(0), player(1)]); ui.select(0);
    const years = ui.view.root.findAllByType('select').at(-1);
    act(() => years.props.onChange({ target: { value: '3' } }));
    ui.update({ faYears: ui.props.setFaYears.mock.calls[0][0]({}) });
    ui.click('← 候補一覧に戻る'); ui.select(1); ui.select(0);
    expect(ui.view.root.findAllByType('select').at(-1).props.value).toBe(3);
    ui.click('契約条件を確認する'); ui.click('契約を確定する');
    expect(ui.props.upd.mock.calls[0][1](ui.props.myTeam).budget).toBe(7000);
  });
  it.each(['pool', 'budget', 'deadline'])('rechecks %s while confirmation is open', change => {
    const p = player(0, { isForeign: change === 'deadline' }); const ui = setup([p]); ui.select(0);
    if (p.isForeign) { ui.click('交渉開始'); ui.click('条件を受ける'); }
    ui.click('契約条件を確認する');
    ui.update(change === 'pool' ? { faPool: [] } : change === 'budget' ? { myTeam: team({ budget: 1 }) } : { gameDay: FOREIGN_DEADLINE_DAY + 1 });
    expect(ui.button('契約を確定する').props.disabled).toBe(true);
    ui.click('契約を確定する'); expect(ui.props.upd).not.toHaveBeenCalled(); expect(ui.props.notify).toHaveBeenCalledWith(expect.any(String), 'warn');
  });
  it('reserves budget until parent updates and prevents two different contracts overspending', () => {
    const ui = setup([player(0), player(1)], { myTeam: team({ budget: 1500 }) });
    ui.select(0); ui.click('契約条件を確認する'); ui.click('契約を確定する');
    ui.select(1); expect(ui.button('契約条件を確認する').props.disabled).toBe(true);
    expect(text(ui.view.root)).toContain('予算が不足');
    ui.update({ myTeam: team({ budget: 500, players: [player(0)] }) });
    expect(text(ui.view.root.findByProps({ className: 'fa-summary' }))).toContain('予算 500万円');
    expect(ui.button('契約条件を確認する').props.disabled).toBe(true);
  });
  it('maintains agent negotiations and histories across candidate switching and rerolls only on explicit restart', () => {
    rngf.mockReturnValue(0.99);
    const ui = setup([player(0, { isForeign: true }), player(1)]); ui.select(0); ui.click('交渉開始');
    const negotiate = ui.button('現年俸で交渉').props.onClick;
    act(() => { negotiate(); negotiate(); }); expect(rngf).toHaveBeenCalledTimes(1);
    expect(text(ui.view.root)).toContain('まとまりませんでした');
    ui.select(1); ui.select(0); expect(ui.button('再交渉を始める')).toBeTruthy();
    rngf.mockReturnValue(0.1); ui.click('再交渉を始める'); ui.click('現年俸で交渉');
    ui.select(1); ui.select(0); expect(text(ui.view.root)).toContain('契約年数 2年');
    expect(text(ui.view.root)).toContain('まとまりませんでした');
    ui.click('契約条件を確認する'); ui.click('契約を確定する');
    expect(ui.props.upd.mock.calls[0][1](ui.props.myTeam).players[0]).toMatchObject({ salary: 1000, contractYears: 2 });
  });
  it.each([30, 31])('preserves requested salary and age %s contract duration at the deadline', age => {
    const ui = setup([player(0, { isForeign: true, age })], { gameDay: FOREIGN_DEADLINE_DAY });
    ui.select(0); ui.click('交渉開始'); ui.click('条件を受ける'); ui.click('契約条件を確認する'); ui.click('契約を確定する');
    expect(rngf).not.toHaveBeenCalled();
    expect(ui.props.upd.mock.calls[0][1](ui.props.myTeam).players[0]).toMatchObject({ salary: 1200, contractYears: age === 30 ? 2 : 1 });
  });
  it('filters candidate types and roles, sorts known salaries, and searches without removing market entries', () => {
    const ui = setup([player(0, { salary: undefined }), player(1, { isForeign: true, isPitcher: true }), player(2, { salary: 500 })]);
    const selects = ui.view.root.findAllByType('select');
    act(() => selects[2].props.onChange({ target: { value: 'salary' } }));
    expect(ui.view.root.findAllByProps({ className: 'fa-row' }).map(n => n.props['aria-label'])).toEqual(['候補2の条件を見る', '候補1の条件を見る', '候補0の条件を見る']);
    act(() => selects[0].props.onChange({ target: { value: 'foreign' } }));
    act(() => selects[1].props.onChange({ target: { value: 'pitcher' } }));
    expect(ui.view.root.findAllByProps({ className: 'fa-row' })).toHaveLength(1);
    act(() => ui.view.root.findByType('input').props.onChange({ target: { value: '該当なし' } }));
    expect(text(ui.view.root)).toContain('絞り込みを変更'); expect(ui.props.setFaPool).not.toHaveBeenCalled();
  });
  it.each([undefined, 0])('disables signing when salary is %s and shows saved value faithfully', salary => {
    const ui = setup([player(0, { salary })]); ui.select(0);
    expect(ui.button('契約条件を確認する').props.disabled).toBe(true);
    expect(text(ui.view.root)).toContain(salary === 0 ? '提示年俸：0万円' : '提示年俸：未記録');
  });
});
