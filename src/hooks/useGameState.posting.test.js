import React from 'react';
import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useGameState } from './useGameState';
import { useOffseason } from './useOffseason';

vi.mock('../engine/saveload', () => ({ hasSave: () => false, getSaveQueueSnapshot: () => ({ isSaving: false }) }));
vi.mock('../engine/battedBallArchive', () => ({ getBattedBallQueueStatus: () => ({ failedRecords: 0 }) }));
vi.mock('../engine/posting', async original => ({ ...await original(), calcPostingBid: () => 100_000_000 }));
let view, gs, os;
beforeEach(() => vi.useFakeTimers());
afterEach(() => { if (view) act(() => view.unmount()); view = null; vi.useRealTimers(); });
async function setup() {
  function Harness() { gs = useGameState(); os = useOffseason(gs); return null; }
  await act(async () => { view = create(React.createElement(Harness)); });
  act(() => {
    gs.setMyId(0); gs.setYear(2026); gs.setGameDay(1);
    gs.setTeams([{ id: 0, name: '自球団', budget: 1000, wins: 0, losses: 0, draws: 0,
      players: [{ id: 0, name: '移籍選手', morale: 70 }], farm: [], coaches: [], lineup: [0], rotation: [] }]);
    gs.setMailbox([{ id: 'request', type: 'posting_request', playerId: 0 }]);
  });
}
it('connects the actual game state mail lookup to approval, including player ID 0', async () => {
  await setup();
  act(() => os.handleMailAction('request', 'accept'));
  expect(gs.myTeam.budget).toBe(3000);
  expect(gs.myTeam.players).toEqual([]);
  expect(gs.getMailboxBySelector()).toContainEqual(expect.objectContaining({ id: 'request', resolved: true }));
  expect(gs.getMailboxBySelector()).toContainEqual(expect.objectContaining({ type: 'posting_result' }));
});
it('connects the actual game state mail lookup to rejection and marks the request resolved', async () => {
  await setup();
  act(() => os.handleMailAction('request', 'decline'));
  expect(gs.myTeam.budget).toBe(1000);
  expect(gs.myTeam.players[0].morale).toBe(60);
  expect(gs.getMailboxBySelector()).toEqual([expect.objectContaining({ resolved: true, read: true })]);
});
