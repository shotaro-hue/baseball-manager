import { test, expect } from '@playwright/test';

async function selectTeamAndGoToHub(page, teamName = '読売ジャイアンツ') {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: teamName }).click();
  await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 8000 });
}

test.describe('バッチシム（5試合）', () => {
  test.beforeEach(async ({ page }) => {
    await selectTeamAndGoToHub(page);
  });

  test('5試合バッチシムが完了してHUBに戻れる', async ({ page }) => {
    await page.getByRole('button', { name: /まとめてシム/ }).click();

    await expect(page.getByRole('button', { name: /ハブに戻る/ })).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: /ハブに戻る/ }).click();
    await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 8000 });
  });

  test('バッチシム後に勝敗表示が更新される', async ({ page }) => {
    await page.getByRole('button', { name: /まとめてシム/ }).click();
    await expect(page.getByRole('button', { name: /ハブに戻る/ })).toBeVisible({ timeout: 30000 });

    await page.getByRole('button', { name: /ハブに戻る/ }).click();

    await expect(page.locator('.chip.cg').filter({ hasText: /^\d+勝$/ })).toHaveCount(1);
    await expect(page.locator('.chip.cr').filter({ hasText: /^\d+敗$/ })).toHaveCount(1);
  });
});
