import { test, expect } from '@playwright/test';
import { managementFixture, loadManagementFixture } from './helpers/management-fixture';
import { mainNavigation, reloadAndLoad, saveHub } from './helpers/progression';

async function open(page, tab) {
  await mainNavigation(page, page.viewportSize().width < 1024).getByRole('button', { name: /^経営/ }).click();
  const nav = page.getByRole('navigation', { name: '経営メニュー', exact: true });
  await nav.getByRole('button', { name: '概要', exact: true }).click();
  if (tab === 'contract') await nav.getByRole('button', { name: /^契約/ }).click();
  else await page.getByRole('button', { name: tab === 'scout' ? 'スカウト' : tab === 'fa' ? 'FA市場' : 'トレード', exact: true }).click();
}
const active = (page, tab) => page.locator(`[data-hub-route="${tab}"]:not([hidden])`);
const teamsHash = saved => JSON.stringify(saved.teams);

for (const width of [360, 390, 1440]) test(`management decisions ${width}px read-only selection, compare, cancel and return`, async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
  const f = managementFixture(); await loadManagementFixture(page, f.fixture);
  const before = teamsHash(await saveHub(page));
  await open(page, 'contract'); const contract = active(page, 'contract');
  const row = contract.getByRole('button', { name: `${f.contract.name}の契約を確認`, exact: true });
  await row.focus(); await page.keyboard.press('Enter');
  await expect(contract.getByRole('heading', { name: f.contract.name, exact: true })).toBeFocused();
  await contract.getByRole('button', { name: '提示条件を確認する', exact: true }).click();
  await expect(contract.getByRole('region', { name: '提示条件の最終確認' })).toContainText('提示時の予算控除はありません');
  await page.keyboard.press('Escape');
  await expect(contract.getByRole('button', { name: '提示条件を確認する', exact: true })).toBeFocused();
  await contract.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click(); await expect(row).toBeFocused();
  await open(page, 'scout'); const scout = active(page, 'scout');
  await scout.getByRole('button', { name: `${f.scout.name}の条件を見る`, exact: true }).click();
  await scout.getByRole('button', { name: '比較に追加', exact: true }).click();
  await scout.getByRole('button', { name: '契約条件を確認する', exact: true }).click();
  await expect(scout.getByRole('region', { name: 'スカウト契約の最終確認' })).toContainText('ファーム配属');
  await scout.getByRole('button', { name: '戻って見直す', exact: true }).click();
  await open(page, 'fa'); const fa = active(page, 'fa');
  await fa.getByRole('button', { name: '比較に追加', exact: true }).first().click();
  await page.getByRole('button', { name: '2人を比較', exact: true }).click();
  await expect(page.getByRole('dialog', { name: /選手比較/ })).toBeVisible(); await page.keyboard.press('Escape');
  await open(page, 'trade');
  await active(page, 'trade').getByRole('button', { name: `${f.other.name}と交渉する`, exact: true }).click();
  await active(page, 'trade').getByLabel(`${f.incoming.name}を獲得候補に選ぶ`, { exact: true }).check();
  await active(page, 'trade').getByLabel('支払金額（万円）', { exact: true }).fill('500');
  await active(page, 'trade').getByRole('button', { name: 'トレードを提案する', exact: true }).click();
  await active(page, 'trade').getByRole('button', { name: '戻って見直す', exact: true }).click();
  await expect(active(page, 'trade').getByLabel('支払金額（万円）', { exact: true })).toHaveValue('500');
  expect(teamsHash(await saveHub(page))).toBe(before);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('management decisions scout signing commits once and survives save/reload', async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementFixture(); await loadManagementFixture(page, f.fixture); await open(page, 'scout');
  await active(page, 'scout').getByRole('button', { name: `${f.scout.name}の条件を見る`, exact: true }).click();
  await active(page, 'scout').getByRole('button', { name: '契約条件を確認する', exact: true }).click();
  await active(page, 'scout').getByRole('button', { name: '契約を確定する', exact: true }).focus();
  await active(page, 'scout').getByRole('button', { name: '契約を確定する', exact: true }).evaluate(b => { b.click(); b.click(); });
  await expect(active(page, 'scout').getByRole('status').filter({ hasText: '契約を確定しました' })).toBeVisible();
  await expect(active(page, 'scout').getByRole('heading', { name: f.scout.name, exact: true })).toBeFocused();
  const saved = await saveHub(page), team = saved.teams.find(t => t.id === f.mine.id);
  expect(team.budget).toBe(f.mine.budget - 1000);
  expect(team.farm.filter(p => p.id === f.scout.id)).toHaveLength(1);
  expect(team.farm.find(p => p.id === f.scout.id).contractYearsLeft).toBe(2);
  expect(team.scoutResults.map(p => p.id)).toEqual(['ui04c-scout-1']);
  expect(saved.teams.filter(t => t.id !== f.mine.id)).toEqual(f.fixture.teams.filter(t => t.id !== f.mine.id));
  await reloadAndLoad(page); expect((await saveHub(page)).teams).toEqual(saved.teams);
});

