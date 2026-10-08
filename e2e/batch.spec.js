import { test, expect } from '@playwright/test';
import { startNewGame, runBatch } from './helpers/progression';

test.describe('バッチシム（5試合）', () => {
  test.beforeEach(async ({page}) => startNewGame(page));
  test('5試合バッチシムが完了してHUBに戻れる', async ({page}) => {
    await runBatch(page, false);
    await expect(page.locator('.topbar')).toContainText('残り138試合');
  });
  test('バッチシム後に勝敗表示が更新される', async ({page}) => {
    await runBatch(page, false);
    await expect(page.locator('.chip.cg').filter({hasText:/^\d+勝$/})).toHaveCount(1);
    await expect(page.locator('.chip.cr').filter({hasText:/^\d+敗$/})).toHaveCount(1);
  });
});
