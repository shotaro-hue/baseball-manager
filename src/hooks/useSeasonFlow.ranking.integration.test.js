import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { useGameState } from './useGameState';
import { useSeasonFlow } from './useSeasonFlow';
import { useOffseason } from './useOffseason';
import { simulateSeasonBatch } from '../workers/seasonBatchCore';
import { simulateSingleDay } from '../workers/singleDayCore';
import { loadGame } from '../engine/saveload';
import { rankLeague, standingsContext } from '../engine/standings';
import { initPlayoff } from '../engine/playoff';
import { finalRankingFixture } from '../../tests/helpers/season-ranking';
import HubContentRouter from '../components/hub/HubContentRouter';

const { workers, scores } = vi.hoisted(() => ({ workers: [], scores: { draw: false } }));
vi.mock('../workers/seasonBatchWorker?worker', () => ({ default: class {
  constructor() { workers.push(this); }
  postMessage(message) { this.message = structuredClone(message); }
  terminate() {}
} }));
// Fix scores only; real Worker processing, team updates, history, hooks and
// storage remain in use. Club 0 beats 1; the other five games are draws.
vi.mock('../engine/simulation', async original => ({ ...await original(),
  quickSimGame: (a, b) => ({ score: { my: !scores.draw && a.id === 0 && b.id === 1 ? 1 : 0,
    opp: !scores.draw && b.id === 0 && a.id === 1 ? 1 : 0 }, log: [], inningSummary: [] }),
}));
let view, gs, sf, os, automaticSave;
function Harness() {
  gs = useGameState();
  sf = useSeasonFlow({ ...gs, handleSave: options => {
    automaticSave = gs.handleSave(options);
    return automaticSave;
  } });
  os = useOffseason(gs);
  return null;
}
beforeEach(() => {
  scores.draw = false; automaticSave = null;
  const rows = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, String(value)), removeItem: key => rows.delete(key) });
  vi.stubGlobal('navigator', { locks: { request: (_name, operation) => Promise.resolve().then(operation) } });
});
afterEach(() => { act(() => view?.unmount()); workers.length = 0; vi.unstubAllGlobals(); });
async function mount(initial) {
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => {
    gs.setTeams(initial.teams); gs.setSaveId('ranking-final'); gs.setMyId(initial.myId); gs.setYear(initial.year);
    gs.setGameDay(initial.gameDay); gs.setSchedule(initial.schedule); gs.setAllStarDone(true); gs.setScreen('pregame');
    gs.setSeasonHistory(initial.seasonHistory); gs.hydrateMatchHistory(initial);
  });
  await act(async () => { await vi.dynamicImportSettled(); });
  act(() => gs.setSchedule(initial.schedule));
}
async function checkPublishedRanking({ draw = false } = {}) {
  expect(gs.teams.slice(0, 2).map(t => [t.wins, t.losses, t.draws])).toEqual(draw
    ? [[1, 1, 141], [1, 1, 141]] : [[2, 2, 139], [2, 2, 139]]);
  expect(sf.playoff.se1.id).toBe(0);
  expect(sf.playoff.cs1_se.teams[0].id).toBe(1);
  expect(rankLeague(gs.teams, 'セ', standingsContext(gs.getSeasonHistory(), gs.allTeamResultsMap, gs.year)).teams[0].id).toBe(0);
  await act(async () => { expect((await gs.handleSave({ silent: true })).ok).toBe(true); });
  const saved = await loadGame();
  expect(saved.offseasonPlan.playoff.se1.id).toBe(0);
  expect(saved.allTeamResultsMap[0][143]).toMatchObject({ oppId: 1, myScore: draw ? 0 : 1, oppScore: 0 });
  expect(saved.allTeamResultsMap[1][143]).toMatchObject({ oppId: 0, myScore: 0, oppScore: draw ? 0 : 1 });
  for (const t of saved.teams) expect(Object.keys(saved.allTeamResultsMap[t.id])).toHaveLength(143);
  act(() => view.unmount());
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => { expect(gs.hydrateSavedWorld(saved, { sessionToken: gs.getProgressSessionToken(), progressToken: gs.getProgressToken() })).toBe(true); });
  expect(sf.playoff.se1.id).toBe(0);
  // Annual history uses the same rank input before resetting any season stats.
  await act(async () => { expect(await os.handleRetirePhaseNext({})).toBe(true); });
  expect(gs.getSeasonHistory().standingsHistory.at(-1).central.slice(0, 2).map(t => t.id)).toEqual([0, 1]);
}

it.each([
  ['batch', true, 1, false], ['batch', true, 2, false], ['batch', false, 1, true],
  ['single', true, 1, false], ['single', false, 1, false], ['single', false, 1, true],
])('uses the final %s Worker patch (home=%s, count=%s, draw=%s) before ranking and persists it', async (mode, isHome, count, draw) => {
  scores.draw = draw;
  const initial = finalRankingFixture({ isHome, finalDraw: draw });
  if (count === 2) {
    // Round 142 is all draws in this fixture. Ensure a two-round patch retains
    // both newly played days as well as all 141 previous ones.
    initial.gameDay = 142;
    initial.teams.forEach(t => { t.draws--; delete initial.allTeamResultsMap[t.id][142]; });
    delete initial.gameResultsMap[142];
  }
  await mount(initial);
  if (mode === 'batch') act(() => sf.handleBatchSim(count));
  else {
    await act(async () => { await sf.handleStartGame(); });
    act(() => sf.handleModeSelect('auto'));
    await vi.waitFor(() => expect(workers).toHaveLength(1));
  }
  const worker = workers[0], payload = worker.message.payload;
  const send = (type, extra) => worker.onmessage({ data: { type, payload: { taskId: payload.taskId, ...extra } } });
  const options = { ...payload, onArchiveChunk: chunk => send('ARCHIVE_CHUNK', { chunk }), isCancelled: () => false };
  const result = mode === 'batch' ? simulateSeasonBatch(options) : simulateSingleDay(options);
  if (mode === 'batch') expect(result.batchMeta.afterRank).toBe(1);
  await act(async () => { send('DONE', { result }); await vi.waitFor(() => expect(gs.gameDay).toBe(144)); });
  if (mode === 'batch') {
    expect(automaticSave).toBeInstanceOf(Promise);
    await act(async () => { expect((await automaticSave).ok).toBe(true); });
    expect((await loadGame()).offseasonPlan.playoff.se1.id).toBe(0); // first save, before manual save can mask the defect
  }
  await checkPublishedRanking({ draw });
});

