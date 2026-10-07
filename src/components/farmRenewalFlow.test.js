import React, { useState } from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import OffseasonPlanningScreen from './OffseasonPlanningScreen';
import { ContractRenewalPhaseScreen } from './ContractRenewalPhaseScreen';
import { useOffseason } from '../hooks/useOffseason';
import { cpuRenewContracts, calcPlayerDemand, evaluateRenewalOffer } from '../engine/contract';
import { resolveOffseasonFaDeclarations } from '../engine/faDeclaration';
import { planningSummary } from '../engine/offseasonPlanning';
import { remainingContractAfterSeason } from '../engine/renewalRules';
import { addMarketSigning } from './hub/faMarket';
import { emptyStats } from '../engine/playerCore';
import { prepareOffseasonFreeAgent } from '../engine/offseasonMarket';
vi.mock('../engine/player', () => ({ generateForeignFaPool: () => [], rollRetire: () => false, developPlayers: players => ({ players, summary: {} }) }));
vi.mock('../engine/saveload', () => ({ appendCareerEntriesToIndexedDb: async () => ({ ok: true }) }));
vi.mock('../engine/scheduleGen', () => ({ generateSeasonSchedule: () => ({}), calcAllStarTriggerDay: () => 50 }));
vi.mock('./PlayerModal', () => ({ PlayerModal: () => null }));
const p = (id, extra = {}) => ({ id, name: `選手${id}`, age: 24, pos: '捕手', salary: 1000, contractYearsLeft: 1, condition: 80, morale: 70,
  serviceYears: 2, daysOnActiveRoster: 0, personality: {}, batting: { contact: 60, power: 60, eye: 60, speed: 60 },
  stats: emptyStats(), playoffStats: emptyStats(), ...extra });
