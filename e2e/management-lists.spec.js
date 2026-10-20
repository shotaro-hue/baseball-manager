import { test, expect } from '@playwright/test';
import { managementLoadFixture } from './helpers/management-load-fixture';
import { loadManagementFixture } from './helpers/management-fixture';
import { mainNavigation, reloadAndLoad, saveHub } from './helpers/progression';
import { seedPlanning, savePlanning } from './helpers/planning-app-cases';

const active = (page, tab) => page.locator(`[data-hub-route="${tab}"]:not([hidden])`);
const faFixture = '/baseball-manager/e2e/fixtures/ui03c/index.html';
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

// The FA layout follows its available content width, including embedded markets.
async function faDetailLayout(market, count, testInfo) {
  const measured = await market.locator('.fa-body').evaluate(el => ({
    width: el.getBoundingClientRect().width,
    rows: el.querySelectorAll('.player-list-row').length,
    listDisplay: getComputedStyle(el.querySelector('.fa-list')).display,
  }));
  await testInfo.attach('FA layout', { body: JSON.stringify(measured), contentType: 'application/json' });
  const split = measured.width >= 800;
  await expect(market.locator('.fa-list')).toBeVisible({ visible: split });
  await expect(market.locator('.player-list-row')).toHaveCount(split ? count : 0);
}

for (const width of [360, 390, 760, 761, 780, 799, 800, 801, 1023, 1024, 1440]) {
  test(`management lists FA ${width}px suspends only hidden rows and restores the deep filtered row`, async ({ page }, testInfo) => {
    test.setTimeout(60000); await page.setViewportSize({ width, height: 900 });
    const f = managementLoadFixture(); await loadManagementFixture(page, f.fixture);
    const market = (await open(page, 'fa')).locator('[data-ds="fa-market"]');
    await expect(market.locator('.player-list-row')).toHaveCount(240);
    await market.getByLabel('選手名', { exact: true }).fill('市場候補0');
    await market.getByLabel('並び順', { exact: true }).selectOption('salary');
    await expect(market.locator('.player-list-row')).toHaveCount(100);
    const ids = await market.locator('.player-list-row').evaluateAll(nodes => nodes.map(n => n.dataset.playerId));
    expect(ids).toEqual(Array.from({ length: 100 }, (_, i) => `load-fa-${i}`));
    const row = market.locator('.player-list-row').nth(70), id = await row.getAttribute('data-player-id');
    await row.scrollIntoViewIfNeeded(); const before = await row.boundingBox();
    await row.focus(); await page.keyboard.press('Enter');
    await expect(market.locator('.fa-player-heading h3')).toBeFocused();
    await faDetailLayout(market, 100, testInfo); await layout(market, page);
    await market.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
    const restored = market.locator(`[data-player-id="${id}"]`);
    await expect(restored).toBeFocused();
    expect(Math.abs((await restored.boundingBox()).y - before.y)).toBeLessThan(4);
    await expect(market.getByLabel('選手名', { exact: true })).toHaveValue('市場候補0');
    await expect(market.getByLabel('並び順', { exact: true })).toHaveValue('salary');
    expect(await market.locator('.player-list-row').evaluateAll(nodes => nodes.map(n => n.dataset.playerId))).toEqual(ids);
    await layout(market, page);
  });
}

