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
      getSeasonHistory: () => ({ championships: [] }), handleSave: options.handleSave || vi.fn(async () => ({ ok: true })), ...(options.saveState || {}) };
    const os = useOffseason(gs); latest = { gs, os };
    return screen === 'offseason_planning' ? React.createElement(OffseasonPlanningScreen, { gs, os, myTeam: teams[0], myId: 0, year: 2026 }) : React.createElement('p', null, screen);
  }
  let view; act(() => { view = create(React.createElement(Harness)); }); views.push(view);
  const button = label => view.root.findAllByType('button').find(n => text(n) === label);
  const click = label => act(() => button(label).props.onClick());
  const intent = (id, value) => {
    act(() => view.root.findByProps({ 'aria-label': `選手${id}の契約更改` }).props.onClick());
    click(value === 'release' ? '放出候補にする' : '放出候補を取り消して交渉する');
    click('← 選手一覧に戻る');
  };
  return { view, button, click, intent };
}
it('plans releases before opening the market without mutating roster or cash; can cancel', () => {
  const ui = setup(); ui.intent(0, 'release');
  expect(latest.gs.myTeam.players).toHaveLength(1); expect(latest.gs.myTeam.budget).toBe(10000);
  expect(planningSummary(latest.gs.myTeam, latest.gs.offseasonPlan, 2026).projectedCount).toBe(0);
  ui.intent(0, 'retain'); expect(latest.gs.myTeam.players).toHaveLength(1);
  ui.click('交渉・補強を始める');
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

for (const [saveState,label] of [
 [{},'保存状態未確認'],[{saveDirty:true},'保存待ち'],[{saveQueueState:{isSaving:true},saveResult:{ok:true}},'保存中'],
 [{saveQueueState:{hasQueuedSave:true}},'保存中'],[{saveResult:{ok:false},saveDirty:true},'保存失敗'],
 [{saveResult:{ok:true}},'保存済み'],[{saveResult:{ok:true,archive:{ok:false}}},'保存済み・一部履歴は要確認'],
 [{saveResult:{ok:true,warnings:['warning']}},'保存済み・保存情報は要確認'],
]) it(`reports the actual planning save status ${label}`,()=>{
 const ui=setup({saveState});expect(text(ui.view.root.findByProps({className:'planning-save'}))).toContain(label);
 expect(ui.button('編成内容を保存する').props.disabled).toBe(Boolean(saveState.saveQueueState?.isSaving||saveState.saveQueueState?.hasQueuedSave));
});
it('filters release drafts without changing players, budget or live contracts',()=>{
 const ui=setup({teams:[team([p(0),p(1),p(2,{contractYearsLeft:3})])]});ui.intent(0,'release');
 ui.click('未合意');const list=()=>ui.view.root.findByProps({className:'renewal-list'});
 const rows=()=>list().findAllByProps({className:'renewal-list-item'}).map(text).join('');
 expect(rows()).toContain('選手1');expect(rows()).not.toContain('選手0');expect(rows()).not.toContain('選手2');
 ui.click('放出候補');expect(rows()).toContain('選手0');expect(rows()).not.toContain('選手1');ui.click('全員');expect(rows()).toContain('選手2');
 expect(latest.gs.myTeam.players.map(p=>p.id)).toEqual([0,1,2]);expect(latest.gs.myTeam.budget).toBe(10000);expect(latest.gs.myTeam.players[0].salary).toBe(1000);
});
it('describes payroll using agreed terms rather than unaccepted offer drafts',()=>{
 const ui=setup({plan:plan({session:{baseline:1000,others:[],entries:[{player:p(),status:'pending',salary:'9000',years:1,logs:[]}]}})});
 const all=text(ui.view.toJSON());expect(all).not.toContain('未合意は提示額');expect(all).toContain('成立条件がなければ前年年俸');
 expect(planningSummary(latest.gs.myTeam,latest.gs.offseasonPlan,2026).projectedPayroll).toBe(1000);
});

it('uses one roster list before the market opens, including continuing contracts without adding them to negotiation state', () => {
  const ui = setup({ teams: [team([p(0), p(2, { contractYearsLeft: 3 })], { farm: [p(3)] })] });
  const list = ui.view.root.findByProps({ className: 'renewal-list' });
  expect(text(list)).toContain('選手0'); expect(text(list)).toContain('選手2'); expect(text(list)).toContain('選手3');
  expect(text(list)).toContain('継続契約');
  expect(ui.view.root.findAllByType('select').filter(n => n.props['aria-label']?.endsWith('の編成方針'))).toHaveLength(0);
  expect(ui.view.root.findAllByProps({ className: 'planning-compact' })).toHaveLength(0);
  expect(latest.gs.offseasonPlan.session.entries.map(e => e.player.id)).toEqual([0, 3]);
  expect(ui.button('オファーを出す')).toBeUndefined();
});
it('marks and cancels a release candidate from the selected player while preserving the offer draft and actual roster', () => {
  const ui = setup({ plan: plan({ stage: 'open' }) });
  act(() => ui.view.root.findByProps({ 'aria-label': '選手0の契約更改' }).props.onClick());
  act(() => ui.view.root.findAllByType('input').find(n => n.props.type === 'number').props.onChange({ target: { value: '1320' } }));
  ui.click('放出候補にする');
  expect(planningSummary(latest.gs.myTeam, latest.gs.offseasonPlan, 2026)).toMatchObject({ projectedCount: 0, projectedPayroll: 0 });
  expect(latest.gs.myTeam.players[0]).toMatchObject({ id: 0, salary: 1000, contractYearsLeft: 1 });
  expect(latest.gs.myTeam.budget).toBe(10000);
  expect(ui.button('オファーを出す')).toBeUndefined();
  ui.click('放出候補を取り消して交渉する');
  expect(latest.gs.offseasonPlan.session.entries[0]).toMatchObject({ salary: '1320', status: 'pending', round: 0 });
  expect(ui.button('オファーを出す')).toBeDefined();
  expect(planningSummary(latest.gs.myTeam, latest.gs.offseasonPlan, 2026).projectedCount).toBe(1);
});
it('keeps saved candidates out of pending and bulk offers, and keeps existing retain intentions negotiable', () => {
  const ui = setup({ teams: [team([p(0), p(2)])], plan: plan({ stage: 'open', intents: [{ id: 0, value: 'release' }, { id: 2, value: 'retain' }] }) });
  ui.click('未合意');
  const list = () => ui.view.root.findByProps({ className: 'renewal-list' });
  expect(list().findAllByProps({ className: 'renewal-list-item' }).map(text).join('')).not.toContain('選手0');
  expect(list().findAllByProps({ 'aria-label': '選手2の契約更改' })).toHaveLength(1);
  ui.click('まとめて提示を開く'); ui.click('提示可能な全員を選択'); ui.click('選択した選手の提示内容を確認');
  const dialog = text(ui.view.root.findByProps({ role: 'dialog' }));
  expect(dialog).toContain('対象 1人'); expect(dialog).toContain('選手2'); expect(dialog).not.toContain('選手0');
  ui.click('戻る'); ui.click('放出候補');
  expect(list().findAllByProps({ 'aria-label': '選手0の契約更改' })).toHaveLength(1);
  expect(list().findAllByProps({ 'aria-label': '選手2の契約更改' })).toHaveLength(0);
});
it('opens negotiations directly from a player without an extra classification step or executing a contract', () => {
  const ui = setup();
  act(() => ui.view.root.findByProps({ 'aria-label': '選手0の契約更改' }).props.onClick());
  ui.click('交渉を始める');
  expect(latest.gs.offseasonPlan).toMatchObject({ stage: 'open', tab: 'roster', renewalView: { selectedId: 0 } });
  expect(latest.gs.myTeam.players[0]).toMatchObject({ salary: 1000, contractYearsLeft: 1 });
  expect(processCpuFaBids).not.toHaveBeenCalled(); expect(ui.button('オファーを出す')).toBeDefined();
});
it('does not call a removed farm player active when displaying the released ledger', () => {
  const farm = p(0);
  const ui = setup({ teams: [team([], { farm: [farm] })], plan: plan({ stage: 'open' }) });
  act(() => ui.view.root.findByProps({ 'aria-label': '選手0の契約更改' }).props.onClick());
  ui.click('戦力外を検討する'); ui.click('戦力外を確定する');
  const heading = text(ui.view.root.findByProps({ className: 'renewal-player-heading' }));
  expect(heading).toContain('所属なし'); expect(heading).not.toContain('歳 · 一軍');
  expect(latest.gs.myTeam.farm).toHaveLength(0);
});
it('shows an external signing as a current contract with the transferred season record, without making up a prior salary', () => {
  const ui = setup({ plan: plan({ stage: 'open', tab: 'market' }), faPool: [p(1, { isFA: true, salary: 2000, faEnteredYear: 2026, faOriginTeamId: 1, stats: { PA: 400, AB: 350, H: 100, HR: 20 } })] });
  act(() => ui.view.root.findByProps({ 'aria-label': '選手1の条件を見る' }).props.onClick());
  ui.click('契約条件を確認する'); ui.click('契約を確定する'); ui.click('自球団');
  act(() => ui.view.root.findByProps({ 'aria-label': '選手1の契約更改' }).props.onClick());
  const conditions = text(ui.view.root.findByProps({ className: 'renewal-conditions' }));
  expect(conditions).toContain('契約年俸2,000万円'); expect(conditions).not.toContain('前年年俸'); expect(conditions).not.toContain('要求年俸');
  expect(text(ui.view.root.findByProps({ className: 'renewal-player-summary' }))).toContain('本塁打 20');
  expect(ui.view.root.findAllByProps({ className: 'renewal-response' })).toHaveLength(0);
  expect(latest.gs.myTeam.players.find(p => p.id === 1).stats.HR).toBe(0);
  expect(latest.gs.offseasonPlan.session.entries.map(e => e.player.id)).toEqual([0]);
});
it('uses the completed live season for an in-season extension, rather than a retained transfer record from last year', () => {
  const signed = p(2, { contractSignedYear: 2026, contractYears: 3, contractYearsLeft: 3, faArchivedYear: 2025, faOriginTeamId: 1, marketLastStats: { HR: 20 }, stats: { HR: 30 } });
  const ui = setup({ plan: plan({ stage: 'open' }), teams: [team([p(), signed])] });
  act(() => ui.view.root.findByProps({ 'aria-label': '選手2の契約更改' }).props.onClick());
  expect(text(ui.view.root.findByProps({ className: 'renewal-player-summary' }))).toContain('本塁打 30');
  expect(text(ui.view.root.findByProps({ className: 'renewal-player-summary' }))).not.toContain('移籍前');
});
