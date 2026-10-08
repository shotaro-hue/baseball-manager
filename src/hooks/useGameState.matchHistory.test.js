import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { enqueueSaveGame } from '../engine/saveload';

vi.mock('../engine/saveload', () => ({ hasSave: () => true, getAutoSaveIntervalMs: () => 60000,
  getSaveQueueSnapshot: () => ({ isSaving: false }), enqueueSaveGame: vi.fn(async () => ({ ok: true })) }));
vi.mock('../engine/battedBallArchive', () => ({ getBattedBallQueueStatus: () => ({ failedRecords: 0 }), flushBattedBallQueue: async () => ({ ok: true }) }));
let view, gs;
afterEach(() => { if (view) act(() => view.unmount()); vi.clearAllMocks(); });
async function setup() {
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  await act(async () => { gs.setTeams([{ id: 0, players: [], farm: [] }]); gs.setMyId(0); gs.setScreen('hub'); });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(gs.persistentSummaries.gameResultsMap).not.toBeNull();
  });
  act(() => gs.setIsAutoSaveSuspended(true));
  await act(async () => { await gs.handleSave({ silent: true }); });
}
const result = { won: true, drew: false, myScore: 3, oppScore: 1, oppName: '相手', oppTeam: { id: 1, name: '相手' }, log: [], inningSummary: [] };
it('uses the same result map for screens and Worker selectors after every setter route', async () => {
  await setup();
  act(() => gs.pushGameResult(1, result));
  expect(gs.getGameResultsMap()).toEqual(gs.gameResultsMap);
  act(() => gs.setGameResultsMap(prev => ({ ...prev, 2: { ...result, myScore: 4 } })));
  expect(gs.getGameResultsMap()).toEqual(gs.gameResultsMap);
  expect(Object.keys(gs.getGameResultsMap())).toEqual(['1', '2']);
  act(() => gs.setGameResultsMap({}));
  expect(gs.getGameResultsMap()).toEqual({});
});
it('includes match history and event state in manual saves and marks history-only edits dirty', async () => {
  await setup();
  act(() => { gs.setGameResultsMap({ 1: result }); gs.setAllTeamResultsMap({ 0: { 1: result } });
    gs.setAllTeamBoxScoresMap({ 0: { 1: { myBatting: [{ id: 'p', H: 2 }] } } });
    gs.setScheduleArchive([{ year: 2025, gameResultsMap: { 1: result } }]);
    gs.setRecentResults([{ ...result, gameNo: 1 }]); gs.setAllStarDone(true);
    gs.setAllStarResult({ rosters: {}, gameResult: { score: { my: 2, opp: 1 } } });
    gs.setLastPressDay(10); gs.setPressEvent({ id: 'press', choices: [] }); });
  expect(gs.saveDirty).toBe(true);
  await act(async () => { await gs.handleSave({ silent: true }); });
  expect(enqueueSaveGame.mock.lastCall[0]).toMatchObject({
    gameResultsMap: { 1: result }, allTeamResultsMap: { 0: { 1: result } },
    allTeamBoxScoresMap: { 0: { 1: { myBatting: [{ id: 'p', H: 2 }] } } },
    scheduleArchive: [{ year: 2025 }], recentResults: [{ gameNo: 1 }], allStarDone: true,
    allStarResult: { gameResult: { score: { my: 2, opp: 1 } } }, lastPressDay: 10, pressEvent: { id: 'press' },
  });
  expect(gs.saveDirty).toBe(false);
});
