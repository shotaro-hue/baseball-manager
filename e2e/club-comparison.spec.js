import { test, expect } from '@playwright/test';

async function mount(page, view) {
  await page.goto('/');
  await page.evaluate(async (view) => {
    const { default: React } = await import('/baseball-manager/node_modules/.vite/deps/react.js');
    const { createRoot } = (await import('/baseball-manager/node_modules/.vite/deps/react-dom_client.js')).default;
    const { TeamDetailScreen } = await import('/baseball-manager/src/components/TeamDetailScreen.jsx');
    const { PlayerComparisonDialog } = await import('/baseball-manager/src/components/PlayerComparisonTray.jsx');
    const { emptyStats } = await import('/baseball-manager/src/engine/playerCore.js');
    document.getElementById('root').style.display = 'none';
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host), h = React.createElement;
    const pitcher = { id: 0, name: '投手ゼロ', age: 25, isPitcher: true, stats: { ...emptyStats(), IP: 9 } };
    const team = { id: 0, name: '球団ゼロ', league: 'セ', wins: 1, losses: 0, players: [pitcher] };
    if (view === 'team') {
      root.render(h(TeamDetailScreen, { team, myTeam: { ...team, id: 1 }, allTeams: [team], onBack: () => {}, onPlayerClick: () => {}, onOpenTrade: () => {} }));
    } else {
      const opener = document.createElement('button'); opener.textContent = '比較を開く'; document.body.prepend(opener);
      opener.onclick = () => root.render(h(PlayerComparisonDialog, {
        players: [pitcher, { ...pitcher, id: 1, name: '相手投手' }],
        onClose: () => root.render(null), onRemove: () => root.render(null),
      }));
    }
  }, view);
}

test('mobile club keeps tables local and comparison optional', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, 'team');
  await page.getByRole('button', { name: '投手', exact: true }).click();
  await expect(page.getByRole('button', { name: '投手ゼロ' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const table = page.getByRole('region', { name: '球団の選手成績' });
  expect(await table.evaluate(n => n.scrollWidth > n.clientWidth)).toBe(true);
  await table.evaluate(n => { n.scrollLeft = 250; });
  await expect(page.getByRole('button', { name: '投手ゼロ' })).toBeInViewport();
  await page.getByRole('button', { name: '自球団との戦力を比較' }).click();
  await expect(page.getByRole('heading', { name: '自球団との戦力比較' })).toBeVisible();
});

test('comparison traps focus, closes with Escape and restores opener', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page, 'comparison');
  const open = page.getByRole('button', { name: '比較を開く' });
  await open.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const close = page.getByRole('button', { name: '選手比較を閉じる' });
  await expect(close).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '元の画面に戻る', exact: true })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  const table = page.getByRole('region', { name: '選手比較表' });
  await table.focus(); await expect(table).toBeFocused();
  expect(await dialog.evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(open).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});

