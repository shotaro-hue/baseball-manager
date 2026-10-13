import { test, expect } from '@playwright/test';
import { loadFixture, startSingle, saveHub, reloadAndLoad } from './helpers/progression';

test('opening single auto result AVG agrees with post-game saved opponent stats', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loadFixture(page, 'opening');
  await startSingle(page, true);
  await page.getByRole('button', { name: /オートシムモード/ }).click();
  const table = page.locator('.result-team-stats').nth(1).locator('tbody');
  await expect(table.locator('tr').first()).toBeVisible();
  const rows = await table.locator('tr').evaluateAll(nodes => nodes.map(node => ({
    name: node.querySelector('th').textContent, avg: node.querySelector('td').textContent,
  })));
  await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
  const saved = await saveHub(page);
  const opponentId = saved.gameResultsMap[1].oppTeam.id;
  const opponent = saved.teams.find(team => team.id === opponentId);
  const players = [...opponent.players, ...opponent.farm];
  expect(rows.length).toBeGreaterThanOrEqual(9);
  for (const row of rows) {
    const player = players.find(player => player.name === row.name);
    expect(player).toBeDefined();
    const { AB, H } = player.stats;
    expect(row.avg, row.name).toBe(AB ? `.${String(Math.round(H / AB * 1000)).padStart(3, '0')}` : '.---');
  }
  await reloadAndLoad(page);
  expect((await saveHub(page)).teams).toEqual(saved.teams);
});
