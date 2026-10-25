import { test, expect } from '@playwright/test';
import { openBatch, waitForNewGameReady, saveHub, reloadAndLoad, readSave, progressSignature } from './helpers/progression';
import { answerAnnualPress } from './helpers/annual-journey';

test('100試合バッチが完走し、保存データから再開できる', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.getByRole('button', { name: '読売ジャイアンツ' }).click();
  await waitForNewGameReady(page);

  const panel = await openBatch(page, false);
  const batchSelect = panel.locator('select').filter({
    has: page.locator('option[value="100"]'),
  });
  await batchSelect.selectOption('100');
  await page.getByRole('button', { name: /まとめてシム/ }).click();

  await expect(page.getByRole('button', { name: /ホームへ戻る/ })).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByRole('heading', { name: '100試合の結果', exact: true })).toBeVisible();

  await page.getByRole('button', { name: /ホームへ戻る/ }).click();
  await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 10_000 });
  await answerAnnualPress(page);

  const saved = await saveHub(page, { progressOnly: true });
  const before = progressSignature(saved);
  expect(before.played).toBe(100);
  expect(before.gameDay).toBe(101);
  await reloadAndLoad(page);
  await expect(page.getByRole('button', { name: /ホーム/ })).toBeVisible({ timeout: 20_000 });
  expect(progressSignature(await readSave(page, { progressOnly: true, playerId: before.player.id }))).toEqual(before);
});