test('management decisions contract offer persists as waiting without immediate payroll or budget mutation', async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementFixture(); await loadManagementFixture(page, f.fixture); const before = await saveHub(page);
  await open(page, 'contract');
  await active(page, 'contract').getByRole('button', { name: `${f.contract.name}の契約を確認`, exact: true }).click();
  await active(page, 'contract').getByLabel('提示年俸（万円）', { exact: true }).fill('1200');
  await active(page, 'contract').getByLabel('契約年数', { exact: true }).selectOption('2');
  await active(page, 'contract').getByRole('button', { name: '提示条件を確認する', exact: true }).click();
  await active(page, 'contract').getByRole('button', { name: 'この条件で最終オファー', exact: true }).evaluate(b => { b.click(); b.click(); });
  await expect(active(page, 'contract').getByRole('status').filter({ hasText: '回答待ち' })).toBeVisible();
  const saved = await saveHub(page); expect(saved.teams).toEqual(before.teams);
  const pending = saved.mailbox.filter(m => m.type === 'contract_decision_pending' && m.decision.playerId === f.contract.id);
  expect(pending).toHaveLength(1); expect(pending[0].decision).toMatchObject({ salary: 1200, years: 2 });
  await reloadAndLoad(page); await open(page, 'contract');
  await active(page, 'contract').getByRole('button', { name: `${f.contract.name}の契約を確認`, exact: true }).click();
  await expect(active(page, 'contract').getByRole('status').filter({ hasText: '回答待ち' })).toContainText('1,200万円');
});

test('management decisions notification opens exact proposal, resolves it once, and restores the original draft', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementFixture(); await loadManagementFixture(page, f.fixture); await open(page, 'trade');
  await active(page, 'trade').getByRole('button', { name: `${f.other.name}と交渉する`, exact: true }).click();
  await active(page, 'trade').getByLabel('支払金額（万円）', { exact: true }).fill('700');
  await page.getByRole('button', { name: /^通知（未読/ }).click();
  await active(page, 'mailbox').getByRole('button', { name: '今回検討する案件', exact: true }).click();
  await active(page, 'mailbox').getByRole('button', { name: 'トレード画面で検討する', exact: true }).click();
  const decision = active(page, 'trade').getByRole('region', { name: '選択したトレード案件' });
  await expect(decision.getByRole('heading', { name: '今回検討する案件', exact: true })).toBeVisible();
  await expect(decision.getByRole('heading', { name: '今回検討する案件', exact: true })).toBeFocused();
  await decision.getByRole('button', { name: '承諾内容を確認する', exact: true }).click();
  await active(page, 'trade').getByRole('button', { name: '承諾を確定する', exact: true }).evaluate(b => { b.click(); b.click(); });
  await expect(decision.getByText('この提案は対応済みです。再実行はできません。', { exact: true })).toBeVisible();
  const saved = await saveHub(page); expect(saved.teams.find(t => t.id === f.mine.id).budget).toBe(f.mine.budget + 500);
  expect(saved.seasonHistory.transfers.filter(t => t.type === 'trade')).toHaveLength(1);
  await decision.getByRole('button', { name: '交渉画面へ戻る', exact: true }).click();
  await expect(active(page, 'trade').getByLabel('支払金額（万円）', { exact: true })).toHaveValue('700');
  await page.getByRole('button', { name: /^通知（未読/ }).click();
  await active(page, 'mailbox').getByRole('button', { name: '今回検討する案件', exact: true }).click();
  await expect(active(page, 'mailbox').getByText('対応済み', { exact: true })).toBeVisible();
});

test('management decisions breakpoint boundaries preserve readable routes and saved clubs', async ({ page }) => {
  test.setTimeout(90000);
  const f = managementFixture(); await loadManagementFixture(page, f.fixture); const before = await saveHub(page);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const width of [760, 761, 1023, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ['contract', 'scout', 'trade']) {
      await open(page, tab);
      await expect(active(page, tab)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  }
  expect((await saveHub(page)).teams).toEqual(before.teams); expect(errors).toEqual([]);
});
