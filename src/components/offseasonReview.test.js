import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { RetirePhaseScreen, WaiverPhaseScreen, WaiverResultScreen, GrowthSummaryScreen } from './OffseasonReviewScreens';
import { calcRetireWill } from '../engine/playerCore';
import { calcRetireWill as legacyRetireWill } from '../engine/player';
import { releaseWaiverPlayers } from '../engine/offseasonReview';

vi.mock('./PlayerModal', () => ({ PlayerModal: ({ player, onClose }) => React.createElement('section', { 'aria-label': 'プロフィール' }, player.name, React.createElement('button', { onClick: onClose }, 'プロフィールを閉じる')) }));
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const player = (id, extra = {}) => ({ id, name: `選手${id}`, pos: '捕手', age: 26, salary: 1000, contractYearsLeft: 1, stats: {}, ...extra });
const team = players => ({ id: 0, name: '自球団', players, farm: [] });
const views = [];
afterEach(() => { for (const view of views.splice(0)) act(() => view.unmount()); vi.restoreAllMocks(); });
function setup(Component, extra = {}) {
  let props = { teams: [team([player(0)])], myId: 0, year: 2026, onNext: vi.fn(), ...extra }; let view;
  act(() => { view = create(React.createElement(Component, props)); }); views.push(view);
  const button = label => view.root.findAllByType('button').find(n => text(n) === label);
  const click = label => act(() => button(label).props.onClick());
  const choose = id => act(() => view.root.findAllByType('input').find(n => n.props['aria-label'] === `選手${id}を放出対象に選ぶ`).props.onChange({ target: { checked: true } }));
  const update = extra => act(() => { props = { ...props, ...extra }; view.update(React.createElement(Component, props)); });
  return { view, get props() { return props; }, button, click, choose, update };
}
it('keeps ID 0 release as a draft until confirmation, supports cancellation and submits once', async () => {
  const ui = setup(WaiverPhaseScreen); ui.choose(0); ui.click('放出内容を確認する'); expect(ui.props.onNext).not.toHaveBeenCalled();
  expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('登録選手 1 → 0人');
  ui.click('戻って見直す'); expect(ui.props.onNext).not.toHaveBeenCalled(); ui.click('放出内容を確認する');
  const next = ui.button('放出を確定する').props.onClick; await act(async () => { next(); next(); });
  expect(ui.props.onNext).toHaveBeenCalledTimes(1); expect(ui.props.onNext).toHaveBeenCalledWith([0]);
});
it('separates this offseason contracts, preserves their explicit release entrance, and shows longer contracts', () => {
  const ui = setup(WaiverPhaseScreen, { teams: [team([player(0), player(1, { contractSignedYear: 2026, contractYears: 1 }), player(2, { contractYearsLeft: 3 })])] });
  const group = ui.view.root.findAllByType('details').find(n => text(n.findAllByType('summary')[0]).includes('今オフ契約済み・その他'));
  expect(text(group)).toContain('選手1'); expect(text(group)).toContain('選手2'); expect(text(group)).toContain('今オフ契約済み · 1年契約');
  expect(ui.view.root.findAllByType('input')).toHaveLength(2); ui.choose(1); ui.click('放出内容を確認する');
  expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('選手1'); expect(ui.props.onNext).not.toHaveBeenCalled();
});
it('revalidates release selections changed while confirmation is open', () => {
  const ui = setup(WaiverPhaseScreen); ui.choose(0); ui.click('放出内容を確認する'); ui.update({ teams: [team([])] });
  expect(ui.button('放出せずに次へ').props.disabled).toBe(true); ui.click('放出せずに次へ'); expect(ui.props.onNext).not.toHaveBeenCalled();
  ui.click('戻って見直す'); ui.click('放出内容を確認する'); expect(ui.button('放出せずに次へ').props.disabled).toBe(false);
});
it('shows missing salary instead of projecting a fabricated zero and preserves saved zero metrics', () => {
  const ui = setup(WaiverPhaseScreen, { teams: [team([player(0, { salary: undefined, stats: { HR: 0 } })])] }); ui.choose(0);
  expect(text(ui.view.root)).toContain('放出対象の年俸 未記録'); expect(text(ui.view.root)).toContain('本塁打 0'); expect(text(ui.view.root)).toContain('打点 未記録');
});
it('allows no release and proceeds only after review', async () => {
  const ui = setup(WaiverPhaseScreen); ui.click('放出内容を確認する'); expect(ui.props.onNext).not.toHaveBeenCalled();
  await act(async () => ui.button('放出せずに次へ').props.onClick()); expect(ui.props.onNext).toHaveBeenCalledWith([]);
});
it('retirement decisions require final confirmation and can revise accepting before finalizing', async () => {
  const ui = setup(RetirePhaseScreen, { teams: [team([player(0, { age: 42 })])] });
  expect(ui.button('引退結果を確認して次へ').props.disabled).toBe(true);
  ui.click('引退を受け入れる'); ui.click('引退の判断を見直す'); expect(ui.button('引退結果を確認して次へ').props.disabled).toBe(true);
  ui.click('引退を受け入れる'); ui.click('引退結果を確認して次へ'); expect(ui.props.onNext).not.toHaveBeenCalled();
  expect(text(ui.view.root.findByProps({ role: 'dialog' }))).toContain('選手0');
  const next = ui.button('確定して国内FA補強へ').props.onClick; await act(async () => { next(); next(); });
  expect(ui.props.onNext).toHaveBeenCalledTimes(1); expect(ui.props.onNext).toHaveBeenCalledWith({ 0: 'accepted' });
});
it('retention rolls once, keeps its outcome, and treats recorded retirement style 0 as zero', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(.1);
  const p = player(0, { age: 42, retireStyle: 0 }); const ui = setup(RetirePhaseScreen, { teams: [team([p])] });
  const retain = ui.button('引き留める').props.onClick; act(() => { retain(); retain(); });
  expect(random).toHaveBeenCalledTimes(1); expect(text(ui.view.root)).toContain('引き留め成功');
  expect(calcRetireWill(p)).toBe(legacyRetireWill(p)); expect(calcRetireWill(p)).toBeLessThan(calcRetireWill({ ...p, retireStyle: undefined }));
});
it('can retry the final retirement step after persistence failure without rerolling', async () => {
  const onNext = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
  const ui = setup(RetirePhaseScreen, { teams: [team([])], onNext }); ui.click('引退結果を確認して次へ');
  await act(async () => ui.button('確定して国内FA補強へ').props.onClick()); expect(text(ui.view.root)).toContain('再試行');
  await act(async () => ui.button('確定して国内FA補強へ').props.onClick()); expect(onNext).toHaveBeenCalledTimes(2);
});
it('preserves profile entrance and selections after closing the player detail', async () => {
  const ui = setup(WaiverPhaseScreen); ui.choose(0);
  await act(async () => ui.view.root.findByProps({ 'aria-label': '選手0の詳細を開く' }).props.onClick());
  expect(text(ui.view.root.findByProps({ 'aria-label': 'プロフィール' }))).toContain('選手0'); ui.click('プロフィールを閉じる');
  expect(ui.view.root.findByType('input').props.checked).toBe(true);
});
it('result overview distinguishes recorded no releases from missing results and keeps destinations', () => {
  const ui = setup(WaiverResultScreen, { results: { claimed: [{ player: player(0), teamName: '新球団' }], unclaimed: [player(1)] } });
  expect(text(ui.view.root)).toContain('新球団へ入団'); expect(text(ui.view.root)).toContain('市場に残る 1人');
  ui.update({ results: { claimed: [], unclaimed: [] } }); expect(text(ui.view.root)).toContain('放出対象の選手はいません');
  ui.update({ results: null }); expect(text(ui.view.root)).toContain('未記録'); expect(text(ui.view.root)).not.toContain('放出対象の選手はいません');
});
it('growth overview shows saved categories and reveals actual before/current values without inventing missing abilities', () => {
  const p = player(0, { batting: { power: 60, contact: 0 } }); const current = { ...p, batting: { power: 62, contact: 0, speed: 50 } };
  const ui = setup(GrowthSummaryScreen, { teams: [team([current])], summary: { breakout: [], growth: [{ p, diff: 2 }], decline: [] } });
  expect(text(ui.view.root)).toContain('成長 1人'); expect(text(ui.view.root)).toContain('+2pt');
  const rows = ui.view.root.findAllByType('tr'); expect(text(rows.find(n => text(n).startsWith('長打')))).toContain('6062+2');
  expect(text(rows.find(n => text(n).startsWith('ミート')))).toContain('000');
  expect(text(rows.find(n => text(n).startsWith('走力')))).toContain('未記録50未記録');
});
it('marks recorded absence of major changes, missing growth data, and large declines separately', () => {
  const ui = setup(GrowthSummaryScreen, { summary: { breakout: [], growth: [], decline: [] } }); expect(text(ui.view.root)).toContain('大きな変化はありません');
  ui.update({ summary: null }); expect(text(ui.view.root)).toContain('成長結果が未記録'); expect(text(ui.view.root)).not.toContain('大きな変化はありません');
  ui.update({ summary: { breakout: [], growth: [], decline: [{ p: player(0, { age: 33 }), diff: -5 }] } }); expect(text(ui.view.root)).toContain('起用の見直し候補'); expect(text(ui.view.root)).toContain('-5pt');
});
it('release helper prunes roster references and preserves budget, farm and history', () => {
  const t = { ...team([player(0), player(1)]), budget: 10000, popularity: 50, farm: [player(2)], lineup: [0, 1], rotation: [0], history: [] };
  const released = releaseWaiverPlayers(t, [0], 2026, -5, 500);
  expect(released.players.map(p => p.id)).toEqual([1]); expect(released.lineup).toEqual([1]); expect(released.rotation).toEqual([]);
  expect(released.budget).toBe(10000); expect(released.farm).toHaveLength(1); expect(released.popularity).toBe(45); expect(released.history[0]).toMatchObject({ id: 0, exitYear: 2026, exitReason: '戦力外' });
});
