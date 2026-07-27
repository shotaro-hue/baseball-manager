import { test, expect } from '@playwright/test';

test('100試合バッチが完走し、保存データから再開できる', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: '読売ジャイアンツ' }).click();
  await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 10_000 });

  const batchSelect = page.locator('select').filter({
    has: page.locator('option[value="100"]'),
  });
  await batchSelect.selectOption('100');
  await page.getByRole('button', { name: /まとめてシム/ }).click();

  await expect(page.getByRole('button', { name: /ハブに戻る/ })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByText(/100試合/)).toBeVisible();

  await page.getByRole('button', { name: /ハブに戻る/ }).click();
  await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 10_000 });

  await expect.poll(
    () => page.evaluate(() => Boolean(localStorage.getItem('baseball_manager_v1'))),
    { timeout: 20_000 },
  ).toBe(true);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /続きから/ })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: /続きから/ }).click();
  await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 20_000 });
});
