import { test, expect } from '@playwright/test';
import { startNewGame, mainNavigation } from './helpers/progression';

test.describe('HUB画面', () => {
  test.beforeEach(async ({page}) => startNewGame(page));
  test('成績タブに切り替えると打者・投手ビューが表示される', async ({page}) => {
    await mainNavigation(page,false).getByRole('button',{name:'成績',exact:true}).click();
    await page.locator('.tabs-nav').getByRole('button',{name:'成績',exact:true}).click();
    await expect(page.getByRole('tab',{name:'打者',exact:true})).toBeVisible();
    await expect(page.getByRole('tab',{name:'投手',exact:true})).toBeVisible();
    await expect(page.getByText('打者成績',{exact:true})).toBeVisible();
  });
  test('ロスタータブに選手テーブルが表示される', async ({page}) => {
    await mainNavigation(page,false).getByRole('button',{name:/編成/}).click();
    await page.locator('.tabs-nav').getByRole('button',{name:'ロスター',exact:true}).click();
    await page.locator('details.roster-full-settings > summary').click();
    await expect(page.locator('details.roster-full-settings table tbody tr').nth(0)).toBeVisible();
  });
  test('HUBに1試合シムボタンが表示される', async ({page}) => {
    await expect(page.locator('.desktop-dashboard').getByRole('button',{name:'試合へ進む',exact:true})).toBeVisible();
  });
});