const team = (farm, id = 0, players = []) => ({ id, name: `球団${id}`, league: 'セ', players, farm, budget: 100000, wins: 70, losses: 73, rf: 400, ra: 450, history: [], lineup: players.map(p => p.id), rotation: [] });
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
const views = []; let current;
afterEach(() => { views.splice(0).forEach(v => act(() => v.unmount())); vi.restoreAllMocks(); });
function setup(farm, options = {}) {
  function Harness() {
    const [teams, setTeams] = useState([team(farm, 0, options.players || [])]);
    const [screen, setScreen] = useState(options.screen || 'offseason_planning');
    const [offseasonPlan, setOffseasonPlan] = useState({ version: 1, year: 2026, myId: 0, stage: 'open', tab: 'roster', demands: Object.fromEntries(farm.map(p => [p.id, calcPlayerDemand(p)])), releasedIds: [], ...options.plan });
    const [year, setYear] = useState(options.year || 2026), [faPool, setFaPool] = useState([]);
    const [history, setSeasonHistory] = useState({ awards: [], championships: [], hallOfFame: [], records: {}, standingsHistory: [] });
    const gs = { teams, setTeams, screen, setScreen, offseasonPlan, setOffseasonPlan, year, setYear, myId: 0, myTeam: teams[0], faPool, setFaPool,
      upd: (id, fn) => setTeams(ts => ts.map(t => t.id === id ? fn(t) : t)), setSeasonHistory, getSeasonHistory: () => history, getGameResultsMap: () => ({}),
      ...Object.fromEntries(['setGameDay','setFaYears','setAllStarDone','setAllStarResult','setSchedule','setGameResultsMap','setAllTeamResultsMap','setAllStarTriggerDay','setMailbox','notify','addNews','addToHistory'].map(k => [k, vi.fn()])),
      handleSave: vi.fn(async () => ({ ok: true })) };
    const os = useOffseason(gs); current = { gs, os };
    return options.render === false ? null : React.createElement(OffseasonPlanningScreen, { gs, os, myTeam: gs.myTeam, myId: 0, year });
  }
  let view; act(() => { view = create(React.createElement(Harness)); }); views.push(view);
  return { view, get current() { return current; }, click: label => act(() => view.root.findAllByType('button').find(b => text(b) === label).props.onClick()) };
}
it('renews numeric ID zero in the farm through individual confirmation without promotion or duplicate signing', () => {
  const h = setup([p(0)]);
  act(() => h.view.root.findAllByType('button').find(b => b.props['aria-label'] === '選手0の契約更改').props.onClick());
  h.click('オファーを出す'); const confirm = h.view.root.findAllByType('button').find(b => text(b) === 'この条件を提示する').props.onClick;
  act(() => { confirm(); confirm(); });
  expect(h.current.gs.myTeam.players).toHaveLength(0); expect(h.current.gs.myTeam.farm[0]).toMatchObject({ contractSignedYear: 2026 });
  expect(planningSummary(h.current.gs.myTeam, h.current.gs.offseasonPlan, 2026).pending).toHaveLength(0);
});
it('shows farm release impact as total ownership and releases once with history and a market entry', () => {
  const h = setup([p(0)]);
  act(() => h.view.root.findAllByType('select').find(n => n.props['aria-label'] === '選手0の編成方針').props.onChange({ target: { value: 'release' } }));
  h.click('放出の影響を確認する'); expect(text(h.view.root.findByProps({ role: 'dialog' }))).toContain('所属人数 1 → 0人');
  const release = h.current.os.handlePlanningRelease;
  act(() => { expect(release(0)).toBe(true); expect(release(0)).toBe(false); });
  expect(h.current.gs.myTeam.farm).toHaveLength(0); expect(h.current.gs.myTeam.history).toHaveLength(1); expect(h.current.gs.faPool).toHaveLength(1);
});
it('cannot finish with a farm player pending, but can finish after a confirmed farm release', () => {
  const h = setup([p(0)], { render: false });
  act(() => expect(h.current.os.handlePlanningFinish()).toBe(false));
  act(() => expect(h.current.os.handlePlanningRelease(0)).toBe(true));
  act(() => expect(h.current.os.handlePlanningFinish()).toBe(true));
  expect(h.current.gs.screen).toBe('waiver_result');
});
it('adds omitted farm entries to an old saved session while keeping signed terms and logs', () => {
  const active = p(1, { contractSignedYear: 2026, contractYears: 2, salary: 1300 }); const farm = p(0);
  let view, state;
  act(() => { view = create(React.createElement(ContractRenewalPhaseScreen, { teams: [team([farm], 0, [active])], myId: 0, year: 2026, embedded: true,
    demands: {}, renewalPlayerIds: ['1'], savedSession: { baseline: 2000, others: [1000], entries: [{ player: p(1), status: 'signed', terms: { salary: 1300, years: 2 }, logs: ['既存合意'] }] },
    onSessionChange: value => { state = value; }, onSign: vi.fn(), onNext: vi.fn() })); }); views.push(view);
  expect(state.entries).toHaveLength(2); expect(state.entries[0]).toMatchObject({ terms: { salary: 1300, years: 2 }, logs: ['既存合意'] });
  expect(state.entries[1]).toMatchObject({ player: { id: 0 }, status: 'pending' }); expect(state.others).toEqual([]);
});
it('applies CPU farm renewals in the same location and releases unaffordable contracts from both lists', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.5);
  const own = team([], 0), cpu = team([p(2), p(3, { 育成: true, salary: 300, ikuseiYears: 2 })], 1);
  const success = cpuRenewContracts([own, cpu], 0, [own, cpu], { year: 2026 });
  expect(success.updatedTeams[1].players).toHaveLength(0); expect(success.updatedTeams[1].farm).toHaveLength(2);
  expect(success.updatedTeams[1].farm.every(p => p.contractSignedYear === 2026)).toBe(true);
  expect(success.updatedTeams[1].farm[1].contractYearsLeft).toBe(1);
  const failed = cpuRenewContracts([own, { ...cpu, budget: 0 }], 0, [own, cpu], { year: 2026 });
  expect(failed.updatedTeams[1].farm).toHaveLength(0); expect(failed.newFaPlayers.map(p => p.id)).toEqual([2, 3]);
});
it('permits an eligible demoted player to declare FA but never an ikusei player', () => {
  const decision = { year: 2026, declared: true, reasons: ['検証用の確定判断'] };
  const farm = [p(0, { daysOnActiveRoster: 840, faDeclarationDecision: decision }), p(1, { 育成: true, daysOnActiveRoster: 840, faDeclarationDecision: decision })];
  const result = resolveOffseasonFaDeclarations([team(farm)], 2026);
  expect(result.newFaPlayers.map(p => p.id)).toEqual([0]); expect(result.updatedTeams[0].farm.map(p => p.id)).toEqual([1]);
});
it('updates active and farm contracts identically once, preserving newly signed multi-year terms and FA days', async () => {
  const h = setup([p(0, { contractYearsLeft: 3, contractSignedYear: 2026 }), p(1, { contractYearsLeft: 3, daysOnActiveRoster: 700 })],
    { screen: 'spring_training', render: false, players: [p(2, { contractYearsLeft: 3, contractSignedYear: 2026 })] });
  const next = h.current.os.handleNextYear;
  await act(async () => { const pending = next(); expect(await next()).toBe(false); expect(await pending).toBe(true); });
  expect(h.current.gs.myTeam.farm.map(p => p.contractYearsLeft)).toEqual([3, 2]); expect(h.current.gs.myTeam.players[0].contractYearsLeft).toBe(3);
  expect(h.current.gs.myTeam.farm[1].daysOnActiveRoster).toBe(700);
  expect(remainingContractAfterSeason(p(4, { contractYearsLeft: undefined }), 2026)).toBeUndefined();
});
it('keeps expired ikusei players in history and market and restarts the cycle on a farm-only re-signing', async () => {
  const h = setup([p(0, { 育成: true, salary: 300, ikuseiYears: 3 })], { screen: 'retire_phase', render: false });
  await act(async () => expect(await h.current.os.handleRetirePhaseNext({})).toBe(true));
  expect(h.current.gs.myTeam.farm).toHaveLength(0); expect(h.current.gs.myTeam.history[0].exitReason).toBe('育成契約満了');
  const market = h.current.gs.faPool[0]; expect(market).toMatchObject({ id: 0, 育成: true, departureReason: 'ikusei_expiry' });
  const signed = addMarketSigning(h.current.gs.myTeam, market, 300, 1, 2026, 'offseason');
  expect(signed.players).toHaveLength(0); expect(signed.farm[0]).toMatchObject({ ikuseiYears: 0, 育成: true });
});
it('rejects contracts beyond the existing ikusei expiry without changing ownership', () => {
  const player = p(0, { 育成: true, ikuseiYears: 2, salary: 300 }); const t = team([player]);
  expect(evaluateRenewalOffer(player, { salary: 1000, years: 2 }, t, [t], calcPlayerDemand(player)).valid).toBe(false);
  const h = setup([player], { render: false }); act(() => expect(h.current.os.handleContractRenewalSign(0, 1000, 2, 0, 0)).toBe(false));
  expect(h.current.gs.myTeam.farm[0].contractSignedYear).toBeUndefined();
});
it('does not invent a first-team season when a never-played farm player is released and transferred', () => {
  const released = { ...p(0), faEnteredYear: 2026, faOriginTeamId: 0, faOriginTeamName: '旧球団', faOriginRoster: 'farm' };
  const prepared = prepareOffseasonFreeAgent(released, 2026, 1);
  expect(prepared.recentCareerLog).toBeUndefined(); expect(prepared.faArchivedYear).toBe(2026);
  const played = prepareOffseasonFreeAgent({ ...released, stats: { ...emptyStats(), PA: 10, HR: 0 } }, 2026, 1);
  expect(played.recentCareerLog[0]).toMatchObject({ teamId: 0, stats: { PA: 10, HR: 0 } });
});
it('renews and resumes farm contracts for three successive years without shortening each new agreement', async () => {
  let h = setup([p(0)], { render: false });
  for (const year of [2026, 2027, 2028]) {
    act(() => { h.current.gs.setScreen('offseason_planning'); h.current.gs.setOffseasonPlan({ version: 1, year, myId: 0, stage: 'open', demands: {} }); });
    const sign = h.current.os.handleContractRenewalSign;
    act(() => { sign(0, 1000, 1, 0, 0); expect(sign(0, 1000, 1, 0, 0)).toBe(false); });
    expect(h.current.gs.myTeam.farm[0].contractSignedYear).toBe(year);
    act(() => h.current.gs.setScreen('spring_training'));
    await act(async () => expect(await h.current.os.handleNextYear()).toBe(true));
    expect(h.current.gs.myTeam.farm[0].contractYearsLeft).toBe(1);
    const saved = JSON.parse(JSON.stringify({ farm: h.current.gs.myTeam.farm, year: h.current.gs.year, plan: h.current.gs.offseasonPlan }));
    act(() => h.view.unmount()); h = setup(saved.farm, { ...saved, render: false });
  }
  expect(h.current.gs.year).toBe(2029); expect(h.current.gs.myTeam.farm[0].age).toBe(27);
});
