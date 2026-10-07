import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { DraftLotteryScreen, DraftScreen, DraftReviewScreen } from './Draft';
import { encodeLottery, decodeLottery, draftPicksForTeam } from '../engine/offseasonResume';
import { planningResumeScreen } from '../engine/offseasonPlanning';
import { loadGame } from '../engine/saveload';

vi.mock('../engine/trade', () => ({ analyzeTeamNeeds: () => [] }));
vi.mock('./ui', () => ({ OV: () => null, HandBadge: () => null }));
const teams = [0, 1].map(id => ({ id, name: `球団${id}`, emoji: '⚾', color: '#2465ac', wins: id, losses: 0, players: [], farm: [] }));
const pool = [0, 1, 2].map(id => ({ id, name: `候補${id}`, pos: '捕手', age: 22, potential: 70, salary: 500, batting: { contact: 60, power: 60, eye: 60, speed: 60 }, fielding: {} }));
const views = [];
const text = n => typeof n === 'string' ? n : (n.children || []).map(text).join('');
function mount(Component, props) { let view; act(() => { view = create(React.createElement(Component, { teams, myId: 0, year: 2026, pool, ...props })); }); views.push(view); return view; }
afterEach(() => { views.splice(0).forEach(v => act(() => v.unmount())); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('round-trips ID zero and stores only IDs for lottery references', () => {
  const encoded = JSON.parse(JSON.stringify(encodeLottery({ activeTeams: teams, myPick: pool[0], lotteryTarget: pool[0], lotteryTeams: teams,
    lotteryResult: teams[0], cpuPicks: { 1: pool[0] }, confirmedPicks: { 0: pool[1] } })));
  expect(encoded.myPick).toBe(0); expect(encoded.lotteryResult).toBe(0); expect(encoded.activeTeams).toEqual([0, 1]);
  const decoded = decodeLottery(encoded, teams, pool);
  expect(decoded.myPick).toBe(pool[0]); expect(decoded.lotteryResult).toBe(teams[0]); expect(decoded.cpuPicks[1]).toBe(pool[0]);
});
it('resumes a recorded lottery winner without drawing again, including team zero', () => {
  vi.useFakeTimers(); const random = vi.spyOn(Math, 'random'); const changed = vi.fn();
  mount(DraftLotteryScreen, { onDone: vi.fn(), onStateChange: changed, savedState: {
    phase: 'lottery', hazureRound: 0, activeTeams: [0, 1], myPick: 0, cpuPicks: { 1: 0 },
    pendingConflicts: [{ pid: '0', tids: ['0', '1'] }], currentConflictIdx: 0, lotteryTarget: 0,
    lotteryTeams: [0, 1], lotteryResult: 0, resolvedPicks: {}, confirmedPicks: {}, allLotteryLosers: [] } });
  act(() => vi.advanceTimersByTime(1500));
  expect(random).not.toHaveBeenCalled();
  expect(changed.mock.lastCall[0]).toMatchObject({ phase: 'select', hazureRound: 1, confirmedPicks: { 0: 0 }, activeTeams: [1] });
});
it('resumes CPU announcement choices without generating new choices and clears timers on unmount', () => {
  vi.useFakeTimers(); const random = vi.spyOn(Math, 'random'); const changed = vi.fn();
  const v = mount(DraftLotteryScreen, { onDone: vi.fn(), onStateChange: changed,
    savedState: { phase: 'announce', activeTeams: [0, 1], myPick: 0, cpuPicks: { 1: 1 }, animStep: 1 } });
  act(() => vi.advanceTimersByTime(1000));
  expect(changed.mock.lastCall[0]).toMatchObject({ phase: 'done', round1Result: { 0: 0, 1: 1 } });
  expect(random).not.toHaveBeenCalled(); act(() => v.unmount()); expect(vi.getTimerCount()).toBe(0);
});
it('restores picks, log and zero scouting points and prevents duplicate confirmation', () => {
  const changed = vi.fn(), done = vi.fn();
  const v = mount(DraftScreen, { onStateChange: changed, onDraftDone: done, savedState: {
    pickIdx: 2, drafted: { 0: 0, 1: 'refused' }, done: true, scouted: [0], scoutPt: 0,
    log: [{ round: 2, team: 0, player: 0, isMe: true, comment: '保存済み' }] } });
  expect(changed.mock.lastCall[0]).toMatchObject({ pickIdx: 2, scoutPt: 0, scouted: [0], drafted: { 0: 0, 1: 'refused' } });
  expect(text(v.toJSON())).toContain('自チーム指名選手 (1人)');
  const finish = v.root.findAllByType('button').find(b => text(b).includes('結果レビュー')).props.onClick;
  act(() => { finish(); finish(); }); expect(done).toHaveBeenCalledTimes(1);
});
it('does not acquire refused or unrecorded winners and deduplicates first and later round picks', () => {
  const candidates = [{ ...pool[0], _drafted: true, _r1winner: 0 }, { ...pool[1], _r1winner: null }, pool[2]];
  expect(draftPicksForTeam(candidates, { 0: 0, 2: 'refused' }, 0).map(p => p.id)).toEqual([0]);
  const v = mount(DraftReviewScreen, { pool: candidates, drafted: { 0: 0, 2: 'refused' }, onEnd: vi.fn() });
  expect(text(v.toJSON())).toContain('候補0');
});
it('resumes all six stages and falls back when required draft state is missing', () => {
  const base = { version: 1, year: 2026, myId: 0, stage: 'results', draftPool: pool, draftResult: { pool, drafted: {} }, spring: { conditionDeltas: {} } };
  for (const resumeScreen of ['draft_preview', 'draft_lottery', 'draft', 'draft_review', 'spring_training', 'new_season'])
    expect(planningResumeScreen({ ...base, resumeScreen }, 2026, 0)).toBe(resumeScreen);
  expect(planningResumeScreen({ ...base, draftPool: undefined, resumeScreen: 'draft' }, 2026, 0)).toBe('waiver_result');
  expect(planningResumeScreen({ ...base, resumeScreen: 'draft' }, 2027, 0)).toBe('hub');
});
it('loads serialized draft progress through the real save migration and restores the same lottery', async () => {
  const plan = { version: 1, year: 2026, myId: 0, stage: 'results', resumeScreen: 'draft_lottery', draftPool: pool,
    draftViews: { lottery: { phase: 'lottery', activeTeams: [0, 1], lotteryTarget: 0, lotteryTeams: [0, 1], lotteryResult: 0 } } };
  const state = { teams, year: 2026, gameDay: 143, myId: 0, saveDataVersion: 2, offseasonPlan: plan };
  vi.stubGlobal('localStorage', { getItem: key => key === 'baseball_manager_v1' ? JSON.stringify(state) : null });
  const loaded = await loadGame();
  expect(planningResumeScreen(loaded.offseasonPlan, loaded.year, loaded.myId)).toBe('draft_lottery');
  const restored = decodeLottery(loaded.offseasonPlan.draftViews.lottery, loaded.teams, loaded.offseasonPlan.draftPool);
  expect(restored.lotteryResult.id).toBe(0); expect(restored.lotteryTarget.id).toBe(0);
});
it('accepts one explicit pick when tapped twice, preserves its cursor and cancels the CPU timer on exit', () => {
  vi.useFakeTimers(); vi.spyOn(Math, 'random').mockReturnValue(0.5); const changed = vi.fn();
  const v = mount(DraftScreen, { onStateChange: changed, onDraftDone: vi.fn() });
  const pick = v.root.findAllByType('button').find(b => b.props['aria-label'] === '候補0を指名').props.onClick;
  act(() => { pick(); pick(); });
  expect(changed.mock.lastCall[0]).toMatchObject({ pickIdx: 1, drafted: { 0: 0 } });
  expect(changed.mock.lastCall[0].log).toHaveLength(1);
  const calls = changed.mock.calls.length; act(() => v.unmount()); act(() => vi.advanceTimersByTime(10000));
  expect(changed.mock.calls.length).toBe(calls); expect(vi.getTimerCount()).toBe(0);
});
