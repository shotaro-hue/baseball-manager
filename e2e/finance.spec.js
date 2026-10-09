import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { mainNavigation, reloadAndLoad, saveHub } from './helpers/progression';

for (const width of [360, 390, 1440]) {
  test(`finance annual salary and read-only save/reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
    const t = fixture.teams.find(t => t.id === fixture.myId);
    t.players.forEach((p, i) => { p.salary = i + 1; p.育成 = false; });
    t.farm.forEach((p, i) => { p.salary = 1000 + i; p.育成 = i === 0; });
    t.scoutResults = [{ ...t.farm[0], id: 'uncontracted', salary: 999999 }];
    await page.goto('/');
    await page.evaluate(async fixture => {
      const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
      if (!(await saveGame(fixture)).ok) throw new Error('finance fixture save failed');
    }, fixture);
    await reloadAndLoad(page);
    const before = await saveHub(page);
    async function openFinance() {
      await mainNavigation(page, width < 760).getByRole('button', { name: /その他/ }).click();
      await page.getByRole('button', { name: '球団運営', exact: true }).click();
      await expect(page.getByText('予算 / 年俸上位', { exact: true })).toBeVisible();
    }
    await openFinance();
    await page.screenshot({ path: `docs/qa/finance/${process.env.FINANCE_BEFORE ? 'before' : 'after'}-${width}.png`, fullPage: true });
    const salary = page.getByRole('region', { name: '選手契約年俸（年額）' });
    const { fmtSal } = await import('../src/utils.js');
    const active = t.players.reduce((s, p) => s + p.salary, 0);
    const farm = t.farm.filter(p => !p.育成).reduce((s, p) => s + p.salary, 0);
    const development = t.farm.filter(p => p.育成).reduce((s, p) => s + p.salary, 0);
    for(const [label, amount] of [['一軍支配下', active], ['二軍支配下', farm], ['育成', development], ['合計', active + farm + development]]) {
      await expect(salary.locator('.finance-salary-row').filter({ hasText: label })).toContainText(fmtSal(amount));
    }
    const top = page.getByRole('region', { name: '契約年俸上位' });
    const names = [...t.players, ...t.farm].sort((a,b) => b.salary - a.salary).slice(0,6).map(p => p.name);
    expect(await top.locator('.finance-player-name').allTextContents()).toEqual(names);
    const box = await salary.boundingBox(); expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(await salary.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await salary.locator('.mono').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14);
    await mainNavigation(page, width < 760).getByRole('button', { name: 'ホーム', exact: true }).click();
    await openFinance();
    const saved = await saveHub(page);
    expect(saved.teams).toEqual(before.teams);
    await reloadAndLoad(page);
    await openFinance();
    expect((await saveHub(page)).teams).toEqual(saved.teams);
    await expect(salary).toContainText(fmtSal(active + farm + development));
    expect(await top.locator('.finance-player-name').allTextContents()).toEqual(names);
    expect(errors).toEqual([]);
  });
}

test('finance distinguishes zero, missing and invalid salary after real reload', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
  const t = fixture.teams.find(t => t.id === fixture.myId);
  t.players.forEach(p => { p.salary = 0; p.育成 = false; });
  t.farm.forEach(p => { p.salary = 0; p.育成 = true; });
  delete t.players[0].salary; t.farm[0].salary = -1;
  await page.goto('/');
  await page.evaluate(async fixture => {
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    if (!(await saveGame(fixture)).ok) throw new Error('finance incomplete fixture save failed');
  }, fixture);
  await reloadAndLoad(page);
  await mainNavigation(page, true).getByRole('button', { name: /その他/ }).click();
  await page.getByRole('button', { name: '球団運営', exact: true }).click();
  const salary = page.getByRole('region', { name: '選手契約年俸（年額）' });
  await expect(salary).toContainText('合計は不完全');
  await expect(salary).toContainText('年俸未記録 1人・不正値 1人');
  await expect(salary.locator('.finance-salary-total')).toContainText('0万円');
  await expect(salary.locator('.finance-salary-total')).toContainText('確認できた分');
  await expect(page.getByRole('region', { name: '契約年俸上位' })).not.toContainText(t.players[0].name);
  await page.screenshot({ path: 'docs/qa/finance/incomplete-360.png', fullPage: true });
  expect(await salary.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
