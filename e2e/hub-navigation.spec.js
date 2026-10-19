import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { mainNavigation, reloadAndLoad, saveHub, loadFixture, startNewGame } from './helpers/progression';

const notifications = page => page.getByRole('button', { name: /^通知（未読/ });
const active = page => page.locator('[data-hub-route]:not([hidden])');
test('hub navigation entry surfaces use the readable DES-01 canvas and full-width budget', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await prepare(page); await management(page, 390);
  await expect(page.locator('.calm-shell')).toHaveCSS('background-color', 'rgb(244, 246, 249)');
  const band = active(page).locator('[data-ds="metrics"]');
  const metricWidth = await band.locator('dd').evaluate(n => n.getBoundingClientRect().width);
  const bandWidth = await band.evaluate(n => n.getBoundingClientRect().width);
  expect(metricWidth).toBeGreaterThan(bandWidth / 2);
});
async function prepare(page) {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
  const mine = fixture.teams.find(t => t.id === fixture.myId), other = fixture.teams.find(t => t.id !== fixture.myId);
  const used = new Set([...(mine.lineupDh || []), ...(mine.lineupNoDh || []), ...(mine.rotation || [])]);
  const outgoing = mine.players.find(p => !used.has(p.id)), incoming = other.players.find(p => !p.isPitcher);
  fixture.mailbox = [
    { id: 'visible-offer', type: 'trade', title: 'UI04既読の提案', body: '閲覧だけでは確定しません。', read: true, resolved: false,
      offer: { from: other, want: [outgoing], offer: [incoming], cash: 5000000 } },
    { id: 'unread-info', type: 'info', title: 'UI04未読のお知らせ', body: 'お知らせ', read: false },
    { id: 'future-offer', type: 'trade', title: 'UI04未来の提案', read: false, resolved: false, deliverOnDay: fixture.gameDay + 10,
      offer: { from: other, want: [outgoing], offer: [incoming], cash: 0 } },
  ];
  fixture.news = [];
  await page.goto('/');
  await page.evaluate(async fixture => {
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    if (!(await saveGame(fixture)).ok) throw new Error('navigation fixture save failed');
  }, fixture);
  await reloadAndLoad(page);
  await expect(notifications(page)).toHaveAccessibleName('通知（未読1件・要対応1件）');
}
async function management(page, width) {
  await mainNavigation(page, width < 1024).getByRole('button', { name: /^経営/ }).click();
}
async function layout(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const controls = page.locator('.hub-common-header button,.tabs-nav button,.hub-secondary-nav button,.hub-return button,.hub-entry-links button');
  expect(await controls.evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && (n.getBoundingClientRect().height < 44 || n.getBoundingClientRect().width < 44)).map(n => n.textContent)), '44px shell controls').toEqual([]);
}

for (const width of [360, 390, 760, 761, 1023, 1024, 1440]) {
  test(`hub navigation all five sections and nine relocated features ${width}px`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: width === 360 ? 800 : 900 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await prepare(page);
    const before = await saveHub(page);
    const nav = mainNavigation(page, width < 1024);
    await expect(nav.getByRole('button')).toHaveCount(5);
    expect(await nav.getByRole('button').allTextContents()).toEqual(['ホーム', '編成', '日程', '成績', '経営1']);
    for (const label of ['ホーム', '編成', '日程', '成績']) {
      await nav.getByRole('button', { name: label, exact: true }).click();
      await expect(notifications(page)).toBeVisible();
      await layout(page);
    }
    await page.getByRole('navigation', { name: '成績メニュー' }).getByRole('button', { name: '記録・球団史', exact: true }).click();
    await page.getByRole('navigation', { name: '記録・球団史メニュー' }).getByRole('button', { name: 'OB', exact: true }).click();
    await expect(active(page)).toHaveAttribute('data-hub-route', 'alumni');
    await management(page, width);
    await expect(active(page).getByRole('heading', { name: '球団経営', exact: true })).toBeVisible();
    await expect(active(page)).toContainText('編成予算の残枠'); await layout(page);
    await page.getByRole('navigation', { name: '経営メニュー' }).getByRole('button', { name: '補強', exact: true }).click();
    for (const label of ['FA', 'トレード', 'スカウト']) {
      await page.getByRole('navigation', { name: '補強メニュー' }).getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await expect(active(page)).toHaveAttribute('data-hub-route', { FA: 'fa', トレード: 'trade', スカウト: 'scout' }[label]);
      await layout(page);
    }
    for (const [label, id] of [['契約', 'contract'], ['財務', 'finance']]) {
      await page.getByRole('navigation', { name: '経営メニュー' }).getByRole('button', { name: new RegExp(`^${label}`) }).click();
      await expect(active(page)).toHaveAttribute('data-hub-route', id);
      await layout(page);
    }
    await notifications(page).click(); await expect(active(page)).toHaveAttribute('data-hub-route', 'mailbox');
    await expect(active(page).getByText('UI04未来の提案', { exact: true })).toHaveCount(0);
    await page.getByRole('navigation', { name: '通知メニュー' }).getByRole('button', { name: 'ニュース', exact: true }).click();
    await expect(active(page)).toHaveAttribute('data-hub-route', 'news');
    await page.getByRole('button', { name: '元の画面へ戻る', exact: true }).click();
    await expect(active(page)).toHaveAttribute('data-hub-route', 'finance');
    await page.getByRole('button', { name: '設定', exact: true }).click();
    await active(page).getByText('開発者向け機能', { exact: true }).click();
    await active(page).getByRole('button', { name: 'バランス検証', exact: true }).click();
    await expect(active(page)).toHaveAttribute('data-hub-route', 'balance');
    await page.goBack(); await expect(active(page)).toHaveAttribute('data-hub-route', 'settings');
    await page.goBack(); await expect(active(page)).toHaveAttribute('data-hub-route', 'finance');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    if (width < 1024) {
      const navTop = await nav.evaluate(n => n.getBoundingClientRect().top);
      const bottom = await active(page).evaluate(n => n.getBoundingClientRect().bottom);
      expect(bottom).toBeLessThanOrEqual(navTop);
    }
    const after = await saveHub(page);
    expect(after.teams).toEqual(before.teams);
    expect(after.mailbox).toEqual(before.mailbox);
    await reloadAndLoad(page);
    expect((await saveHub(page)).teams).toEqual(before.teams);
    expect(errors).toEqual([]);
  });
}

