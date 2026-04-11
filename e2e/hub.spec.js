import { test, expect } from '@playwright/test';

async function selectTeamAndGoToHub(page, teamName = '読売ジャイアンツ') {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByText(teamName).click();
  await expect(page.getByRole('button', { name: '🏠 概況' })).toBeVisible({ timeout: 8000 });
}

test.describe('HUB画面', () => {
  test.beforeEach(async ({ page }) => {
    await selectTeamAndGoToHub(page);
  });

  test('成績タブに切り替えると打者・投手ビューが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '📊 成績' }).click();

    await expect(page.getByRole('button', { name: '🏏 打者' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('button', { name: '⚾ 投手' })).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('打者成績')).toBeVisible({ timeout: 5000 });
  });

  test('ロースタータブに選手テーブルが表示される', async ({ page }) => {
    await page.getByRole('button', { name: '👥 ロースター' }).click();

    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 });
  });

  test('HUBに1試合シムボタンが表示される', async ({ page }) => {
    await expect(page.getByRole('button', { name: /1試合/ })).toBeVisible();
  });
});
