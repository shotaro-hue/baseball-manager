import { test, expect } from '@playwright/test';
import { loadFixture, openBatch, saveHub, reloadAndLoad, mainNavigation } from './helpers/progression';

for (const width of [360, 390, 760, 761, 1023, 1024, 1440]) {
  test(`UI-01D batch states and keyboard ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const state of ['normal','long','empty','missing','loading','error','no-detail','saving','save-error','saved']) {
      await page.goto(`/baseball-manager/e2e/fixtures/ui01d/index.html?state=${state}`);
      await expect(page.getByRole('heading', { name: /試合の結果/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.batch-summary').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(14, 38, 59)');
      const bad = await page.locator('button,summary').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 44).map(node => node.textContent));
      expect(bad).toEqual([]);
      if (state === 'normal') {
        await expect(page.locator('.batch-game')).toHaveCount(8);
        await page.getByRole('button', { name: '続きを表示' }).focus(); await page.keyboard.press('Enter');
        await expect(page.locator('.batch-game')).toHaveCount(12);
        await page.locator('.batch-game').last().getByRole('button').click();
        expect(await page.locator('body').getAttribute('data-game')).toBe('12');
        await page.getByText('負傷・リーグの詳細', { exact: true }).click();
        await expect(page.getByText('高橋 玲 · 肩の負傷 · 3日')).toBeVisible();
        if ([360,390,1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`batch-${width}.png`), fullPage: true });
      }
      if (state === 'no-detail') { await expect(page.locator('.batch-game').first().getByRole('button')).toBeDisabled(); await expect(page.locator('.batch-game').first()).toContainText('詳細記録なし'); }
      if (state === 'missing') await expect(page.locator('.batch-game').first()).toContainText('勝敗未確認');
      if (state === 'error') await expect(page.getByRole('alert')).toContainText('ハイライトの集計に失敗');
      const home = page.getByRole('button', { name: 'ホームへ戻る', exact: true });
      await home.focus(); await page.keyboard.press('Enter');
      expect(await page.locator('body').getAttribute('data-action')).toBe('home');
    }
    expect(errors).toEqual([]);
  });
}
for (const width of [360,390,1440]) {
  test(`UI-01D actual batch detail focus roster and save ${width}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 }); await loadFixture(page, 'opening');
    const panel = await openBatch(page, width <= 760);
    await panel.getByLabel('まとめて進める試合数').selectOption('10');
    await panel.getByRole('button', { name: 'まとめてシム', exact: true }).click();
    await expect(page.getByRole('heading', { name: '10試合の結果', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '続きを表示' }).click();
    const selected = page.locator('.batch-game').last().getByRole('button');
    const name = await selected.getAttribute('aria-label');
    await selected.click();
    await expect(page.getByRole('heading', { name: '試合結果', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'バッチ結果に戻る', exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
    await expect(page.locator('.batch-game')).toHaveCount(10);
    await page.getByRole('button', { name: '編成を見直す', exact: true }).click();
    await expect(page.getByRole('region', { name: '編成一覧', exact: true })).toBeVisible();
    if (width === 390) {
      await mainNavigation(page, true).getByRole('button', { name: 'ホーム', exact: true }).click();
      const second = await openBatch(page, true);
      await second.getByLabel('まとめて進める試合数').selectOption('10');
      await second.getByRole('button', { name: 'まとめてシム', exact: true }).click();
      await expect(page.getByRole('heading', { name: '10試合の結果', exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.batch-game')).toHaveCount(8);
      await expect(page.locator('.batch-game').first()).toContainText('第11戦');
      await expect(page.getByRole('button', { name: '続きを表示' })).toBeVisible();
      await page.getByRole('button', { name: '編成を見直す', exact: true }).click();
      // Day 20 can trigger the real press event when returning to the hub.
      // Answer it through its normal UI instead of blocking the save button.
      const press = page.getByRole('dialog', { name: '記者会見', exact: true });
      if (await press.isVisible()) {
        await press.getByRole('button').filter({ hasNotText: '回答する' }).first().click();
        await press.getByRole('button', { name: '回答する', exact: true }).click();
        await expect(press).toBeHidden();
      }
    }
    const before = await saveHub(page); await reloadAndLoad(page);
    const after = await saveHub(page);
    expect(after.gameResultsMap).toEqual(before.gameResultsMap);
    expect(after.teams).toEqual(before.teams); expect(after.gameDay).toBe(width === 390 ? 21 : 11);
  });
}
