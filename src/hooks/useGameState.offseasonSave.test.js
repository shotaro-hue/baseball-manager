import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { enqueueSaveGame } from '../engine/saveload';
import { useSeasonFlow } from './useSeasonFlow';
import { initPlayoff, recordSeriesGame } from '../engine/playoff';
import { generateSeasonSchedule } from '../engine/scheduleGen';
vi.mock('../engine/saveload', () => ({ hasSave: () => true, getAutoSaveIntervalMs: () => 30000, getSaveQueueSnapshot: () => ({ isSaving: false }),
  enqueueSaveGame: vi.fn(async () => ({ ok: true })) }));
vi.mock('../engine/battedBallArchive', () => ({ getBattedBallQueueStatus: () => ({ failedRecords: 0 }), flushBattedBallQueue: async () => ({ ok: true }) }));
let view, gs;
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.useRealTimers(); vi.clearAllMocks(); });
async function setup() {
  function Harness() { gs = useGameState(); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => { gs.setYear(2026); gs.setMyId(0); gs.setTeams([{ id: 0, players: [], farm: [] }]);
    gs.setOffseasonPlan({ version: 1, myId: 0, year: 2026, stage: 'results', draftPool: [{ id: 0 }] }); gs.setScreen('draft_lottery'); });
}
it('saves the actual draft screen and leaves failed saves dirty for retry', async () => {
  await setup(); enqueueSaveGame.mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
  await act(async () => expect((await gs.handleSave({ silent: true })).ok).toBe(false));
  expect(gs.saveDirty).toBe(true);
  expect(enqueueSaveGame.mock.lastCall[0]).toMatchObject({ year: 2026, myId: 0, offseasonPlan: { resumeScreen: 'draft_lottery', draftPool: [{ id: 0 }] } });
  await act(async () => expect((await gs.handleSave({ silent: true })).ok).toBe(true));
  expect(gs.saveDirty).toBe(false);
});
it('blocks old-screen manual and automatic saves during transition while allowing the prepared new year', async () => {
  vi.useFakeTimers(); await setup();
  act(() => gs.setIsAutoSaveSuspended(true));
  await act(async () => { vi.advanceTimersByTime(1000); expect((await gs.handleSave({ silent: true })).ok).toBe(false); });
  expect(enqueueSaveGame).not.toHaveBeenCalled();
  const plan = { version: 1, myId: 0, year: 2027, stage: 'new_season', resumeScreen: 'new_season' };
  await act(async () => expect((await gs.handleSave({ silent: true, payload: { year: 2027, gameDay: 1, offseasonPlan: plan } })).ok).toBe(true));
  expect(enqueueSaveGame.mock.lastCall[0]).toMatchObject({ year: 2027, gameDay: 1, offseasonPlan: plan });
  expect(enqueueSaveGame).toHaveBeenCalledTimes(1);
});
it('saves playoff progress with teams, restores it in the season hook and preserves the return route while editing rosters', async () => {
  let sf;
  function Harness() { gs = useGameState(); sf = useSeasonFlow(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  const teams = [0, 1, 2, 6, 7, 8].map(id => ({ id, name: `球団${id}`, league: id < 6 ? 'セ' : 'パ',
    wins: 80 - id, losses: 60 + id, draws: 3, players: [], farm: [] }));
  act(() => { gs.setTeams(teams); gs.setYear(2026); gs.setMyId(0); gs.setScreen('playoff'); });
  const p = initPlayoff(teams);
  p.cs1_se = recordSeriesGame(p.cs1_se, { score: { my: 0, opp: 0 } });
  act(() => sf.setPlayoff(p));
  await act(async () => { expect((await gs.handleSave({ silent: true })).ok).toBe(true); });
  const plan = JSON.parse(JSON.stringify(enqueueSaveGame.mock.lastCall[0].offseasonPlan));
  expect(plan.playoff.cs1_se.games).toHaveLength(1);
  expect(plan.playoff.cs1_se.teams[0]).not.toHaveProperty('players');
  // App's existing load path clears transient playoff state after setting the saved plan.
  act(() => { gs.setOffseasonPlan(plan); sf.setPlayoff(null); });
  expect(sf.playoff.cs1_se.games[0].drew).toBe(true);
  act(() => gs.setScreen('hub'));
  await act(async () => { expect((await gs.handleSave({ silent: true })).ok).toBe(true); });
  expect(enqueueSaveGame.mock.lastCall[0].offseasonPlan.resumeScreen).toBe('playoff');
  act(() => sf.handleBatchSim(1)); expect(gs.screen).toBe('playoff');
  act(() => { gs.setScreen('retire_phase'); gs.setOffseasonPlan({ ...plan, resumeScreen: 'retire_phase' }); });
  await act(async () => { expect((await gs.handleSave({ silent: true })).ok).toBe(true); });
  expect(enqueueSaveGame.mock.lastCall[0].offseasonPlan.resumeScreen).toBe('retire_phase');
});

it('retries a failed dated postseason save without changing its frozen dates or results', async () => {
  let sf;
  function Harness() { gs = useGameState(); sf = useSeasonFlow(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  const teams = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(id => ({ id, name: `球団${id}`, league: id < 6 ? 'セ' : 'パ',
    wins: 90 - id % 6 * 4, losses: 50 + id % 6 * 4, draws: 3, players: [], farm: [] }));
  const schedule = generateSeasonSchedule(2026, teams);
  act(() => { gs.setTeams(teams); gs.setYear(2026); gs.setMyId(0); gs.setSchedule(schedule); gs.setScreen('playoff'); });
  const p = initPlayoff(teams, { year: 2026, schedule });
  p.cs1_se = recordSeriesGame(p.cs1_se, { score: { my: 0, opp: 0 } });
  act(() => sf.setPlayoff(p));
  const frozen = JSON.parse(JSON.stringify(gs.offseasonPlan));
  enqueueSaveGame.mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true });
  await act(async () => expect((await gs.handleSave({ silent: true })).ok).toBe(false));
  expect(gs.saveDirty).toBe(true);
  expect(gs.offseasonPlan).toEqual(frozen);
  await act(async () => expect((await gs.handleSave({ silent: true })).ok).toBe(true));
  const saved = JSON.parse(JSON.stringify(enqueueSaveGame.mock.lastCall[0].offseasonPlan));
  act(() => { gs.setOffseasonPlan(saved); sf.setPlayoff(null); });
  expect(sf.playoff).toEqual(frozen.playoff);
  expect(sf.playoff.cs1_se.games).toHaveLength(1);
});