for (const container of [500, 799, 799.5, 800, 801]) {
  test(`management lists FA embedded ${container}px uses container width for DOM and layout`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${faFixture}?state=many&embedded&container=${container}&spacer`);
    const market = page.locator('[data-ds="fa-market"]');
    await expect(market.locator('.player-list-row')).toHaveCount(30);
    expect(await market.locator('.fa-body').evaluate(el => el.getBoundingClientRect().width)).toBe(container);
    const row = market.getByRole('button', { name: '候補22の条件を見る', exact: true });
    await row.scrollIntoViewIfNeeded(); const before = await row.boundingBox(); await row.click();
    await faDetailLayout(market, 30, testInfo); await layout(market, page);
    await market.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
    await expect(row).toBeFocused(); expect(Math.abs((await row.boundingBox()).y - before.y)).toBeLessThan(4);
  });
}

test('management lists FA observes container-only resize while retaining the selected candidate', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${faFixture}?state=many&embedded&container=801`);
  const market = page.locator('[data-ds="fa-market"]');
  await market.getByRole('button', { name: '候補22の条件を見る', exact: true }).click();
  for (const width of [801, 799.5, 800, 500, 801]) {
    await page.locator('#root > div').evaluate((el, width) => { el.style.maxWidth = `${width}px`; }, width);
    await expect.poll(() => market.locator('.fa-body').evaluate(el => el.getBoundingClientRect().width)).toBe(width);
    await faDetailLayout(market, 30, testInfo);
    await expect(market.locator('.fa-player-heading h3')).toHaveText('候補22');
    if (width >= 800) await expect(market.locator('[data-player-id="22"]')).toHaveAttribute('aria-current', 'true');
    await layout(market, page);
  }
  await market.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
  await expect(market.locator('[data-player-id="22"]')).toBeFocused();
});

