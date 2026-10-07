import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { enqueueSaveGame } from '../engine/saveload';
vi.mock('../engine/saveload', () => ({ hasSave: () => true, getSaveQueueSnapshot: () => ({ isSaving: false }),
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
