import { test, expect } from '@playwright/test';
import { loadFixture, mainNavigation, readSave, saveHub, reloadAndLoad, runSingle } from './progression';

export function registerRosterDesignCases() {
  for (const width of [360, 390, 1440]) {
    test(`UI-02A actual lineup swaps and promotion survive reload ${width}`, async ({ page }, testInfo) => {
      test.setTimeout(90_000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: width === 360 ? 800 : width === 390 ? 844 : 900 });
      await loadFixture(page, 'opening');
      const initial = await readSave(page), oldTeam = initial.teams.find(t => t.id === initial.myId);
      const roster = page.locator('.roster-overview');
      const openRoster = async () => {
        await mainNavigation(page, width < 1024).getByRole('button', { name: /^編成/ }).click();
        await page.locator('.tabs-nav').getByRole('button', { name: 'ロスター', exact: true }).click();
        await expect(roster.getByRole('heading', { name: '編成', exact: true })).toBeVisible();
      };
      const homeStyle = () => page.locator('.topbar').evaluate(node => {
        const css = getComputedStyle(node);
        return { background: css.backgroundColor, color: css.color, fontSize: css.fontSize };
      });
      const beforeStyle = await homeStyle();
      await openRoster();
      await roster.getByRole('combobox').first().selectOption('2');
      const reordered = await saveHub(page), team = reordered.teams.find(t => t.id === initial.myId);
      expect(team.lineup[1]).toBe(oldTeam.lineup[0]);
      await roster.getByRole('button', { name: '入替', exact: true }).first().click();
      const fielding = (team.rosterDhMode ?? team.dhEnabled) ? team.fieldingDh : team.fieldingNoDh;
      const target = team.players.find(p => p.id === team.lineup[0]);
      const assignedPosition = fielding?.[target.id] ?? target.pos;
      const bench = team.players.find(p => !p.isPitcher && !team.lineup.includes(p.id)
        && !(p.injuryDaysLeft > 0) && p.pos === assignedPosition);
      expect(bench).toBeDefined();
      const pick = roster.getByRole('row').filter({ hasText: bench.name });
      await pick.getByRole('button', { name: '起用', exact: true }).click();
      const swapped = await saveHub(page), swappedTeam = swapped.teams.find(t => t.id === initial.myId);
      expect(swappedTeam.lineup[0]).toBe(bench.id);
      const farmPlayer = swappedTeam.farm.find(p => !p.育成 && !p.isForeign && !(p.injuryDaysLeft > 0) && !(p.registrationCooldownDays > 0));
      const demoted = swappedTeam.players.find(p => !p.isPitcher && !swappedTeam.lineup.includes(p.id));
      const full = page.locator('.roster-full-settings');
      await full.locator('summary').click();
      const demoteRow = full.locator('.detail-lineup-table tbody tr').filter({ hasText: demoted.name });
      await demoteRow.getByRole('button', { name: `${demoted.name}を二軍へ`, exact: true }).click();
      await full.locator('.detail-roster-toolbar').getByRole('button', { name: /二軍/ }).click();
      const forbiddenRow = full.locator('tr').filter({ hasText: demoted.name });
      await expect(forbiddenRow.getByRole('button')).toBeDisabled();
      const promoRow = full.locator('tr').filter({ hasText: farmPlayer.name });
      await promoRow.getByRole('button', { name: '↑一軍', exact: true }).click();
      const saved = await saveHub(page), current = saved.teams.find(t => t.id === initial.myId);
      expect(current.farm.some(p => p.id === demoted.id && p.registrationCooldownDays > 0)).toBe(true);
      expect(current.players.some(p => p.id === farmPlayer.id)).toBe(true);
      await full.locator('summary').click();
      await roster.getByRole('button', { name: '二軍', exact: true }).click();
      await expect(roster).toContainText('二軍実測');
      const detailName = roster.locator('.roster-player').filter({ hasText: demoted.name }).first();
      await detailName.click(); await expect(page.getByRole('dialog')).toContainText(demoted.name);
      await page.getByRole('button', { name: '選手詳細を閉じる' }).click();
      await page.screenshot({ path: testInfo.outputPath(`actual-roster-${width}.png`), fullPage: true });
      await reloadAndLoad(page);
      const loaded = await saveHub(page);
      expect(loaded.teams).toEqual(saved.teams);
      expect(loaded.farmCompetition).toEqual(saved.farmCompetition);
      expect(await homeStyle()).toEqual(beforeStyle);
      await runSingle(page, width <= 760);
      const progressed = await saveHub(page);
      expect(progressed.gameDay).toBe(2);
      expect(progressed.farmCompetition.nextRound).toBe(2);
      expect(errors).toEqual([]);
    });
  }
  for (const width of [360, 390, 760, 761, 1023, 1024, 1440]) {
    test(`UI-02A roster overview states and operations ${width}`, async ({ page }) => {
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      for (const state of ['normal', 'long', 'missing', 'zero', 'empty', 'injured']) {
        await page.goto(`/baseball-manager/e2e/fixtures/ui02a/index.html?state=${state}`);
        const root = page.locator('.roster-overview');
        await expect(root.getByRole('heading', { name: '編成', exact: true })).toBeVisible();
        expect(await root.evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(244, 246, 249)');
        expect(await root.locator('[data-ds="metrics"]').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(14, 38, 59)');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const label of ['野手', '投手', '二軍']) {
          await root.getByRole('button', { name: label, exact: true }).click();
          await expect(root.getByRole('table')).toBeVisible();
          const names = root.locator('.roster-player');
          if (await names.count()) {
            expect((await names.first().boundingBox()).height).toBeGreaterThanOrEqual(44);
            if (width > 760) {
              const frame = root.getByRole('region').first();
              await frame.focus(); await frame.evaluate(node => { node.scrollLeft = node.scrollWidth; });
              expect(await frame.evaluate(node => {
                const name = node.querySelector('tbody .roster-player').closest('td').getBoundingClientRect();
                const bounds = node.getBoundingClientRect();
                return node.scrollLeft > 0 ? Math.abs(name.left - bounds.left) < 3
                  : name.left >= bounds.left && name.right <= bounds.right;
              })).toBe(true);
            }
          }
          if (label === '二軍') {
            await expect(root).toContainText('二軍実測');
            if (state === 'missing') await expect(root).toContainText('状態未記録');
            if (state === 'zero') await expect(root).toContainText('疲労あり · 0');
            if (state === 'injured') await expect(root).toContainText('負傷中 · 残4試合');
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        }
        await root.getByRole('button', { name: '野手', exact: true }).click();
        if (state !== 'empty') {
          const picks = root.getByRole('button', { name: '入替', exact: true });
          if (width <= 760) {
            await expect(picks.first()).toBeInViewport();
            expect(await picks.first().evaluate(button => {
              const range = document.createRange(); range.selectNodeContents(button);
              return new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size;
            })).toBe(1);
          }
          await root.getByRole('button', { name: '成績', exact: true }).click();
          if (state === 'missing') await expect(root).toContainText('HR —');
          if (state === 'zero') { await expect(root).toContainText('打率 0.000'); await expect(root).toContainText('HR 0'); }
          await root.getByRole('button', { name: '状態', exact: true }).click();
          if (state === 'missing') await expect(root).toContainText('状態未記録');
          if (state === 'zero') await expect(root).toContainText('疲労あり · 0');
          const order = root.getByRole('combobox').first();
          await order.selectOption('2');
          expect(JSON.parse(await page.locator('body').getAttribute('data-action')).name).toBe('order');
          await picks.first().click();
          const choose = root.getByRole('button', { name: '起用', exact: true });
          if (state === 'injured') {
            for (let i = 0; i < await choose.count(); i++) await expect(choose.nth(i)).toBeDisabled();
          } else if (await choose.count()) {
            const available = root.locator('[data-ds="button"]:enabled').filter({ hasText: /^起用$/ }).first();
            await available.click();
            expect(JSON.parse(await page.locator('body').getAttribute('data-action')).name).toBe('lineup');
          }
        } else await expect(root).toContainText('打線が未設定');
      }
      expect(errors).toEqual([]);
    });
  }
}
