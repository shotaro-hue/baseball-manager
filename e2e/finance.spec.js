import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { mainNavigation, reloadAndLoad, waitSaveIdle } from './helpers/progression';

async function loadPayrollFixture(page, invalid = false, sparse = false) {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
  const t = fixture.teams.find(t => t.id === fixture.myId);
  for (const p of [...t.players, ...t.farm]) { p.salary = sparse ? null : 0; p.育成 = false; }
  Object.assign(t.players[0], { name: '一軍百万円', salary: 100 });
  Object.assign(t.players[1], { name: '一軍三百万円', salary: 300 });
  Object.assign(t.farm[0], { name: '二軍二百万円', salary: 200 });
  Object.assign(t.farm[1], { name: '育成五十万円', salary: 50, 育成: true });
  if (invalid) { t.players[0].salary = null; t.farm[0].salary = '200'; }
  await page.goto('/');
  await page.evaluate(async fixture => {
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    if (!(await saveGame(fixture)).ok) throw new Error('fixture save failed');
  }, fixture);
  await reloadAndLoad(page);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
}
async function saveSnapshot(page) {
  await waitSaveIdle(page);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await waitSaveIdle(page);
  return page.evaluate(async () => {
    const { loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const save = await loadGame();
    if (!save) throw new Error('save missing');
    // Compare every field of every club, without transferring the large fixture
    // four times through the browser automation protocol.
    const bytes = new TextEncoder().encode(JSON.stringify(save.teams));
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  });
}
async function openFinance(page, mobile) {
  await mainNavigation(page, mobile).getByRole('button', { name: 'その他', exact: true }).click();
  await page.getByRole('button', { name: '球団運営', exact: true }).click();
  await expect(page.getByText('予算 / 年俸上位', { exact: true })).toBeVisible();
}
async function assertPayroll(page) {
  const region = page.getByRole('region', { name: '選手契約年俸（年額）', exact: true });
  await expect(region).toBeVisible();
  for (const [category, value] of [['active','400万円'],['farm','200万円'],['development','50万円'],['total','650万円']]) {
    await expect(region.locator(`[data-payroll-category="${category}"]`)).toContainText(value);
  }
  const leaders = page.getByRole('region', { name: '年俸上位（所属選手）', exact: true });
  const names = await leaders.locator('button').allTextContents();
  expect(names.slice(0,4)).toEqual(['一軍三百万円','二軍二百万円','一軍百万円','育成五十万円']);
  await expect(leaders).toContainText('二軍支配下'); await expect(leaders).toContainText('育成');
  return { region: await region.innerText(), leaders: await leaders.innerText() };
}
for (const width of [360,390,1280]) {
  test(`finance ${width}px preserves roster and budget through display and IndexedDB reload`, async ({ page }, testInfo) => {
    test.setTimeout(60_000); // Four real saves and two application reloads per scenario.
    await page.setViewportSize({ width, height: 900 });
    await loadPayrollFixture(page);
    const before = await saveSnapshot(page);
    await openFinance(page, width < 1024);
    // Same fixture before/after evidence can be collected on the unmodified UI.
    const salaryCard = page.locator('.card').filter({ hasText: /選手年俸|選手契約年俸（年額）/ }).first();
    await salaryCard.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath('finance-viewport.png') });
    await salaryCard.screenshot({ path: testInfo.outputPath('finance-payroll.png') });
    const display = await assertPayroll(page);
    const leaders = page.getByRole('region', { name: '年俸上位（所属選手）', exact: true });
    await leaders.getByRole('button', { name: '二軍二百万円', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('二軍二百万円');
    await page.getByRole('button', { name: '選手詳細を閉じる', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await leaders.screenshot({ path: testInfo.outputPath('finance-leaders.png') });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const after = await saveSnapshot(page);
    expect(after).toEqual(before);
    await mainNavigation(page, width < 1024).getByRole('button', { name: 'ホーム', exact: true }).click();
    await openFinance(page, width < 1024);
    expect(await assertPayroll(page)).toEqual(display);
    expect(await saveSnapshot(page)).toEqual(before);
    await reloadAndLoad(page);
    await openFinance(page, width < 1024);
    expect(await assertPayroll(page)).toEqual(display);
    expect(await saveSnapshot(page)).toEqual(before);
  });
}
test('finance warns about incomplete recorded salaries after real save/load', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await loadPayrollFixture(page, true); await openFinance(page, true);
  const region = page.getByRole('region', { name: '選手契約年俸（年額）', exact: true });
  await expect(region).toContainText('集計不完全');
  await expect(region.locator('[data-payroll-category="total"]')).toContainText('確認済み 350万円');
  await expect(region).toContainText('未記録1人'); await expect(region).toContainText('不正値1人');
  const leaders = page.getByRole('region', { name: '年俸上位（所属選手）', exact: true });
  await expect(leaders).not.toContainText('二軍二百万円');
  await expect(region).toContainText('支払済み額ではありません');
});

test('finance opens an unrecorded salary leader safely without mutating saved clubs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await loadPayrollFixture(page, true, true);
  const before = await saveSnapshot(page);
  await openFinance(page, true);
  const leaders = page.getByRole('region', { name: '年俸上位（所属選手）', exact: true });
  await expect(leaders).toContainText('未記録');
  await leaders.getByRole('button', { name: '一軍百万円', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('一軍百万円');
  await page.getByRole('tab', { name: '概要', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('未記録', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '選手詳細を閉じる', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await saveSnapshot(page)).toEqual(before);
});
