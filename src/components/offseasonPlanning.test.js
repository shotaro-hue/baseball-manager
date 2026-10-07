import React, { useCallback, useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import OffseasonPlanningScreen from './OffseasonPlanningScreen';
import { useOffseason } from '../hooks/useOffseason';
import { planningSummary, planningResumeScreen, reconcileRenewalSession, planningPlayer } from '../engine/offseasonPlanning';
import { loadGame } from '../engine/saveload';
import { processCpuFaBids } from '../engine/contract';

vi.mock('../engine/contract', async original => ({ ...await original(), processCpuFaBids: vi.fn((teams, myId, pool) => ({ updatedTeams: teams, remainingFaPool: pool, claimed: [], news: [] })) }));
vi.mock('../engine/draft', () => ({ initDraftPool: vi.fn(() => [{ id: 'draft-1', name: 'ドラフト候補' }]) }));
vi.mock('./PlayerModal', () => ({ PlayerModal: ({ player, onClose }) => React.createElement('section', { 'aria-label': 'プロフィール' }, player.name, React.createElement('button', { onClick: onClose }, '詳細を閉じる')) }));

const p = (id = 0, extra = {}) => ({ id, name: `選手${id}`, pos: '捕手', age: 26, salary: 1000,
  contractYearsLeft: 1, daysOnActiveRoster: 0, personality: { money: 50 }, stats: {}, ...extra });
const team = (players = [p()], extra = {}) => ({ id: 0, name: '自球団', league: 'セ', wins: 70, losses: 70,
  budget: 10000, players, farm: [], lineup: players.map(p => p.id), rotation: [], ...extra });
const plan = extra => ({ version: 1, myId: 0, year: 2026, stage: 'planning', tab: 'roster', intents: [],
  demands: { 0: { demandSalary: 1500, minAcceptSalary: 1200 } }, releasedIds: [], growth: { growth: [], decline: [], breakout: [] }, ...extra });
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const views = []; let latest;
afterEach(() => { for (const v of views.splice(0)) act(() => v.unmount()); vi.clearAllMocks(); vi.unstubAllGlobals(); });
function setup(options = {}) {
  function Harness() {
    const [teams, setTeams] = useState(options.teams || [team()]);
    const [offseasonPlan, setOffseasonPlan] = useState(options.plan || plan());
    const [faPool, setFaPool] = useState(options.faPool || [p(1, { isFA: true, salary: 2000 })]);
    const [screen, setScreen] = useState('offseason_planning');
    const [faYears, setFaYears] = useState({});
    const upd = useCallback((id, fn) => setTeams(ts => ts.map(t => t.id === id ? fn(t) : t)), []);
    const gs = { teams, setTeams, myId: 0, myTeam: teams[0], year: 2026, gameDay: 143, screen, setScreen,
      offseasonPlan, setOffseasonPlan, faPool, setFaPool, faYears, setFaYears, upd,
      notify: vi.fn(), addNews: vi.fn(), setMailbox: vi.fn(), setSeasonHistory: vi.fn(),
      getSeasonHistory: () => ({ championships: [] }), handleSave: vi.fn(async () => ({ ok: true })) };
    const os = useOffseason(gs); latest = { gs, os };
    return screen === 'offseason_planning' ? React.createElement(OffseasonPlanningScreen, { gs, os, myTeam: teams[0], myId: 0, year: 2026 }) : React.createElement('p', null, screen);
  }
  let view; act(() => { view = create(React.createElement(Harness)); }); views.push(view);
  const button = label => view.root.findAllByType('button').find(n => text(n) === label);
  const click = label => act(() => button(label).props.onClick());
  const intent = (id, value) => act(() => view.root.findAllByType('select').find(n => n.props['aria-label'] === `選手${id}の編成方針`).props.onChange({ target: { value } }));
  return { view, button, click, intent };
}
it('plans releases before opening the market without mutating roster or cash; can cancel', () => {
  const ui = setup(); ui.intent(0, 'release');
  expect(latest.gs.myTeam.players).toHaveLength(1); expect(latest.gs.myTeam.budget).toBe(10000);
  expect(planningSummary(latest.gs.myTeam, latest.gs.offseasonPlan, 2026).projectedCount).toBe(0);
  ui.intent(0, 'retain'); expect(latest.gs.myTeam.players).toHaveLength(1);
  ui.click('方針を確認して補強市場を開く');
  expect(latest.gs.offseasonPlan).toMatchObject({ stage: 'open', tab: 'market' });
});
it('keeps the individual offer draft while navigating to market and back, with a persisted view', () => {
  const ui = setup({ plan: plan({ stage: 'open' }) });
  act(() => ui.view.root.findAllByType('button').find(n => n.props['aria-label'] === '選手0の契約更改').props.onClick());
  act(() => ui.view.root.findAllByType('input').find(n => n.props.type === 'number').props.onChange({ target: { value: '1320' } }));
  ui.click('補強市場'); ui.click('自球団');
  expect(latest.gs.offseasonPlan.session.entries[0].salary).toBe('1320');
  expect(latest.gs.offseasonPlan.renewalView.selectedId).toBe(0);
  expect(ui.view.root.findAllByType('input').find(n => n.props.type === 'number').props.value).toBe('1320');
});
it('signs market players once and separates upfront costs from renewal payroll', () => {
  const ui = setup({ plan: plan({ stage: 'open', tab: 'market' }) });
  act(() => ui.view.root.findAllByType('button').find(n => n.props['aria-label'] === '選手1の条件を見る').props.onClick());
  ui.click('契約条件を確認する'); const confirm = ui.button('契約を確定する').props.onClick;
  act(() => { confirm(); confirm(); });
  expect(latest.gs.myTeam.players.map(p => p.id)).toEqual([0, 1]);
  expect(latest.gs.myTeam.budget).toBe(8000);
  const summary = planningSummary(latest.gs.myTeam, latest.gs.offseasonPlan, 2026);
  expect(summary.payroll).toBe(3000); expect(summary.budget).toBe(8000); expect(summary.pending.map(p => p.id)).toEqual([0]);
});
it('confirms individual renewal terms, updates live salary once, and preserves the agreement on remount', () => {
  const ui = setup({ plan: plan({ stage: 'open' }) });
  act(() => ui.view.root.findAllByType('button').find(n => n.props['aria-label'] === '選手0の契約更改').props.onClick());
  ui.click('オファーを出す'); expect(latest.gs.myTeam.players[0].salary).toBe(1000);
  const confirm = ui.button('この条件を提示する').props.onClick;
  act(() => { confirm(); confirm(); });
  expect(latest.gs.myTeam.players[0]).toMatchObject({ salary: 1500, contractSignedYear: 2026 });
  expect(latest.gs.myTeam.budget).toBe(10000);
  expect(latest.gs.offseasonPlan.session.entries[0].status).toBe('signed');
  const saved = JSON.parse(JSON.stringify({ teams: latest.gs.teams, plan: latest.gs.offseasonPlan }));
  act(() => ui.view.unmount());
  const restored = setup(saved); restored.click('結果確認');
  expect(restored.button('編成終了の最終確認').props.disabled).toBe(false);
  expect(latest.gs.myTeam.players[0].salary).toBe(1500);
});
it('moves a negotiation FA to market immediately, and reconciles declaration-and-stay to a signed entry', () => {
  const ui = setup({ teams: [team([p(0, { daysOnActiveRoster: 840 })])], plan: plan({ stage: 'open' }) });
  act(() => expect(latest.os.handlePlanningRelease(0, 'fa')).toBe(true));
  expect(latest.gs.faPool.find(p => p.id === 0)).toMatchObject({ salary: 1500, faPreviousSalary: 1000, marketEntryReason: '国内FA宣言' });
  ui.click('補強市場');
  act(() => ui.view.root.findAllByType('button').find(n => n.props['aria-label'] === '選手0の条件を見る').props.onClick());
  ui.click('契約条件を確認する'); ui.click('契約を確定する');
  expect(latest.gs.offseasonPlan.session.entries[0]).toMatchObject({ status: 'signed', terms: { salary: 1500, years: 1 } });
  expect(latest.gs.myTeam.players[0].contractSignedYear).toBe(2026);
});
it('blocks market signing on insufficient budget', () => {
  const ui = setup({ teams: [team([p()], { budget: 1000 })], plan: plan({ stage: 'open', tab: 'market' }) });
  act(() => ui.view.root.findAllByType('button').find(n => n.props['aria-label'] === '選手1の条件を見る').props.onClick());
  expect(ui.button('契約条件を確認する').props.disabled).toBe(true);
  expect(latest.gs.myTeam.budget).toBe(1000); expect(latest.gs.faPool).toHaveLength(1);
});
it('unifies release actions, removes roster references and stale renewal offers, then allows supplementation', () => {
  const ui = setup({ plan: plan({ stage: 'open' }) }); ui.intent(0, 'release');
  ui.click('放出の影響を確認する'); const confirm = ui.button('確認して確定する').props.onClick;
  act(() => { confirm(); confirm(); });
  expect(latest.gs.myTeam.players).toHaveLength(0); expect(latest.gs.myTeam.lineup).toEqual([]);
  expect(latest.gs.faPool.filter(p => p.id === 0)).toHaveLength(1);
  expect(latest.gs.offseasonPlan.session.entries[0].status).toBe('released');
  expect(latest.os.handlePlanningRelease(0)).toBe(false);
  ui.click('補強市場'); expect(latest.gs.offseasonPlan.tab).toBe('market');
});
it('requires unresolved renewals to finish, but confirms release candidates and CPU claims exactly once', () => {
  const ui = setup({ plan: plan({ stage: 'open' }) }); ui.click('結果確認');
  expect(ui.button('編成終了の最終確認').props.disabled).toBe(true);
  ui.click('自球団'); ui.intent(0, 'release'); ui.click('結果確認'); ui.click('編成終了の最終確認');
  const confirm = ui.button('確認して確定する').props.onClick;
  act(() => { confirm(); confirm(); });
  expect(processCpuFaBids).toHaveBeenCalledOnce();
  expect(latest.gs.screen).toBe('waiver_result'); expect(latest.gs.offseasonPlan.stage).toBe('results');
  expect(latest.gs.offseasonPlan.results.unclaimed.map(p => p.id)).toContain(0);
  expect(latest.gs.offseasonPlan.draftPool[0].id).toBe('draft-1');
  expect(latest.os.handlePlanningFinish()).toBe(false);
});
it('restores offers, round count, logs and market filters from serialized data without rerunning CPU renewal', async () => {
  const saved = plan({ stage: 'open', tab: 'market', marketView: { type: 'domestic', role: 'batter', search: '選手1', sort: 'salary' },
    session: { baseline: 1000, others: [], entries: [{ player: p(), demand: { demandSalary: 1500 }, status: 'pending', salary: '1300', years: 2, round: 1, retries: 0, logs: ['提示済み'] }] } });
  const state = { teams: [team()], year: 2026, myId: 0, gameDay: 143, offseasonPlan: saved, faPool: [p(1, { isFA: true })], saveDataVersion: 2 };
  vi.stubGlobal('localStorage', { getItem: key => key === 'baseball_manager_v1' ? JSON.stringify(state) : null });
  const loaded = await loadGame(); expect(planningResumeScreen(loaded.offseasonPlan, loaded.year, loaded.myId)).toBe('offseason_planning');
  const ui = setup({ teams: loaded.teams, plan: loaded.offseasonPlan, faPool: loaded.faPool });
  expect(latest.gs.offseasonPlan.session.entries[0]).toMatchObject({ salary: '1300', years: 2, round: 1, logs: ['提示済み'] });
  expect(ui.view.root.findAllByType('input').find(n => n.props.type === 'search').props.value).toBe('選手1');
  expect(processCpuFaBids).not.toHaveBeenCalled();
});
it('rejects unknown phase versions and stale seasons, and compacts only snapshots', () => {
  expect(planningResumeScreen(plan({ stage: 'results' }), 2026, 0)).toBe('waiver_result');
  expect(planningResumeScreen(plan(), 2027, 0)).toBe('hub'); expect(planningResumeScreen(plan({ version: 99 }), 2026, 0)).toBe('hub');
  const original = p(0, { stats: { PA: 0, sprayPoints: [{ x: 1 }], battedBallEvents: [{ ev: 0 }] } });
  expect(planningPlayer(original).stats).toEqual({ PA: 0 }); expect(original.stats.sprayPoints).toHaveLength(1);
  const s = { entries: [{ player: p(), status: 'fa' }] };
  expect(reconcileRenewalSession(s, team([p(0, { contractSignedYear: 2026, salary: 1600, contractYears: 2 })]), 2026).entries[0]).toMatchObject({ status: 'signed', terms: { salary: 1600, years: 2 } });
});
