import { test, expect } from '@playwright/test';
import { startNewGame, runBatch, saveHub, progressSignature } from './helpers/progression';

test.describe('バッチシム（5試合）', () => {
  test.beforeEach(async ({page}) => startNewGame(page));
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
