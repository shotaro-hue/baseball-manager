import { test, expect } from '@playwright/test';

async function mount(page) {
  await page.goto('/');
  await page.evaluate(async () => {
    const React = await import('/baseball-manager/node_modules/.vite/deps/react.js');
    const { createRoot } = await import('/baseball-manager/node_modules/.vite/deps/react-dom_client.js');
    const { ContractRenewalPhaseScreen } = await import('/baseball-manager/src/components/ContractRenewalPhaseScreen.jsx');
    const { emptyStats } = await import('/baseball-manager/src/engine/playerCore.js');
    const { calcPlayerDemand } = await import('/baseball-manager/src/engine/contract.js');
    document.getElementById('root').style.display = 'none';
    const host = document.createElement('div'); document.body.append(host);
    const players = Array.from({ length: 20 }, (_, id) => ({ id, name: `選手${id}`, age: 25, pos: '外野', salary: 1000, contractYearsLeft: 1, stats: emptyStats() }));
    const props = { teams: [{ id: 0, name: '球団', players }], myId: 0, year: 2026, demands: Object.fromEntries(players.map(p => [p.id, calcPlayerDemand(p)])), onSign: () => {}, onRelease: () => {}, onNext: () => {} };
    createRoot(host).render(React.createElement(ContractRenewalPhaseScreen, props));
  });
}

test('mobile negotiation preserves drafts, list focus and scroll without page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page);
  const row = page.getByRole('button', { name: '選手15の契約更改', exact: true });
  await row.scrollIntoViewIfNeeded();
  const previousY = await page.evaluate(() => scrollY);
  await row.click();
  await expect(page.getByRole('heading', { name: '選手15', exact: true })).toBeFocused();
  await expect(row).not.toBeVisible();
  await page.getByLabel('提示年俸（万円）').fill('1234');
  await page.getByLabel('契約年数').selectOption('3');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '← 選手一覧に戻る' }).click();
  await expect(row).toBeFocused();
  expect(Math.abs(await page.evaluate(() => scrollY) - previousY)).toBeLessThan(10);
  await row.click();
  await expect(page.getByLabel('提示年俸（万円）')).toHaveValue('1234');
  await expect(page.getByLabel('契約年数')).toHaveValue('3');
});

test('release dialog traps focus, closes with Escape and restores opener', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await mount(page);
  await page.getByRole('button', { name: '選手0の契約更改', exact: true }).click();
  const opener = page.getByRole('button', { name: '戦力外を検討する' });
  await opener.click();
  const dialog = page.getByRole('dialog');
  const title = dialog.getByRole('heading');
  await expect(title).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '戦力外を確定する' })).toBeFocused();
  await page.keyboard.press('Tab'); await expect(title).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0); await expect(opener).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
});
