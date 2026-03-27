import { test, expect } from '@playwright/test';

test.describe('タイトル画面', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ゲームタイトルが表示される', async ({ page }) => {
    await expect(page.getByText('BASEBALL')).toBeVisible();
    await expect(page.getByText('MANAGER 2025')).toBeVisible();
  });

  test('セントラルリーグの6チームが表示される', async ({ page }) => {
    const cl = ['読売ジャイアンツ', '阪神タイガース', '広島東洋カープ', '中日ドラゴンズ', '横浜DeNAベイスターズ', '東京ヤクルトスワローズ'];
    for (const name of cl) {
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  test('パシフィックリーグの6チームが表示される', async ({ page }) => {
    const pl = ['福岡ソフトバンクホークス', '東北楽天ゴールデンイーグルス', '千葉ロッテマリーンズ', '北海道日本ハムファイターズ', 'オリックス・バファローズ', '埼玉西武ライオンズ'];
    for (const name of pl) {
      await expect(page.getByText(name)).toBeVisible();
    }
  });

  test('チームを選択するとHUB画面に遷移する', async ({ page }) => {
    // 読売ジャイアンツを選択
    await page.getByText('読売ジャイアンツ').click();

    // HUB画面のタブが表示されることを確認
    await expect(page.getByText('🏠 概況')).toBeVisible({ timeout: 5000 });
  });
});
