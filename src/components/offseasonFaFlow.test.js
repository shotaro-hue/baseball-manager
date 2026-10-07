import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import OffseasonFaPhaseScreen from './OffseasonFaPhaseScreen';
import HubFaTab from './hub/HubFaTab';
import { ContractRenewalPhaseScreen } from './ContractRenewalPhaseScreen';
import { addMarketSigning, marketMetrics } from './hub/faMarket';
import { prepareOffseasonFreeAgent } from '../engine/offseasonMarket';

const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '捕手', age: 26, salary: 1000, contractYearsLeft: 1, stats: {}, ...extra });
const team = extra => ({ id: 0, name: '自球団', budget: 10000, players: [], farm: [], ...extra });
const views = [];
afterEach(() => { for (const view of views.splice(0)) act(() => view.unmount()); });
function setup(extra = {}) {
  const gs = { faPool: [player(1, { isFA: true }), player(2, { isFA: true, isForeign: true })], faYears: {}, gameDay: 143, setFaYears: vi.fn(), upd: vi.fn(), setFaPool: vi.fn(), notify: vi.fn() };
  const os = { handleFaPhaseNext: vi.fn() }; const props = { gs, os, myTeam: team({ players: [player(0)] }), myId: 0, year: 2026, ...extra };
  let view; act(() => { view = create(React.createElement(OffseasonFaPhaseScreen, props)); }); views.push(view);
  const button = label => view.root.findAllByType('button').find(n => text(n) === label);
  const click = label => act(() => button(label).props.onClick());
  return { props, view, button, click };
}
it('opens domestic candidates despite season day 143, and confirms skipping before renewal', () => {
  const ui = setup(); const market = ui.view.root.findByType(HubFaTab);
  expect(market.props.faPool.map(p => p.id)).toEqual([1]); expect(market.props.marketMode).toBe('offseason');
  expect(text(ui.view.root)).not.toContain('期限終了');
  ui.click('補強を終了して契約更改へ'); expect(ui.props.os.handleFaPhaseNext).not.toHaveBeenCalled();
  expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('補強せず');
  ui.click('市場に戻る'); expect(ui.props.os.handleFaPhaseNext).not.toHaveBeenCalled();
  ui.click('補強を終了して契約更改へ'); const next = ui.button('契約更改に進む').props.onClick;
  act(() => { next(); next(); }); expect(ui.props.os.handleFaPhaseNext).toHaveBeenCalledTimes(1);
});
it('shows own FA declaration reasons and allows a stay through the existing market contract', () => {
  const declared = player(0, { isFA: true, marketEntryReason: '国内FA宣言', faPreviousSalary: 900,
    faOriginTeamId: 0, faEnteredYear: 2026, faDeclarationDecision: { year: 2026, declared: true, reasons: ['出場機会を求める'] } });
  const ui = setup({ myTeam: team(), gs: { faPool: [declared], faYears: {}, gameDay: 143,
    setFaYears: vi.fn(), upd: vi.fn(), setFaPool: vi.fn(), notify: vi.fn() } });
  const row = ui.view.root.findAllByType('button').find(n => n.props['aria-label'] === '選手0の条件を見る');
  act(() => row.props.onClick());
  expect(text(ui.view.root)).toContain('宣言残留');
  expect(text(ui.view.root)).toContain('出場機会を求める');
  ui.click('契約条件を確認する'); ui.click('契約を確定する');
  expect(ui.props.gs.upd).toHaveBeenCalledOnce();
  const updater = ui.props.gs.upd.mock.calls[0][1];
  expect(updater(team()).players[0]).toMatchObject({ id: 0, isFA: false, contractSignedYear: 2026 });
});
it('compares a market candidate against own player ID 0 in the offseason screen', () => {
  const ui = setup(); ui.click('比較に追加'); ui.click('選手0を比較に追加'); ui.click('2人を比較');
  const dialog = text(ui.view.root.findByProps({ role: 'dialog' })); expect(dialog).toContain('選手0'); expect(dialog).toContain('選手1');
});
it('shows acquired players and terms in the phase completion review', () => {
  const ui = setup();
  act(() => ui.view.update(React.createElement(OffseasonFaPhaseScreen, { ...ui.props, myTeam: team({ players: [player(0), player(1, { isFA: false, contractYears: 3 })] }), gs: { ...ui.props.gs, faPool: [] } })));
  ui.click('補強を終了して契約更改へ');
  expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('選手1：年俸 1,000万円・3年');
  expect(ui.props.os.handleFaPhaseNext).not.toHaveBeenCalled();
});
it('excludes newly signed one-year players from renewal but includes their salaries in payroll', () => {
  const players = [player(0), player(1), player(2, { contractYearsLeft: 3 })];
  const props = { teams: [team({ players })], myId: 0, year: 2026, renewalPlayerIds: ['0'], demands: { 0: { demandSalary: 1000 } }, onSign: vi.fn(), onRelease: vi.fn(), onNext: vi.fn() };
  let view; act(() => { view = create(React.createElement(ContractRenewalPhaseScreen, props)); }); views.push(view);
  const buttons = view.root.findAllByType('button').map(n => n.props['aria-label']);
  expect(buttons).toContain('選手0の契約更改'); expect(buttons).not.toContain('選手1の契約更改');
  expect(text(view.root)).toContain('年俸総額の見込み 3,000万円');
});
it('archives production under the former team, resets new club stats, and retains actual market snapshots', () => {
  const p = player(0, { isFA: true, faEnteredYear: 2026, faOriginTeamId: 1, faOriginTeamName: '旧球団', stats: { PA: 500, AB: 450, H: 150, HR: 0 } });
  const signed = addMarketSigning(team(), p, 1000, 1, 2026, 'offseason').players[0];
  expect(signed.stats.PA).toBe(0); expect(signed.recentCareerLog[0]).toMatchObject({ year: 2026, teamId: 1, teamName: '旧球団', stats: { PA: 500, HR: 0 } });
  const unsigned = prepareOffseasonFreeAgent(p, 2026);
  expect(Object.fromEntries(marketMetrics(unsigned))).toMatchObject({ 打席: 500, 本塁打: 0 });
  const sameYear = prepareOffseasonFreeAgent(unsigned, 2026); expect(sameYear.careerLogSummary.totalPlateAppearances).toBe(500);
  const again = prepareOffseasonFreeAgent(unsigned, 2027); expect(again.recentCareerLog).toHaveLength(1);
  const unknown = prepareOffseasonFreeAgent(player(3, { stats: { HR: 7 } }), 2026);
  expect(unknown.careerLog).toBeUndefined(); expect(unknown.marketLastStats.HR).toBe(7);
});
