import { test, expect } from '@playwright/test';
import { startSingle, waitForNewGameReady } from './helpers/progression';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    let seed = 20260929;
    Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  });
  await page.goto('/baseball-manager/');
  await page.getByRole('button', { name: '阪神タイガース', exact: true }).click();
  await waitForNewGameReady(page, '阪神タイガース');
});

test('opening dashboard and header agree on the scheduled game number and date', async ({ page }) => {
  await expect(page.locator('.topbar')).toContainText('2026年 · 3/27 · 第1戦');
  await expect(page.getByRole('region', { name: '本日の試合', exact:true })).toContainText('2026年3月27日 · 第1戦');
  await expect(page.locator('.desktop-dashboard').getByRole('button', { name: '試合へ進む', exact:true })).toBeEnabled();
});

test('manual pause exposes tactics, and an advisory stop can execute a command', async ({ page }) => {
  await startSingle(page, false);
  await page.getByRole('button', { name: /🎮 試合モード/ }).click();
  const tactics = page.getByRole('button', { name: '🎯 作戦', exact: true });
  await expect(tactics).toBeVisible();
  await expect(page.getByRole('button', { name: '🔄 投手交代', exact: true })).toBeVisible();
  await tactics.click();
  await page.getByRole('button', { name: '通常で実行！', exact: true }).click();
  await expect(page.getByTestId('game-log')).not.toBeEmpty();
  const resume = page.getByRole('button', { name: /^▶ (自動進行|続行)$/ });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(page.getByRole('button', { name: '▶ 続行', exact: true })).toBeVisible({ timeout: 20000 });
  const logBefore = await page.getByTestId('game-log').innerText();
  await tactics.click();
  await page.getByRole('button', { name: '通常で実行！', exact: true }).click();
  await expect(page.getByTestId('game-log')).not.toHaveText(logBefore);
});
