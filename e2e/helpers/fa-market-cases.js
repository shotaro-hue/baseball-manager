import { test, expect } from '@playwright/test';
import { seedPlanning, savePlanning } from './planning-app-cases';
import { readSave, reloadAndLoad } from './progression';

const fixture = '/baseball-manager/e2e/fixtures/ui03c/index.html';
const back = page => page.getByRole('button', { name: '← 選手一覧に戻る', exact: true });
async function layout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.locator('.fa-market button,.fa-market select,.fa-market input,.fa-market summary').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && n.getBoundingClientRect().height < 44).map(n => n.textContent))).toEqual([]);
}
export function registerFaMarketCases() {
  test('UI-03C signing keeps keyboard focus after the offer action disappears', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${fixture}?embedded`);
    await page.getByRole('button', { name: '候補0の条件を見る', exact: true }).click();
    await page.getByRole('button', { name: '契約条件を確認する', exact: true }).click();
    await page.getByRole('button', { name: '契約を確定する', exact: true }).click();
    await expect(page.locator('.fa-player-heading h3')).toBeFocused();
    await page.keyboard.press('Shift+Tab'); await expect(back(page)).toBeFocused();
  });
  for (const width of [360, 390, 760, 761, 1023, 1024, 1440]) test(`UI-03C FA states and shared renewal interaction ${width}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: width === 360 ? 800 : 900 });
    for (const state of ['normal', 'long', 'zero', 'missing', 'empty', 'budget', 'full', 'declared']) {
      await page.goto(`${fixture}?state=${state}&embedded`);
      await expect(page.locator('.fa-list')).toBeVisible(); await layout(page);
      if (state === 'empty') { await expect(page.locator('.fa-list')).toContainText('市場に候補はいません'); continue; }
      const row = page.locator('.player-list-row').first(); await row.click();
      await expect(page.locator('.fa-player-heading h3')).toBeFocused(); await layout(page);
      if (['zero', 'missing', 'budget'].includes(state)) {
        await expect(page.getByRole('button', { name: '契約条件を確認する', exact: true })).toBeDisabled();
        await expect(page.locator('.fa-detail')).toContainText(state === 'missing' ? '未記録' : state === 'budget' ? '予算が不足' : '本塁打 0');
      } else {
        if (state === 'full') await expect(page.locator('.fa-detail')).toContainText('配属予定：ファーム');
        if (state === 'declared') { await page.getByText('FA宣言の理由', { exact: true }).click(); await expect(page.locator('.fa-context')).toContainText('出場機会を求める'); }
        const offer = page.getByRole('button', { name: '契約条件を確認する', exact: true });
        await offer.click(); const dialog = page.getByRole('dialog');
        await expect(dialog.getByRole('heading', { name: '契約条件の最終確認', exact: true })).toBeFocused();
        await page.keyboard.press('Shift+Tab'); await expect(dialog.getByRole('button', { name: '契約を確定する', exact: true })).toBeFocused();
        await page.keyboard.press('Tab'); await expect(dialog.getByRole('heading', { name: '契約条件の最終確認', exact: true })).toBeFocused();
        expect(await page.locator('.fa-overlay').evaluate(n => { const r = n.getBoundingClientRect(); return r.x === 0 && r.y === 0 && r.width === innerWidth && r.height === innerHeight; })).toBe(true);
        await page.keyboard.press('Escape'); await expect(offer).toBeFocused();
      }
      await back(page).click(); await expect(row).toBeFocused();
    }
  });
  for (const container of [500, 799, 800]) test(`UI-03C FA narrow parent and return ${container}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${fixture}?state=many&embedded&container=${container}&spacer`);
    const row = page.getByRole('button', { name: '候補22の条件を見る', exact: true }); await row.scrollIntoViewIfNeeded();
    const before = await row.boundingBox(); await row.click();
    await expect(page.locator('.fa-list')).toBeVisible({ visible: container >= 800 });
    await layout(page); await back(page).click(); await expect(row).toBeFocused();
    expect(Math.abs((await row.boundingBox()).y - before.y)).toBeLessThan(3);
    await row.click(); await page.getByRole('button', { name: '契約条件を確認する', exact: true }).click();
    await page.getByRole('button', { name: '契約を確定する', exact: true }).click();
    await back(page).click(); await expect(page.getByRole('button', { name: '候補23の条件を見る', exact: true })).toBeFocused();
  });
  test('UI-03C foreign agent rules and deadline remain available in the shared market', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${fixture}?state=foreign`);
    await page.getByRole('button', { name: '候補0の条件を見る', exact: true }).click();
    await page.getByRole('button', { name: '交渉開始', exact: true }).click(); await page.getByRole('button', { name: '条件を受ける', exact: true }).click();
    await page.getByRole('button', { name: '契約条件を確認する', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('2,400万円');
    await page.getByRole('button', { name: '契約を確定する', exact: true }).click();
    expect(await page.evaluate(() => window.marketFixture.snapshot().teams[0].budget)).toBe(7600);
    await page.goto(`${fixture}?state=deadline`); await page.getByRole('button', { name: '候補0の条件を見る', exact: true }).click();
    await expect(page.getByRole('button', { name: '交渉開始', exact: true })).toBeDisabled();
  });
  for (const width of [360, 390, 1440]) test(`UI-03C actual App contract comparison and saved return ${width}`, async ({ page }) => {
    test.setTimeout(120_000); await page.setViewportSize({ width, height: 900 });
    const info = await seedPlanning(page);
    await page.getByRole('button', { name: '交渉・補強を始める', exact: true }).click();
    const market = page.locator('[data-ds="fa-market"]');
    await expect(market.locator('.fa-summary')).toHaveCount(0);
    await market.getByLabel('選手名', { exact: true }).fill('編成確認'); await market.getByLabel('並び順', { exact: true }).selectOption('salary');
    await page.getByRole('button', { name: '編成確認FA候補の条件を見る', exact: true }).click();
    await market.getByLabel('契約年数', { exact: true }).selectOption('3');
    await market.getByRole('button', { name: '比較に追加', exact: true }).click();
    await page.locator('.fa-own-comparison > summary').click();
    await page.getByLabel('比較する自球団の選手', { exact: true }).selectOption(JSON.stringify([typeof info.targets[0].id, info.targets[0].id]));
    await page.getByRole('button', { name: `${info.targets[0].name}を比較に追加`, exact: true }).click();
    await page.getByRole('button', { name: '2人を比較', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('編成確認FA候補'); await page.keyboard.press('Escape');
    const before = await savePlanning(page);
    await reloadAndLoad(page); await expect(market.getByLabel('契約年数', { exact: true })).toHaveValue('3');
    await page.getByRole('button', { name: '契約条件を確認する', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('2,700万円');
    await page.getByRole('button', { name: '契約を確定する', exact: true }).evaluate(n => { n.click(); n.click(); });
    await expect(market).toContainText('契約完了'); await back(page).click();
    await expect(market.getByLabel('市場', { exact: true })).toBeFocused();
    await page.getByRole('button', { name: '自球団', exact: true }).click();
    await page.getByRole('button', { name: '編成確認FA候補の契約更改', exact: true }).click(); await expect(page.locator('.renewal-conditions')).toContainText('契約済み・3年');
    await page.getByRole('button', { name: '補強市場', exact: true }).click();
    await expect(market.getByLabel('選手名', { exact: true })).toHaveValue('編成確認'); await expect(market.getByLabel('並び順', { exact: true })).toHaveValue('salary');
    const after = await savePlanning(page), club = after.teams.find(t => t.id === after.myId), prior = before.teams.find(t => t.id === before.myId);
    expect(club.budget).toBe(prior.budget - 2700); expect([...club.players,...club.farm].filter(p => p.id === 'ui03a-market')).toHaveLength(1);
    expect(after.offseasonPlan.session.entries.some(e => e.player.id === 'ui03a-market')).toBe(false);
    await reloadAndLoad(page); expect((await readSave(page)).teams).toEqual(after.teams); await layout(page);
  });
}