test('hub navigation notifications preserve FA filter, focus, scroll and existing trade actions', async ({ page }) => {
  test.setTimeout(90_000); await page.setViewportSize({ width: 390, height: 844 }); await prepare(page);
  const before = await saveHub(page);
  await management(page, 390);
  await active(page).getByRole('button', { name: 'FA市場', exact: true }).click();
  const market = active(page).getByLabel('市場', { exact: true });
  const options = await market.locator('option').evaluateAll(ns => ns.map(n => n.value));
  await market.selectOption(options.at(-1));
  const filterValue = await market.inputValue();
  await page.evaluate(() => window.scrollTo(0, 120));
  await notifications(page).focus();
  const beforeScroll = await page.evaluate(() => window.scrollY);
  await page.keyboard.press('Enter');
  await expect(active(page)).toHaveAttribute('data-hub-route', 'mailbox');
  await active(page).getByText('UI04既読の提案', { exact: true }).click();
  await expect(notifications(page)).toHaveAccessibleName('通知（未読1件・要対応1件）');
  await active(page).getByRole('button', { name: 'トレード画面で検討する', exact: true }).click();
  await expect(active(page)).toHaveAttribute('data-hub-route', 'trade');
  const unopened = await saveHub(page); expect(unopened.teams).toEqual(before.teams);
  expect(unopened.mailbox.find(m => m.id === 'visible-offer').resolved).toBe(false);
  // Reopening a mounted ancestor must use the same browser-history return path.
  await notifications(page).click(); await expect(active(page)).toHaveAttribute('data-hub-route', 'mailbox');
  await page.getByRole('button', { name: '元の画面へ戻る', exact: true }).click();
  await expect(active(page)).toHaveAttribute('data-hub-route', 'fa');
  await expect(market).toHaveValue(filterValue); await expect(notifications(page)).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(beforeScroll);
  await notifications(page).click();
  await active(page).getByText('UI04未読のお知らせ', { exact: true }).click();
  await expect(notifications(page)).toHaveAccessibleName('通知（未読0件・要対応1件）');
  await page.getByRole('button', { name: '元の画面へ戻る', exact: true }).click();
  await mainNavigation(page, true).getByRole('button', { name: 'ホーム', exact: true }).click();
  await expect(page.getByRole('region', { name: '重要な対応待ち' })).toContainText('トレード提案 1件');
  await page.getByRole('button', { name: 'トレード提案 1件', exact: true }).click();
  await active(page).getByRole('button', { name: '✅ 承諾', exact: true }).click();
  await expect(notifications(page)).toHaveAccessibleName('通知（未読0件・要対応0件）');
  const settled = await saveHub(page);
  expect(settled.teams.find(t => t.id === settled.myId).budget).toBe(before.teams.find(t => t.id === before.myId).budget + 500);
  expect(settled.mailbox.find(m => m.id === 'visible-offer').resolved).toBe(true);
  await notifications(page).click();
  await active(page).getByText('UI04既読の提案', { exact: true }).click();
  await expect(active(page).getByText('対応済み', { exact: true })).toBeVisible();
  await expect(active(page).getByRole('button', { name: '✅ 承諾する', exact: true })).toHaveCount(0);
  await reloadAndLoad(page);
  expect((await saveHub(page)).teams).toEqual(settled.teams);
});

test('hub navigation invalid lineup allows reading all sections while pregame remains guarded', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await loadFixture(page, 'invalid-lineup');
  const nav = mainNavigation(page, true);
  await nav.getByRole('button', { name: '編成', exact: true }).click();
  await management(page, 390); await expect(active(page)).toHaveAttribute('data-hub-route', 'management');
  await nav.getByRole('button', { name: 'ホーム', exact: true }).click();
  await page.locator('main.mobile-home').getByRole('button', { name: /1試合ずつ采配/ }).click();
  await expect(page.getByText('試合開始エラー', { exact: true })).toBeVisible();
});

test('hub navigation new game exposes all five destinations', async ({ page }) => {
  test.setTimeout(60_000); await page.setViewportSize({ width: 390, height: 844 }); await startNewGame(page);
  for (const label of ['編成', '日程', '成績', '経営', 'ホーム']) {
    await mainNavigation(page, true).getByRole('button', { name: new RegExp(`^${label}`) }).click();
    await expect(notifications(page)).toBeVisible();
  }
});
