import { test, expect } from '@playwright/test';

async function selectTeamAndGoToHub(page, teamName = '読売ジャイアンツ') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText(teamName).click();
  await expect(page.getByRole('button', { name: '🏠 概況' })).toBeVisible({ timeout: 8000 });
}

test.describe('バッチシム（5試合）', () => {
  test.beforeEach(async ({ page }) => {
    await selectTeamAndGoToHub(page);
  });

  test('5試合バッチシムが完了してHUBに戻れる', async ({ page }) => {
    await page.getByRole('button', { name: /5試合まとめて/ }).click();

    await expect(page.getByRole('button', { name: 'ハブに戻る →' })).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: 'ハブに戻る →' }).click();
    await expect(page.getByRole('button', { name: '🏠 概況' })).toBeVisible({ timeout: 8000 });
  });

  test('バッチシム後に勝敗表示が更新される', async ({ page }) => {
    await page.getByRole('button', { name: /5試合まとめて/ }).click();
    await expect(page.getByRole('button', { name: 'ハブに戻る →' })).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: 'ハブに戻る →' }).click();

    await expect(page.locator('.chip.cg')).toContainText(/\d+勝/);
    await expect(page.locator('.chip.cr')).toContainText(/\d+敗/);
  });
});
