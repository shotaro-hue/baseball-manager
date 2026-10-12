import { test, expect } from '@playwright/test';
import { loadFixture, startSingle, saveHub, reloadAndLoad } from './progression';
import { resultDecisionRows, savedDecisionRows } from './result-decision-cases';

export function registerResultDesignCases() {
  for (const width of [360, 390, 1440]) {
    test(`UI-01C real result return and saved history ${width}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await loadFixture(page, 'opening');
      const homeStyle = () => page.locator('.topbar').evaluate(node => {
        const css = getComputedStyle(node);
        return { background: css.backgroundColor, color: css.color, fontSize: css.fontSize };
      });
      const beforeStyle = await homeStyle();
      await startSingle(page, width <= 760);
      await page.getByRole('button', { name: /オートシムモード/ }).click();
      const shown = await resultDecisionRows(page);
      await expect(page.getByRole('heading', { name: '試合結果', exact: true })).toBeVisible();
      expect(await page.locator('.result-summary').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(14, 38, 59)');
      await page.getByRole('button', { name: '投手成績', exact: true }).click();
      await expect(page.locator('.result-player-table').first()).toContainText('PC');
      await page.screenshot({ path: testInfo.outputPath(`actual-result-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'ホームに戻る', exact: true }).click();
      expect(await homeStyle()).toEqual(beforeStyle);
      const saved = await saveHub(page);
      expect(shown).toEqual(savedDecisionRows(saved.allTeamResultsMap[saved.myId][1], saved.myId));
      await reloadAndLoad(page);
      const loaded = await saveHub(page);
      expect(loaded.gameResultsMap).toEqual(saved.gameResultsMap);
      expect(loaded.allTeamResultsMap).toEqual(saved.allTeamResultsMap);
      expect(loaded.teams).toEqual(saved.teams);
      expect(errors).toEqual([]);
    });
  }
  for (const width of [360, 390, 760, 761, 1023, 1024, 1440]) {
    test(`UI-01C result design states and controls ${width}`, async ({ page }, testInfo) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      for (const state of ['win', 'loss', 'draw', 'long', 'empty', 'missing', 'loading', 'error']) {
        await page.goto(`/baseball-manager/e2e/fixtures/ui01c/index.html?state=${state}`);
        await expect(page.getByRole('heading', { name: '試合結果', exact: true })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'ボックススコア', exact: true })).toBeVisible();
        const root = page.locator('.result-screen');
        expect(await root.evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(244, 246, 249)');
        expect(await page.locator('.result-summary').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(14, 38, 59)');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const overview = await page.locator('.result-overview').boundingBox();
        const details = await page.locator('.result-details').boundingBox();
        if (width >= 1024) expect(details.x).toBeGreaterThan(overview.x + overview.width);
        else expect(details.y).toBeGreaterThan(overview.y);
        if (['win', 'loss', 'draw'].includes(state)) {
          await expect(page.locator('.result-summary')).toContainText(`試合終了 / ${{ win: '勝利', loss: '敗北', draw: '引き分け' }[state]}`);
        }
        if (!['empty', 'missing', 'loading', 'error'].includes(state)) {
          const batting = page.getByRole('button', { name: '打者成績', exact: true });
          const pitching = page.getByRole('button', { name: '投手成績', exact: true });
          await expect(page.locator('.result-player-table').first().locator('tbody tr')).toHaveCount(9);
          await pitching.focus(); await page.keyboard.press('Enter');
          await expect(pitching).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator('.result-player-table').first()).toContainText('PC');
          await batting.click(); await expect(batting).toHaveAttribute('aria-pressed', 'true');
          await expect(page.locator('.result-player-table').first()).toContainText('AVG');
          for (const button of [batting, pitching]) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
          const frame = page.getByRole('region', { name: 'イニング別スコア' });
          await frame.focus();
          await frame.evaluate(node => { node.scrollLeft = node.scrollWidth; });
          expect(await frame.evaluate(node => {
            const first = node.querySelector('tbody th').getBoundingClientRect(), bounds = node.getBoundingClientRect();
            return Math.abs(first.left - bounds.left) < 3;
          })).toBe(true);
        }
        if (state === 'empty') await expect(page.getByText('この試合の個人成績は未記録です。')).toBeVisible();
        if (state === 'missing') await expect(page.locator('.result-summary')).toContainText('結果未確認');
        if (state === 'loading') await expect(page.getByText('試合詳細を整理中...')).toBeVisible();
        if (state === 'error') {
          await expect(page.getByRole('alert')).toContainText('詳細成績の集計に失敗しました');
          await expect(page.getByText('打者成績を読み込み中...')).toHaveCount(0);
          expect(await page.locator('.result-innings tbody tr td:last-child').allTextContents()).toEqual(['—', '—']);
        }
        if (state === 'win' && [360, 390, 1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`result-${width}.png`), fullPage: true });
        const back = page.getByRole('button', { name: 'ハブに戻る', exact: true });
        await expect(back).toBeEnabled(); expect((await back.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await back.click(); expect(await page.locator('body').getAttribute('data-returned')).toBe('true');
      }
      expect(errors).toEqual([]);
    });
  }
}