it.each([true, false])('ranks tactical results with final home=%s scores and CPU draws, then resumes', async isHome => {
  await mount(finalRankingFixture({ isHome }));
  act(() => { sf.setCurrentOpp(gs.teams[1]); sf.setCurrentGameTeams({ isHome }); });
  await act(async () => { await sf.handleTacticalGameEnd({ score: { my: 1, opp: 0 }, log: [], inningSummary: [] }); });
  await checkPublishedRanking();
});

it('includes a tactical final draw without treating the missing new record as a zero game', async () => {
  scores.draw = true;
  await mount(finalRankingFixture({ isHome: false, finalDraw: true }));
  act(() => { sf.setCurrentOpp(gs.teams[1]); sf.setCurrentGameTeams({ isHome: false }); });
  await act(async () => { await sf.handleTacticalGameEnd({ score: { my: 0, opp: 0 }, log: [], inningSummary: [] }); });
  await checkPublishedRanking({ draw: true });
});

it('ranks the legacy direct auto result with the user game as well as CPU results', async () => {
  await mount(finalRankingFixture());
  act(() => { sf.setCurrentOpp(gs.teams[1]); sf.setCurrentGameTeams({ isHome: true }); });
  await act(async () => { await sf.handleAutoSimEnd({ score: { my: 1, opp: 0 }, won: true, log: [], inningSummary: [] }); });
  await checkPublishedRanking();
});

it('records year-end standings from all clubs instead of the user day map', async () => {
  const initial = finalRankingFixture();
  await mount(initial);
  // No remaining regular game: all recorded rounds are final, with the first
  // two clubs tied in totals but club 0 winning the head-to-head 1-0.
  act(() => gs.setTeams(prev => prev.map(t => t.id === 0 ? { ...t, wins: 1, losses: 1, draws: 140 }
    : t.id === 1 ? { ...t, wins: 1, losses: 1, draws: 140 } : t)));
  // Use the simple, explicitly counted record set here, independent of the
  // final-game fixture above: 0 beats 1, loses to 6; 1 beats 6, loses to 0.
  const row = (oppId, myScore, oppScore) => ({ oppId, myScore, oppScore });
  act(() => gs.setAllTeamResultsMap({ 0: { 1: row(1, 1, 0), 2: row(6, 0, 1),
    ...Object.fromEntries(Array.from({ length: 140 }, (_, i) => [i + 3, row(2, 0, 0)])) },
    1: { 1: row(0, 0, 1), 2: row(6, 1, 0),
      ...Object.fromEntries(Array.from({ length: 140 }, (_, i) => [i + 3, row(2, 0, 0)])) } }));
  await act(async () => { expect(await os.handleRetirePhaseNext({})).toBe(true); });
  expect(gs.getSeasonHistory().standingsHistory.at(-1).central.slice(0, 2).map(t => t.id)).toEqual([0, 1]);
});

it('renders the same head-to-head leader in the standings tab as in the home standings', async () => {
  const initial = finalRankingFixture();
  // At 142 games, make 0/1 exactly tied with the complete histories already
  // used by the annual test; winner 0 is deliberately second in prior ranks.
  initial.teams = initial.teams.map(t => t.id < 2 ? { ...t, wins: 1, losses: 1, draws: 0 } : t);
  initial.allTeamResultsMap = { 0: { 1: { oppId: 1, myScore: 1, oppScore: 0 }, 2: { oppId: 6, myScore: 0, oppScore: 1 } },
    1: { 1: { oppId: 0, myScore: 0, oppScore: 1 }, 2: { oppId: 6, myScore: 1, oppScore: 0 } } };
  await mount(initial);
  await act(async () => {
    view.update(React.createElement(HubContentRouter, { tab: 'standings', app: { gs, sf, os } }));
    await vi.dynamicImportSettled();
  });
  const rows = view.root.findAllByType('tr').filter(row => row.findAllByType('td').length);
  expect(rows[0].findByType('button').findAllByType('span')[1].children[0]).toBe(initial.teams[0].name);
});

it('preserves an already saved undated playoff without reranking or filling old history', async () => {
  const initial = finalRankingFixture();
  const oldPlayoff = initPlayoff(initial.teams, { year: initial.year });
  await mount({ ...initial, allTeamResultsMap: {} });
  act(() => gs.setOffseasonPlan({ version: 1, year: initial.year, myId: 0,
    stage: 'postseason', resumeScreen: 'playoff', playoff: oldPlayoff }));
  await act(async () => { await sf.handleStartGame(); sf.handleBatchSim(1); });
  expect(workers).toHaveLength(0);
  expect(sf.playoff).toEqual(oldPlayoff);
  await act(async () => { expect((await gs.handleSave({ silent: true })).ok).toBe(true); });
  const saved = await loadGame();
  expect(saved.offseasonPlan.playoff).toEqual(oldPlayoff);
  expect(saved.offseasonPlan.playoff.calendar).toBeUndefined();
  expect(saved.allTeamResultsMap).toEqual({});
});
