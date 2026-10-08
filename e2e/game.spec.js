import { test, expect } from '@playwright/test';
import { startNewGame, mainNavigation, startSingle, runSingle } from './helpers/progression';

test.describe('オートシム1試合', () => {
  test.beforeEach(async ({page}) => startNewGame(page));
  test('オートシムを実行すると結果画面が表示される', async ({page}) => {
    await startSingle(page, false);
    await page.getByRole('button',{name:/オートシムモード/}).click();
    await expect(page.locator('.detail-result')).toBeVisible();
    await expect(page.getByText(/VICTORY|DEFEAT|DRAW/)).toBeVisible();
    await expect(page.getByRole('button',{name:'ホームに戻る',exact:true})).toBeVisible();
  });
  test('試合後に成績タブで投手成績テーブルを表示できる', async ({page}) => {
    await runSingle(page, false);
    await mainNavigation(page,false).getByRole('button',{name:'成績',exact:true}).click();
    await page.locator('.tabs-nav').getByRole('button',{name:'成績',exact:true}).click();
    await page.getByRole('button',{name:'投手',exact:true}).click();
    await expect(page.getByText('投手成績',{exact:true})).toBeVisible();
    await expect(page.locator('table tbody tr').nth(0)).toBeVisible();
  });
});