for (const change of ['removed', 'signed']) {
  test(`management lists FA embedded candidate ${change} restores the next filtered row`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${faFixture}?state=many&embedded&container=799&spacer`);
    const market = page.locator('[data-ds="fa-market"]');
    await market.getByLabel('選手名', { exact: true }).fill('候補2');
    await market.getByLabel('並び順', { exact: true }).selectOption('salary');
    const row = market.getByRole('button', { name: '候補22の条件を見る', exact: true });
    await row.scrollIntoViewIfNeeded(); const before = await row.boundingBox(); await row.click();
    await faDetailLayout(market, 11, testInfo);
    if (change === 'removed') {
      await page.evaluate(() => window.marketFixture.remove(22));
      await expect(market.locator('.fa-detail')).toContainText('この選手は現在の市場にいません');
      await expect(market.getByRole('button', { name: '契約条件を確認する', exact: true })).toHaveCount(0);
    } else {
      await market.getByRole('button', { name: '契約条件を確認する', exact: true }).click();
      await expect(page.getByRole('dialog')).toContainText('契約総額：1,000万円');
      await page.getByRole('button', { name: '戻って見直す', exact: true }).click();
      expect(await page.evaluate(() => window.marketFixture.snapshot().teams[0].budget)).toBe(10000);
      await market.getByRole('button', { name: '契約条件を確認する', exact: true }).click();
      await page.getByRole('button', { name: '契約を確定する', exact: true }).evaluate(el => { el.click(); el.click(); });
      await expect(market.locator('.fa-detail')).toContainText('契約完了');
      expect(await page.evaluate(() => ({ budget: window.marketFixture.snapshot().teams[0].budget, signs: document.body.dataset.signs }))).toEqual({ budget: 9000, signs: '1' });
    }
    await market.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
    const next = market.getByRole('button', { name: '候補23の条件を見る', exact: true });
    await expect(next).toBeFocused(); expect(Math.abs((await next.boundingBox()).y - before.y)).toBeLessThan(4);
    await expect(market.locator('.player-list-row')).toHaveCount(10);
    await expect(market.getByLabel('選手名', { exact: true })).toHaveValue('候補2');
    await expect(market.getByLabel('並び順', { exact: true })).toHaveValue('salary');
    await layout(market, page);
  });
}

test('management lists FA foreign negotiation and signing stay available between viewport breakpoints', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 780, height: 900 });
  await page.goto(`${faFixture}?state=foreign`);
  const market = page.locator('[data-ds="fa-market"]');
  await market.getByRole('button', { name: '候補0の条件を見る', exact: true }).click();
  await faDetailLayout(market, 2, testInfo);
  await market.getByRole('button', { name: '交渉開始', exact: true }).click();
  await market.getByRole('button', { name: '条件を受ける', exact: true }).click();
  await market.getByRole('button', { name: '契約条件を確認する', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('2,400万円');
  await page.getByRole('button', { name: '契約を確定する', exact: true }).click();
  await expect(market.locator('.fa-detail')).toContainText('契約完了');
  expect(await page.evaluate(() => window.marketFixture.snapshot().teams[0].budget)).toBe(7600);
  await market.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
  await expect(market.getByRole('button', { name: '候補1の条件を見る', exact: true })).toBeFocused();
  await expect(market.locator('.player-list-row')).toHaveCount(1); await layout(market, page);
});

test('management lists FA restores the saved embedded detail and filters after reload', async ({ page }, testInfo) => {
  test.setTimeout(90000); await page.setViewportSize({ width: 780, height: 900 });
  await seedPlanning(page);
  await page.getByRole('button', { name: '交渉・補強を始める', exact: true }).click();
  const market = page.locator('[data-ds="fa-market"]');
  await market.getByLabel('選手名', { exact: true }).fill('編成確認');
  await market.getByLabel('並び順', { exact: true }).selectOption('salary');
  await market.getByRole('button', { name: '編成確認FA候補の条件を見る', exact: true }).click();
  await market.getByLabel('契約年数', { exact: true }).selectOption('3');
  const saved = await savePlanning(page);
  await reloadAndLoad(page);
  await expect(market.locator('.fa-player-heading h3')).toHaveText('編成確認FA候補');
  await expect(market.getByLabel('契約年数', { exact: true })).toHaveValue('3');
  await faDetailLayout(market, 1, testInfo); await layout(market, page);
  await market.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
  await expect(market.getByRole('button', { name: '編成確認FA候補の条件を見る', exact: true })).toBeFocused();
  await expect(market.getByLabel('選手名', { exact: true })).toHaveValue('編成確認');
  await expect(market.getByLabel('並び順', { exact: true })).toHaveValue('salary');
  expect((await savePlanning(page)).teams).toEqual(saved.teams);
});

test('management lists FA observer lifecycle handles loading teams and hidden retained routes', async ({ page }, testInfo) => {
  test.setTimeout(60000); await page.setViewportSize({ width: 1440, height: 900 });
  for (const container of [799, 800]) {
    await page.goto(`${faFixture}?state=many&embedded&container=${container}&loading`);
    const market = page.locator('[data-ds="fa-market"]');
    await expect(market).toContainText('球団情報を読み込み中');
    await page.evaluate(() => window.marketFixture.load());
    await expect(market.locator('.player-list-row')).toHaveCount(30);
    await market.getByRole('button', { name: '候補22の条件を見る', exact: true }).click();
    await faDetailLayout(market, 30, testInfo);
    await market.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
    await expect(market.locator('[data-player-id="22"]')).toBeFocused();
  }
  const f = managementLoadFixture(); await loadManagementFixture(page, f.fixture);
  const route = await open(page, 'fa'), market = route.locator('[data-ds="fa-market"]');
  await market.getByRole('button', { name: '市場候補022の条件を見る', exact: true }).click();
  await faDetailLayout(market, 240, testInfo);
  await page.getByRole('button', { name: /^通知（未読/ }).click();
  await expect(page.locator('[data-hub-route="fa"]')).toBeHidden();
  await page.getByRole('button', { name: '元の画面へ戻る', exact: true }).click();
  await expect(market.locator('.fa-player-heading h3')).toHaveText('市場候補022');
  await faDetailLayout(market, 240, testInfo);
  await expect(market.locator('[data-player-id="load-fa-22"]')).toHaveAttribute('aria-current', 'true');
  await market.getByRole('button', { name: '← 選手一覧に戻る', exact: true }).click();
  await expect(market.locator('[data-player-id="load-fa-22"]')).toBeFocused();
});

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
