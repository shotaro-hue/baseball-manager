import { test, expect } from '@playwright/test';

for (const width of [360, 390, 1440]) {
  test(`eligibility detail rights, day evidence and completed pro seasons ${width}`, async ({ page }, info) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
    for (const state of ['eligibility-domestic', 'eligibility-overseas', 'eligibility-development']) {
      await page.goto(`/baseball-manager/e2e/fixtures/ui02c/index.html?state=${state}`);
      for (const index of [0, 1]) {
        const opener = page.locator(`[data-player-index="${index}"]`); await opener.click();
        const dialog = page.locator('.player-modal-card');
        await dialog.getByRole('region', { name: '契約', exact: true }).scrollIntoViewIfNeeded();
        if (state === 'eligibility-development') {
          await expect(dialog).toContainText('育成契約中・FA対象外');
          await expect(dialog).not.toContainText('海外FA資格あり');
          await expect(dialog).not.toContainText('海外FA 最短あと');
        } else {
          await expect(dialog).toContainText('国内FA資格あり（公式）');
          if (state === 'eligibility-overseas') await expect(dialog).toContainText('海外FA資格あり（公式）');
          else await expect(dialog.getByText('海外FA 最短あと9年（1189日）・推定', { exact: true })).toBeVisible();
          await expect(dialog).toContainText('登録日数の根拠：ゲーム推定');
        }
        await expect(dialog).toContainText('プロ入り年2021年（公式）');
        await expect(dialog).toContainText('プロ経過年数5年（2025年終了時）');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await dialog.locator('.player-detail-panel').evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
        if (state === 'eligibility-domestic' && index === 0) {
          await page.screenshot({ path: info.outputPath(`eligibility-detail-${width}.png`) });
        }
        await dialog.getByRole('tab', { name: '今季成績', exact: true }).click();
        await expect(dialog).toContainText('一軍・2026年');
        await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
      }
    }
    // The offseason detail caller must count the season that has just ended.
    await page.goto('/baseball-manager/e2e/fixtures/ui02c/index.html?state=eligibility-domestic&mode=review');
    await page.getByRole('region', { name: '成長記録一覧', exact: true }).getByRole('button', { name: /の能力変化を確認$/ }).click();
    await page.getByRole('button', { name: '選手詳細・年度別成績', exact: true }).click();
    await expect(page.locator('.player-modal-card')).toContainText('プロ経過年数6年（2026年終了時）');
    expect(errors).toEqual([]);
  });
}
