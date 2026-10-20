import { test, expect } from '@playwright/test';
import { managementLoadFixture } from './helpers/management-load-fixture';
import { loadManagementFixture } from './helpers/management-fixture';
import { mainNavigation, saveHub } from './helpers/progression';

const active = (page, tab) => page.locator(`[data-hub-route="${tab}"]:not([hidden])`);
async function open(page, tab) {
  await mainNavigation(page, page.viewportSize().width < 1024).getByRole('button', { name: /^経営/ }).click();
  const nav = page.getByRole('navigation', { name: '経営メニュー', exact: true });
  await nav.getByRole('button', { name: '概要', exact: true }).click();
  if (tab === 'contract') await nav.getByRole('button', { name: /^契約/ }).click();
  else await page.getByRole('button', { name: { trade: 'トレード', scout: 'スカウト', fa: 'FA市場' }[tab], exact: true }).click();
  return active(page, tab);
}
async function layout(route, page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await route.evaluate(el => [...el.querySelectorAll('*')].filter(n => n.getClientRects().length && n.scrollHeight > n.clientHeight + 1 && ['auto', 'scroll'].includes(getComputedStyle(n).overflowY)).map(n => n.className))).toEqual([]);
  expect(await route.locator('button,input:not([type=checkbox]),select,summary').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && n.getBoundingClientRect().height < 44).map(n => n.textContent))).toEqual([]);
}

for (const width of [360, 390, 1440]) test(`management lists ${width}px preserve deep row, filters and focus while unmounting mobile rows`, async ({ page }) => {
  test.setTimeout(120000); await page.setViewportSize({ width, height: width === 360 ? 800 : 844 });
  const f = managementLoadFixture(); await loadManagementFixture(page, f.fixture); const before = (await saveHub(page)).teams;
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  for (const tab of ['contract', 'scout', 'fa']) {
    const route = await open(page, tab); await layout(route, page);
    const row = route.locator('.player-list-row').nth(25), label = await row.getAttribute('aria-label');
    await row.scrollIntoViewIfNeeded(); const previous = await row.boundingBox();
    await row.focus(); await page.keyboard.press('Enter');
    if (width <= 760) await expect(route.locator('.player-list-row')).toHaveCount(0);
    await route.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
    const restored = route.getByRole('button', { name: label, exact: true }); await expect(restored).toBeFocused();
    expect(Math.abs((await restored.boundingBox()).y - previous.y)).toBeLessThan(4);
    const search = route.getByLabel(tab === 'scout' ? '候補の選手名' : '選手名', { exact: true });
    await search.fill(tab === 'contract' ? '二軍候補' : tab === 'scout' ? '調査候補09' : '市場候補09');
    await route.locator('.player-list-row').first().click();
    await route.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
    await expect(search).toHaveValue(tab === 'contract' ? '二軍候補' : tab === 'scout' ? '調査候補09' : '市場候補09');
    await layout(route, page);
  }
  expect((await saveHub(page)).teams).toEqual(before); expect(errors).toEqual([]);
});

test('management lists trade searches both clubs, retains selection and compares only selected players', async ({ page }) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementLoadFixture(); await loadManagementFixture(page, f.fixture); const before = (await saveHub(page)).teams;
  const route = await open(page, 'trade');
  await route.getByRole('button', { name: `${f.other.name}と交渉する`, exact: true }).click();
  const outgoing = f.mine.farm.at(-1);
  await route.getByLabel('選手名', { exact: true }).fill(outgoing.name);
  await route.getByLabel(`${outgoing.name}を放出候補に選ぶ`, { exact: true }).check();
  await route.getByRole('button', { name: '獲得候補を選ぶ', exact: true }).click();
  await route.getByLabel('選手名', { exact: true }).fill(f.incoming.name);
  await route.getByLabel(`${f.incoming.name}を獲得候補に選ぶ`, { exact: true }).check();
  await expect(route.getByRole('region', { name: '選択したトレード選手' })).toContainText('放出 1人');
  await expect(route.getByRole('region', { name: '選択したトレード選手' })).toContainText('獲得 1人');
  await route.getByRole('button', { name: '選択した選手を比較', exact: true }).click();
  await expect(route.getByRole('region', { name: '選択済み選手の比較' }).locator('[aria-label="保存された一軍成績"]')).toHaveCount(2);
  await route.getByRole('button', { name: '放出候補を選ぶ', exact: true }).click();
  await expect(route.getByLabel('選手名', { exact: true })).toHaveValue(outgoing.name);
  await expect(route.getByLabel(`${outgoing.name}を放出候補に選ぶ`, { exact: true })).toBeChecked();
  await layout(route, page); expect((await saveHub(page)).teams).toEqual(before);
});

test('management lists scout deletion restores the next stable candidate at the original position', async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementLoadFixture(); await loadManagementFixture(page, f.fixture);
  const route = await open(page, 'scout'), row = route.getByRole('button', { name: '調査候補050の条件を見る', exact: true });
  await row.scrollIntoViewIfNeeded(); const previous = await row.boundingBox(); await row.click();
  await route.getByText('報告の整理', { exact: true }).click(); await route.getByRole('button', { name: '候補から外す', exact: true }).click();
  await route.getByRole('button', { name: '候補から外すことを確定', exact: true }).click();
  await route.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
  const next = route.getByRole('button', { name: '調査候補051の条件を見る', exact: true }); await expect(next).toBeFocused();
  expect(Math.abs((await next.boundingBox()).y - previous.y)).toBeLessThan(4);
  const mine = (await saveHub(page)).teams.find(t => t.id === f.mine.id);
  expect(mine.scoutResults.map(p => p.id)).not.toContain('load-scout-50'); expect(mine.budget).toBe(f.mine.budget);
});

