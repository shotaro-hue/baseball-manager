import { test, expect } from '@playwright/test';

async function selectTeamAndGoToHub(page, teamName = '読売ジャイアンツ') {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: teamName }).click();
  await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 8000 });
}

test.describe('オートシム1試合', () => {
  test.beforeEach(async ({ page }) => {
    await selectTeamAndGoToHub(page);
  });

  test('オートシムを実行すると結果画面が表示される', async ({ page }) => {
    await page.getByRole('button', { name: /1試合/ }).click();
    await page.getByText('オートシムモード').click();

    await expect(page.getByText(/VICTORY|DEFEAT|DRAW/)).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: 'ホームに戻る' })).toBeVisible({ timeout: 15000 });
  });

  test('試合後に成績タブで投手成績テーブルを表示できる', async ({ page }) => {
    await page.getByRole('button', { name: /1試合/ }).click();
    await page.getByText('オートシムモード').click();
    await expect(page.getByRole('button', { name: 'ホームに戻る' })).toBeVisible({ timeout: 15000 });

    // 結果画面のボタンからHUBへ戻る
    await page.getByRole('button', { name: 'ホームに戻る' }).click();
    await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 8000 });

    // 成績タブで投手ビューへ
    await page.getByRole('button', { name: /分析/ }).click();
    await page.getByRole('button', { name: '成績' }).click();
    await page.getByRole('button', { name: '投手' }).click();

    await expect(page.getByText('投手成績')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('table tbody tr').first()).toBeVisible({ timeout: 5000 });
  });
});
