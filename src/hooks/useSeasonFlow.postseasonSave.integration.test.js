import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { useGameState } from './useGameState';
import { useSeasonFlow } from './useSeasonFlow';
import { simulateSeasonBatch } from '../workers/seasonBatchCore';
import { generateSeasonSchedule } from '../engine/scheduleGen';
import { getSaveQueueSnapshot, loadGame } from '../engine/saveload';

const { workers } = vi.hoisted(() => ({ workers: [] }));
// Only the browser transport is replaced: simulation, hooks and storage are real.
vi.mock('../workers/seasonBatchWorker?worker', () => ({ default: class {
  constructor() { workers.push(this); }
  postMessage(message) { this.message = structuredClone(message); }
  terminate() {}
} }));
let view, gs, sf;
function Harness() { gs = useGameState(); sf = useSeasonFlow(gs); return null; }
beforeEach(() => {
  const rows = new Map();
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('localStorage', { getItem: key => rows.get(key) ?? null,
    setItem: (key, value) => rows.set(key, String(value)), removeItem: key => rows.delete(key) });
  vi.stubGlobal('navigator', { locks: { request: (_name, operation) => Promise.resolve().then(operation) } });
});
afterEach(() => { act(() => view?.unmount()); workers.length = 0; vi.unstubAllGlobals(); });

it('publishes the final batch game and dated plan together, then cold resumes without another save', async () => {
  const initial = JSON.parse(gunzipSync(readFileSync(new URL('../../e2e/fixtures/new-game.json.gz', import.meta.url))));
  const teams = initial.teams.map(t => ({ ...t, wins: 142, losses: 0, draws: 0 }));
  const schedule = generateSeasonSchedule(initial.year, teams);
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => {
    gs.setTeams(teams); gs.setSaveId('final-batch'); gs.setMyId(initial.myId); gs.setYear(initial.year);
    gs.setGameDay(143); gs.setSchedule(schedule); gs.setAllStarDone(true); gs.setScreen('pregame');
  });
  act(() => sf.handleBatchSim(1));
  const worker = workers[0], { taskId, snapshot, archiveRunId } = worker.message.payload;
  expect(snapshot.offseasonPlan).toBeNull();
  const send = (type, payload) => worker.onmessage({ data: { type, payload: { taskId, ...payload } } });
  const result = simulateSeasonBatch({ snapshot, count: 1, archiveRunId,
    onArchiveChunk: chunk => send('ARCHIVE_CHUNK', { chunk }), isCancelled: () => false });
  expect(result.shouldEnterPlayoff).toBe(true);
  expect(result.nextState.offseasonPlan).toBeNull();
  await act(async () => {
    send('DONE', { result });
    await vi.waitFor(() => expect(gs.saveResult?.ok).toBe(true), { interval: 10 });
  });
  expect(getSaveQueueSnapshot()).toMatchObject({ isSaving: false, hasQueuedSave: false });
  const saved = await loadGame();
  expect(saved.offseasonPlan).toEqual(gs.offseasonPlan);
  expect(saved.offseasonPlan).toMatchObject({ stage: 'postseason', resumeScreen: 'playoff' });
  expect(saved.gameDay).toBe(144);
  expect(saved.teams.map(t => [t.id, t.wins, t.losses, t.draws])).toEqual(
    result.nextState.teams.map(t => [t.id, t.wins, t.losses, t.draws]));
  const { oppTeam, ...finalResult } = result.gameResultsMapPatch[143];
  expect(saved.gameResultsMap[143]).toMatchObject(finalResult);
  expect(saved.gameResultsMap[143].oppTeam.id).toBe(oppTeam.id);
  expect(saved.allTeamResultsMap).toEqual(gs.getMatchHistorySnapshot().allTeamResultsMap);
  expect(saved.battedBallReceipt).toEqual(gs.battedBallReceipt);
  const finalDate = schedule[143].date;
  expect(saved.offseasonPlan.playoff.calendar.regularSeasonEndDate).toBe(
    `${initial.year}-${String(finalDate.month).padStart(2, '0')}-${String(finalDate.day).padStart(2, '0')}`);
  act(() => view.unmount());
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => {
    expect(gs.hydrateSavedWorld(saved, { sessionToken: gs.getProgressSessionToken(), progressToken: gs.getProgressToken() })).toBe(true);
    gs.setScreen(saved.offseasonPlan.resumeScreen);
  });
  expect(gs.screen).toBe('playoff');
  expect(sf.playoff).toEqual(saved.offseasonPlan.playoff);
  expect(gs.getGameResultsMap()[143]).toEqual(saved.gameResultsMap[143]);
  expect(gs.teams.find(t => t.id === initial.myId)).toMatchObject({
    wins: saved.teams.find(t => t.id === initial.myId).wins,
    losses: saved.teams.find(t => t.id === initial.myId).losses,
    draws: saved.teams.find(t => t.id === initial.myId).draws,
  });
});
