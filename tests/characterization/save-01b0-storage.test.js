// Historical unsafe observations, not required product behavior.
// On storage fixes, replace with positive regression coverage and retire/update
// these cases after reviewing the new root/archive and immutable-batch evidence.
import { it, expect, vi } from 'vitest';
import { saveGame, loadGame } from '../../src/engine/saveload.js';
import { PRIMARY, game, batch, rows } from '../helpers/save-01b0-storage.js';

it('current archive can contain a future game after the primary commit failed', async () => {
  const archive = await import('../../src/engine/battedBallArchive.js');
  expect((await saveGame(game(), { skipCompression: true })).ok).toBe(true);
  archive.enqueueBattedBallBatches([batch()]);
  expect((await archive.flushBattedBallQueue()).ok).toBe(true);
  const original = localStorage.getItem(PRIMARY), set = localStorage.setItem;
  vi.spyOn(localStorage, 'setItem').mockImplementation((k, v) => {
    if (k === PRIMARY) throw new Error('injected primary failure'); set(k, v);
  });
  expect((await saveGame({ ...game(), gameDay: 2 })).ok).toBe(false);
  expect(localStorage.getItem(PRIMARY)).toBe(original);
  expect((await loadGame()).gameDay).toBe(1);
  expect((await rows('batted_ball_batches'))[0][1].gameDay).toBe(2);
});

it('same-ID archive replacement changes bytes while batch count and event count stay equal', async () => {
  const archive = await import('../../src/engine/battedBallArchive.js');
  archive.enqueueBattedBallBatches([batch(140)]); await archive.flushBattedBallQueue();
  const before = await rows('batted_ball_batches');
  archive.enqueueBattedBallBatches([batch(180)]); await archive.flushBattedBallQueue();
  const after = await rows('batted_ball_batches');
  expect(after.map(([key]) => key)).toEqual(before.map(([key]) => key));
  expect(after[0][1].eventCount).toBe(before[0][1].eventCount);
  expect(after[0][1].events[0].evKmh).toBe(180);
  expect(after[0][1].events).not.toEqual(before[0][1].events);
});
