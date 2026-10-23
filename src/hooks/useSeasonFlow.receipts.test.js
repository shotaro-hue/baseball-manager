import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { batch, rows } from '../../tests/helpers/save-01b0-storage.js';
import { useSeasonFlow } from './useSeasonFlow';
import { TEAM_DEFS } from '../constants';
import { buildTeam } from '../engine/player';
import { generateSeasonSchedule } from '../engine/scheduleGen';
import { gameStateReducer, G } from './gameStateReducer';
import { createBattedBallRunEmitter, emptyBattedBallReceipt } from '../engine/battedBallRun';
import { flushBattedBallQueue } from '../engine/battedBallArchive';
import { readBattedBallReceipt, flushBattedBallReceipts } from '../engine/battedBallReceipts';
const { workers } = vi.hoisted(() => ({ workers: [] }));
vi.mock('../workers/seasonBatchWorker?worker', () => ({ default: class {
  constructor() { workers.push(this); } postMessage(message) { this.message = message; } terminate() {}
} }));
let view, api;
afterEach(() => { act(() => view?.unmount()); workers.length = 0; });
function setup({ normal = false } = {}) {
  const teams = (normal ? TEAM_DEFS.slice(0, 2) : TEAM_DEFS).map(buildTeam); let token = 1;
  let state = { teams, saveId: 'source', myId: teams[0].id, year: 2026, gameDay: 1, battedBallReceipt: emptyBattedBallReceipt('source') };
  const gs = { ...state, myTeam: teams[0], allStarDone: true, schedule: normal ? [null, { date: { month: 4, day: 1 }, matchups: [{ homeId: teams[0].id, awayId: teams[1].id }] }] : generateSeasonSchedule(2026, teams),
    getGameResultsMap: () => ({}), getSeasonHistory: () => ({}), getNewsBySelector: () => [], getMailboxBySelector: () => [], getScheduleArchive: () => [],
    getProgressSessionToken: () => 1, getProgressToken: () => token,
    applyProgressCandidate: candidate => { state = gameStateReducer(state, { type: G.APPLY_PROGRESS, candidate }); token++; return true; },
    applyMatchResultPatch: () => ({}), handleSave: vi.fn(async () => ({ ok: true })),
    setSaveRevision: vi.fn(), setSaveExists: vi.fn(), setIsAutoSaveSuspended: vi.fn(), setScreen: vi.fn(), notify: vi.fn(),
    setNews: vi.fn(), setMailbox: vi.fn(), setSeasonHistory: vi.fn(), setFaPool: vi.fn(),
    setAllTeamResultsMap: vi.fn(), addNews: vi.fn(), addTransferLog: vi.fn(), pushResult: vi.fn(), pushGameResult: vi.fn(), cpuTradeOffers: [],
  };
  function Harness() { api = useSeasonFlow(gs); return null; }
  act(() => { view = create(React.createElement(Harness)); });
  if (normal) {
    act(() => { api.setCurrentOpp(teams[1]); api.setCurrentGameTeams({ isHome: true }); });
    return { gs, get state() { return state; }, result: { score: { my: 1, opp: 0 }, inningSummary: [],
      log: [{ batId: teams[0].players.find(p => !p.isPitcher).id, result: 's', evKmh: 140, laDeg: 15 }] } };
  }
  act(() => { api.handleBatchSim(1); });
  const worker = workers[0], taskId = worker.message.payload.taskId;
  const send = (type, payload) => worker.onmessage({ data: { type, payload: { taskId, ...payload } } });
  const emitter = createBattedBallRunEmitter(chunk => send('ARCHIVE_CHUNK', { chunk }), { runId: worker.message.payload.archiveRunId ?? taskId });
  return { gs, send, emitter, get state() { return state; }, stale() { token++; },
    finish(summary) { send('DONE', { result: { nextState: { ...state, gameDay: 2, news: [], mailbox: [], seasonHistory: {}, faPool: [] },
      archiveRun: summary, batchResults: [], batchMeta: {} } }); } };
}

it('stages a Worker stream without projecting it and adopts its immutable receipt with the game state', async () => {
  const h = setup();
  await act(async () => { h.emitter.add([batch(140)]); });
  const summary = h.emitter.finish();
  await act(async () => { await vi.dynamicImportSettled(); await flushBattedBallQueue(); });
  expect(await rows('batted_ball_batches')).toEqual([]);
  await act(async () => { h.finish(summary); await vi.waitFor(() => expect(h.state.gameDay).toBe(2)); });
  expect(h.state.battedBallReceipt.head).not.toBeNull();
  expect(await flushBattedBallReceipts(h.state.battedBallReceipt)).toMatchObject({ ok: true });
  const records = [];
  expect(await readBattedBallReceipt(h.state.battedBallReceipt, { onChunk: chunk => records.push(...chunk) })).toMatchObject({ status: 'complete', recordCount: 1 });
  expect(records[0].events[0].evKmh).toBe(140);
  expect(h.gs.handleSave.mock.calls[0][0].payload.battedBallReceipt).toEqual(h.state.battedBallReceipt);
});

it.each(['auto', 'tactical'])('adopts immutable receipts through the normal %s result path', async mode => {
  const h = setup({ normal: true });
  await act(async () => { await (mode === 'auto' ? api.handleAutoSimEnd(h.result) : api.handleTacticalGameEnd(h.result)); });
  expect(h.state.gameDay).toBe(2); expect(h.state.battedBallReceipt.head).not.toBeNull();
  expect(await flushBattedBallReceipts(h.state.battedBallReceipt)).toMatchObject({ ok: true });
  const records = []; const snapshot = await readBattedBallReceipt(h.state.battedBallReceipt, { onChunk: chunk => records.push(...chunk) });
  expect(snapshot).toMatchObject({ status: 'complete', recordCount: 1, eventCount: 1 });
  expect(records[0].events[0].evKmh).toBe(140);
});

it.each(['stale', 'cancel'])('never projects or adopts a staged Worker run after %s', async mode => {
  const h = setup(); await act(async () => h.emitter.add([batch()])); const summary = h.emitter.finish();
  await act(async () => {
    await vi.dynamicImportSettled(); await flushBattedBallQueue();
    if (mode === 'stale') { h.stale(); h.finish(summary); } else h.send('CANCEL');
  });
  expect(h.state.gameDay).toBe(1); expect(h.state.battedBallReceipt.head).toBeNull();
  expect(await rows('batted_ball_batches')).toEqual([]);
  await vi.waitFor(async () => expect((await rows('save_chunks')).filter(([key]) => key.startsWith('batted-ball-version:'))).toEqual([]));
});
