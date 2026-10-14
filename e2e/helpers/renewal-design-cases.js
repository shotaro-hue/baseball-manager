import { test, expect } from '@playwright/test';

const fixture = '/baseball-manager/e2e/fixtures/ui03b/index.html';
const rowName = '佐藤 海斗の契約更改';
const input = page => page.getByLabel('提示年俸（万円）', { exact: true });
async function checkLayout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.renewal-screen button,.renewal-screen input:not([type="checkbox"]),.renewal-screen select,.renewal-screen summary').evaluateAll(ns => ns.filter(n => n.getClientRects().length && n.getBoundingClientRect().height < 44).map(n => n.textContent))).toEqual([]);
}
export function registerRenewalDesignCases() {
  test('UI-03B folded abilities FA and annual records remain usable in a narrow parent', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 }); await page.goto(`${fixture}?embedded&container=500`);
    await page.getByRole('button', { name: rowName, exact: true }).click();
    const career = page.locator('.renewal-career'); await career.locator('summary').click();
    await expect(career).toContainText('ミート 60'); await expect(career.locator('.career-detail')).toContainText('2026');
    await expect(career.getByRole('row').filter({ hasText: '2026' })).toContainText(/2026.*500.*\.287.*14.*42/); await checkLayout(page);
    await career.locator('summary').click(); await expect(career.locator('.career-detail')).not.toBeVisible();
    await page.getByText('FAまでの目安', { exact: true }).click(); await expect(page.locator('.renewal-context')).toContainText('最短あと7年');
    await page.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click(); await expect(page.getByRole('button', { name: rowName, exact: true })).toBeFocused();
  });
  for (const embedded of [false, true]) test(`UI-03B parent update retains dialog focus and unlocks the next player ${embedded ? 'embedded' : 'standalone'}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${fixture}${embedded ? '?embedded' : ''}`);
    await page.getByRole('button', { name: rowName, exact: true }).click();
    await page.getByRole('button', { name: 'オファーを出す', exact: true }).click();
    await page.evaluate(() => window.resolveRenewalTarget(0));
    await expect(page.getByRole('dialog').getByRole('heading')).toBeFocused();
    await page.getByRole('button', { name: 'この条件を提示する', exact: true }).click();
    await expect(page.getByRole('heading', { name: '佐藤 海斗', exact: true })).toBeFocused();
    await page.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
    await page.getByRole('button', { name: '田中 悠真の契約更改', exact: true }).click();
    await page.getByRole('button', { name: 'オファーを出す', exact: true }).click();
    await page.getByRole('button', { name: 'この条件を提示する', exact: true }).click();
    expect(await page.locator('body').getAttribute('data-signs')).toBe('1');
  });
  test('UI-03B narrow embedded confirmation covers viewport after scrolling', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fixture}?embedded&container=500&state=many`);
    const row = page.getByRole('button', { name: '選手22の契約更改', exact: true });
    await row.scrollIntoViewIfNeeded(); await row.click();
    await page.getByRole('button', { name: 'オファーを出す', exact: true }).click();
    const rect = await page.locator('.renewal-overlay').evaluate(n => { const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
    expect(rect).toEqual({ x: 0, y: 0, width: 1440, height: 900 });
    await expect(page.getByRole('dialog').getByRole('heading')).toBeInViewport();
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: 'オファーを出す', exact: true })).toBeFocused();
  });
  for (const width of [360, 390, 760, 761, 1023, 1024, 1440]) test(`UI-03B renewal states inputs and navigation ${width}`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    for (const state of ['normal', 'long', 'empty', 'missing', 'zero', 'signed', 'cooldown', 'free_requested', 'stale']) {
      await page.goto(`${fixture}?state=${state}`); await expect(page.locator('.renewal-list')).toBeVisible();
      await checkLayout(page);
      if (state === 'empty') { await expect(page.locator('.renewal-list')).toContainText('契約更改が必要な選手はいません'); continue; }
      if (state === 'stale') { await expect(page.locator('.renewal-detail')).toHaveCount(0); continue; }
      await page.locator('.renewal-row').first().click();
      await expect(page.locator('.renewal-detail h2')).toBeFocused(); await checkLayout(page);
      if (state === 'missing') { await expect(page.locator('.renewal-salaries')).toContainText('未記録'); await expect(page.locator('.renewal-stats').first()).toContainText('未記録'); }
      if (state === 'zero') { await expect(page.locator('.renewal-salaries')).toContainText('0万円'); await expect(page.locator('.renewal-stats').first()).toContainText('本塁打 0'); }
      if (state === 'signed') { await expect(page.locator('.renewal-agreement')).toContainText('6,200万円・2年'); await expect(input(page)).toHaveCount(0); }
      if (state === 'cooldown') { await page.getByRole('button', { name: '再交渉する', exact: true }).click(); await expect(input(page)).toBeVisible(); }
      if (state === 'free_requested') { await page.getByRole('button', { name: '減額制限内で再提示する', exact: true }).click(); await expect(input(page)).toHaveValue('3600'); }
      if (state === 'normal') {
        await input(page).fill(''); await page.getByRole('button', { name: 'オファーを出す', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('提示年俸');
        await input(page).fill('6400'); await page.getByLabel('契約年数', { exact: true }).selectOption('3');
        await page.getByRole('button', { name: 'オファーを出す', exact: true }).click();
        const dialog = page.getByRole('dialog'); await expect(dialog).toContainText('佐藤 海斗へ6,400万円・3年');
        await expect(dialog.getByRole('heading')).toBeFocused(); await page.keyboard.press('Escape');
        await expect(page.getByRole('button', { name: 'オファーを出す', exact: true })).toBeFocused();
        await page.getByRole('button', { name: 'オファーを出す', exact: true }).click(); await page.getByRole('button', { name: 'この条件を提示する', exact: true }).click();
        await expect(page.locator('.renewal-agreement')).toContainText('6,400万円・3年');
        expect(await page.locator('body').getAttribute('data-signs')).toBe('1');
        await page.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click(); await expect(page.getByRole('button', { name: rowName, exact: true })).toBeFocused();
        await page.getByRole('button', { name: 'まとめて提示を開く', exact: true }).click();
        await page.getByRole('button', { name: '提示可能な全員を選択', exact: true }).click();
        await page.getByRole('button', { name: '選択した選手の下書きに適用', exact: true }).click();
        expect(await page.locator('body').getAttribute('data-signs')).toBe('1');
        await page.getByRole('button', { name: '選択した選手の提示内容を確認', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('対象 5人');
        await page.getByRole('button', { name: '各選手へ1回ずつ提示する', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('まとめて提示の返答');
        await page.getByRole('button', { name: '結果を閉じる', exact: true }).click();
        expect(await page.locator('body').getAttribute('data-signs')).toBe('6');
        await page.getByRole('button', { name: '更改結果を確認する', exact: true }).click(); await page.getByRole('button', { name: '確定して次へ進む', exact: true }).click();
        expect(await page.locator('body').getAttribute('data-next')).toBe('true');
      }
    }
    // Large viewport inside a narrow parent, followed by both sides of the content-width boundary.
    for (const container of [799, 800]) {
      await page.goto(`${fixture}?embedded&container=${container}`); await page.getByRole('button', { name: rowName, exact: true }).click();
      const actualWidth = await page.locator('.renewal-screen').evaluate(n => n.clientWidth);
      if (actualWidth < 800) await expect(page.locator('.renewal-list')).not.toBeVisible();
      else await expect(page.locator('.renewal-list')).toBeVisible();
      await checkLayout(page);
    }
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`narrow-parent-${width}.png`), fullPage: true });
  });
  for (const width of [390, 1024, 1440]) test(`UI-03B long-list return and disappearing row ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await page.goto(`${fixture}?state=many`);
    await page.getByRole('button', { name: '未合意', exact: true }).click();
    const row = page.getByRole('button', { name: '選手22の契約更改', exact: true }); await row.scrollIntoViewIfNeeded();
    const top = await row.evaluate(n => n.getBoundingClientRect().top); await row.click();
    await expect(page.getByRole('button', { name: '← 選手一覧に戻る' })).toBeInViewport();
    await input(page).fill('6100');
    await page.getByRole('button', { name: '← 選手一覧に戻る' }).click();
    await expect(row).toBeFocused(); await expect(row).toBeInViewport();
    expect(Math.abs(await row.evaluate(n => n.getBoundingClientRect().top) - top)).toBeLessThan(10);
    // A second selection is made inside the bounded PC list.
    await row.click(); const row2 = page.getByRole('button', { name: '選手24の契約更改', exact: true });
    if (await row2.isVisible()) { await row2.scrollIntoViewIfNeeded(); await row2.click(); }
    await page.getByRole('button', { name: 'オファーを出す', exact: true }).click(); await page.getByRole('button', { name: 'この条件を提示する', exact: true }).click();
    await page.getByRole('button', { name: '← 選手一覧に戻る' }).click();
    await expect(page.getByRole('button', { name: '未合意', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.renewal-row:focus')).toBeInViewport();
    await page.locator('.renewal-row:focus').click(); await page.setViewportSize({ width: 760, height: 900 }); await expect(page.locator('.renewal-list')).not.toBeVisible();
    await page.getByRole('button', { name: '← 選手一覧に戻る' }).click(); await expect(page.locator('.renewal-row:focus')).toBeInViewport();
  });
}