test('management lists contract badge matches actionable active, farm and ikusei players', async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementLoadFixture(); f.mine.players[0].contractSignedYear = f.fixture.year;
  f.fixture.mailbox.push({ id: 'load-waiting', type: 'contract_decision_pending', deliverOnDay: f.fixture.gameDay + 4,
    decision: { playerId: f.mine.farm[0].id, teamId: f.mine.id, offeredYear: f.fixture.year, salary: 1000, years: 1, accepted: true } });
  await loadManagementFixture(page, f.fixture); const route = await open(page, 'contract');
  const count = await route.locator('.player-list-row').count();
  await expect(page.getByRole('navigation', { name: '経営メニュー', exact: true }).getByRole('button', { name: /^契約/ })).toContainText(`要対応 ${count}`);
  await route.getByLabel('契約状態', { exact: true }).selectOption('waiting'); await expect(route.locator('.player-list-row')).toHaveCount(1);
  await route.getByLabel('契約状態', { exact: true }).selectOption('signed'); await expect(route.locator('.player-list-row')).toHaveCount(1);
  await route.getByLabel('契約状態', { exact: true }).selectOption('all');
  await route.getByText('絞り込み・並び順', { exact: true }).click();
  await route.getByLabel('所属', { exact: true }).selectOption('ikusei');
  expect(await route.locator('.player-list-row').count()).toBeGreaterThanOrEqual(5);
});

test('management lists breakpoint boundaries keep page scrolling and no horizontal overflow', async ({ page }) => {
  test.setTimeout(120000); const f = managementLoadFixture(); await loadManagementFixture(page, f.fixture);
  for (const width of [760, 761, 1023, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const tab of ['contract', 'scout', 'trade', 'fa']) {
      const route = await open(page, tab);
      if (tab === 'trade') await route.getByRole('button', { name: `${f.other.name}と交渉する`, exact: true }).click();
      await layout(route, page);
    }
  }
});

test('management lists notification for a departed ID replaces the previous contract detail safely', async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementLoadFixture();
  f.fixture.mailbox.push({ id: 'departed-reply', type: 'contract_reply', title: '退団済み選手の契約回答', read: false, resolved: true,
    body: '対象選手は現在所属していません。', decision: { playerId: 'departed-player', teamId: f.mine.id, offeredYear: f.fixture.year } });
  await loadManagementFixture(page, f.fixture); const route = await open(page, 'contract');
  await route.getByRole('button', { name: `${f.contract.name}の契約を確認`, exact: true }).click();
  await page.getByRole('button', { name: /^通知（未読/ }).click();
  await active(page, 'mailbox').getByRole('button', { name: '退団済み選手の契約回答', exact: true }).click();
  await active(page, 'mailbox').getByRole('button', { name: 'この選手の契約状況を見る', exact: true }).click();
  await expect(route.getByRole('heading', { name: 'この選手は現在所属していません', exact: true })).toBeFocused();
  await expect(route.getByRole('heading', { name: f.contract.name, exact: true })).toHaveCount(0);
  await expect(route.getByRole('button', { name: '提示条件を確認する', exact: true })).toHaveCount(0);
  await route.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
  await expect(route.getByRole('region', { name: '所属選手の契約一覧' })).toBeVisible();
  await expect(route.getByLabel('選手名', { exact: true })).toBeFocused();
});

test('management lists scout dispatch roundtrip preserves the report row focus on return', async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementLoadFixture(); await loadManagementFixture(page, f.fixture); const route = await open(page, 'scout');
  const row = route.getByRole('button', { name: '調査候補030の条件を見る', exact: true });
  await row.scrollIntoViewIfNeeded(); const position = await row.boundingBox(); await row.click();
  await route.getByRole('button', { name: '派遣先・調査中', exact: true }).click();
  await route.getByRole('button', { name: '報告済み候補', exact: true }).click();
  await route.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
  await expect(row).toBeFocused(); expect(Math.abs((await row.boundingBox()).y - position.y)).toBeLessThan(4);
});

test('management lists trade comparison reachable from a deep picker and side switches keep keyboard context', async ({ page }) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 390, height: 844 });
  const f = managementLoadFixture(); await loadManagementFixture(page, f.fixture); const route = await open(page, 'trade');
  await route.getByRole('button', { name: `${f.other.name}と交渉する`, exact: true }).click();
  await route.locator('input[type=checkbox]').first().check();
  await route.locator('.player-list-row').nth(25).click();
  const incoming = route.getByRole('button', { name: '獲得候補を選ぶ', exact: true }); await incoming.click();
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await expect(incoming).toBeFocused();
  await route.locator('.player-list-row').last().scrollIntoViewIfNeeded();
  await expect(route.getByRole('region', { name: '選択したトレード選手' })).toBeInViewport();
  await route.getByRole('button', { name: '選択した選手を比較', exact: true }).click();
  await expect(route.getByRole('heading', { name: '選択済み選手の比較', exact: true })).toBeFocused();
  await expect(route.getByRole('heading', { name: '選択済み選手の比較', exact: true })).toBeInViewport();
});