// Actual App navigation and save/load; the component-only scenarios above
// continue to protect the small-screen table and dialog behaviors separately.
async function loadComparisonFixture(page, incomplete) {
  const { readFileSync } = await import('node:fs');
  const { gunzipSync } = await import('node:zlib');
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
  await page.goto('/');
  const opponentName = await page.evaluate(async ({ fixture, incomplete }) => {
    const { emptyStats } = await import('/baseball-manager/src/engine/playerCore.js');
    const { saveGame } = await import('/baseball-manager/src/engine/saveload.js');
    for (const club of fixture.teams) for (const player of [...club.players, ...club.farm]) {
      player.stats = emptyStats(); player.salary = 0; player.育成 = false;
    }
    const club = fixture.teams.find(t => t.id === fixture.myId);
    const opponent = fixture.teams.find(t => t.league === club.league && t.id !== club.id);
    const hitter = club.farm.find(p => !p.isPitcher);
    Object.assign(hitter, { salary: 200, stats: { ...emptyStats(), AB: 4, PA: 4, battedBallProfile: { bip: 4, hardHit: 2 } }, stats2: { AB: 100, H: 100 } });
    const starter = club.farm.find(p => p.isPitcher);
    Object.assign(starter, { subtype: '先発', stats: { ...emptyStats(), IP: 9, ER: 0 }, stats2: { IP: 9, ER: 90 } });
    const relief = club.players.find(p => p.isPitcher && !club.rotation.includes(p.id));
    Object.assign(relief, { subtype: '中継ぎ', salary: 100, stats: { ...emptyStats(), IP: 3, ER: 0 } });
    const development = club.farm.find(p => p.id !== hitter.id && p.id !== starter.id);
    Object.assign(development, { salary: 50, 育成: true });
    const otherStarter = opponent.players.find(p => p.isPitcher);
    Object.assign(otherStarter, { subtype: '先発', stats: { ...emptyStats(), IP: 9, ER: 2 } });
    if (incomplete) { hitter.salary = null; development.salary = '50'; }
    if (!(await saveGame(fixture)).ok) throw new Error('comparison fixture save failed');
    return opponent.name;
  }, { fixture, incomplete });
  const { reloadAndLoad } = await import('./helpers/progression');
  await reloadAndLoad(page);
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeVisible();
  return opponentName;
}
async function comparisonSnapshot(page) {
  const { waitSaveIdle } = await import('./helpers/progression');
  await waitSaveIdle(page);
  await page.getByRole('button', { name: '保存', exact: true }).click();
  await waitSaveIdle(page);
  return page.evaluate(async () => {
    const saved = await (await import('/baseball-manager/src/engine/saveload.js')).loadGame();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(saved.teams)));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  });
}
async function openComparison(page, width, opponentName) {
  const { mainNavigation } = await import('./helpers/progression');
  await mainNavigation(page, width < 1024).getByRole('button', { name: '成績', exact: true }).click();
  await page.getByRole('button', { name: '順位表', exact: true }).click();
  await page.getByRole('button').filter({ hasText: opponentName }).click();
  await page.getByRole('button', { name: '自球団との戦力を比較', exact: true }).click();
  await expect(page.getByRole('region', { name: '球団比較表', exact: true })).toBeVisible();
}
for (const [width, incomplete] of [[360, false], [390, false], [1440, false], [390, true]]) {
  test(`club comparison ${width}px ${incomplete ? 'incomplete' : 'recorded'} preserves demoted stats and annual payroll through save/load`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    const opponentName = await loadComparisonFixture(page, incomplete);
    const before = await comparisonSnapshot(page);
    await openComparison(page, width, opponentName);
    const region = page.getByRole('region', { name: '球団比較表', exact: true });
    const row = label => region.getByRole('row').filter({ has: page.getByRole('cell', { name: label, exact: true }) });
    await expect(row('打線 OPS').getByRole('cell').nth(1)).toHaveText('0.0001/1位');
    await expect(row('先発 ERA').getByRole('cell').nth(1)).toHaveText('0.001/2位');
    await expect(row('救援 ERA').getByRole('cell').nth(1)).toHaveText('0.001/1位');
    await expect(row('強打球率').getByRole('cell').nth(1)).toContainText('50.0%');
    const payroll = row('総年俸').getByRole('cell').nth(1);
    await expect(payroll).toContainText(incomplete ? '確認済み 100万円（集計不完全・未記録1人・不正値1人）' : '350万円');
    await expect(row('打線 OPS').getByRole('cell').nth(2)).toHaveText('---');
    await region.screenshot({ path: testInfo.outputPath('comparison-metrics.png') });
    const display = await region.innerText();
    await page.getByRole('button', { name: '← 戻る', exact: true }).click();
    expect(await comparisonSnapshot(page)).toEqual(before);
    const { reloadAndLoad } = await import('./helpers/progression');
    await reloadAndLoad(page);
    await openComparison(page, width, opponentName);
    expect(await region.innerText()).toEqual(display);
    await page.getByRole('button', { name: '← 戻る', exact: true }).click();
    expect(await comparisonSnapshot(page)).toEqual(before);
  });
}
