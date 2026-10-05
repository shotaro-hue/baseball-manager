import { test, expect } from '@playwright/test';

async function mount(page, view) {
  await page.goto('/');
  await page.evaluate(async (view) => {
    const React = await import('/node_modules/.vite/deps/react.js');
    const { createRoot } = await import('/node_modules/.vite/deps/react-dom_client.js');
    const { TeamDetailScreen } = await import('/src/components/TeamDetailScreen.jsx');
    const { PlayerComparisonDialog } = await import('/src/components/PlayerComparisonTray.jsx');
    const { emptyStats } = await import('/src/engine/playerCore.js');
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
  await expect(page.getByRole('region', { name: '選手比較表' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(close).toBeFocused();
  expect(await dialog.evaluate(n => n.scrollWidth <= n.clientWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(open).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
