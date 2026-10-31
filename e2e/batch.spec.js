import { test, expect } from '@playwright/test';
import { startNewGame, runBatch, saveHub, progressSignature } from './helpers/progression';

test.describe('バッチシム（5試合）', () => {
  test.beforeEach(async ({page}) => {
    // These assertions require five playable games. An unseeded emergency-only
    // roster can legitimately run out of eligible fielders after an injury
    // (reserves may still be under the ten-day registration restriction).
    // Keep both team generation and the real simulation worker reproducible;
    // do not relax roster validation or change the expected number of games.
    await page.addInitScript(() => {
      let seed = 1;
      Math.random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    });
    await page.route('**/src/workers/seasonBatchWorker.js?worker_file*', async route => {
      const response = await route.fetch();
      await route.fulfill({ response, body: `
        let batchTestSeed = 1;
        Math.random = () => {
          batchTestSeed = (Math.imul(batchTestSeed, 1664525) + 1013904223) >>> 0;
          return batchTestSeed / 4294967296;
        };
        ${await response.text()}
      ` });
    });
    await startNewGame(page);
  });
  test('5試合バッチシムが完了してHUBに戻れる', async ({page}) => {
    await runBatch(page, false);
    await expect(page.locator('.topbar')).toContainText('残り138試合');
  });
  test('バッチシム後に勝敗表示が更新される', async ({page}) => {
    await runBatch(page, false);
    const saved = progressSignature(await saveHub(page, { progressOnly: true }));
    expect(saved.played).toBe(5);
    await expect(page.locator('.topbar')).toContainText(`${saved.wins}勝${saved.losses}敗${saved.draws}分`);
  });
});
