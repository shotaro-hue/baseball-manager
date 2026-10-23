// Historical unsafe observation: advisory evidence, never a normal regression gate.
// Retire/update after positive cross-tab exclusion and immutable-batch tests exist.
import { test, expect } from '@playwright/test';

test('backup probe current archive writer bypasses save lock and replaces same batch ID', async ({ page, context }) => {
  await page.goto('/baseball-manager/');
  await page.evaluate(async () => {
    const a = await import('/baseball-manager/src/engine/battedBallArchive.js');
    a.enqueueBattedBallBatches([{ id: 'probe:2026:g:p', saveId: 'probe', year: 2026, gameId: 'g',
      playerId: 'p', events: [{ result: 's', evKmh: 140, laDeg: 15 }] }]); await a.flushBattedBallQueue();
    void navigator.locks.request('baseball-manager-save', async () => {
      window.saveLockHeld = true; await new Promise(resolve => { window.releaseSaveLock = resolve; });
    });
  });
  await expect.poll(() => page.evaluate(() => window.saveLockHeld)).toBe(true);
  const other = await context.newPage(); await other.goto('/baseball-manager/');
  try {
    const result = await other.evaluate(async () => {
      const a = await import('/baseball-manager/src/engine/battedBallArchive.js');
      a.enqueueBattedBallBatches([{ id: 'probe:2026:g:p', saveId: 'probe', year: 2026, gameId: 'g',
        playerId: 'p', events: [{ result: 's', evKmh: 180, laDeg: 15 }] }]);
      await a.flushBattedBallQueue();
      const meta = await a.loadBattedBallArchiveMeta('probe'), events = await a.loadGameBattedBalls('probe', 2026, 'g');
      return { count: meta.estimatedEventCount, velocity: events[0].events[0].evKmh };
    });
    expect(result).toEqual({ count: 1, velocity: 180 });
  } finally { await page.evaluate(() => window.releaseSaveLock()); await other.close(); }
});
