import { test, expect } from '@playwright/test';
import { loadFixture, mainNavigation, saveHub, reloadAndLoad } from './helpers/progression';

async function layout(page, root) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const small = await root.locator('button,select,summary').evaluateAll(nodes => nodes.filter(n => n.getClientRects().length && n.getBoundingClientRect().height < 44).map(n => n.textContent));
  expect(small).toEqual([]);
  const covered = await root.evaluate(n => { const panel=n.querySelector('.player-detail-panel'), actions=n.querySelector('.player-decision-actions'); return panel && actions && actions.getBoundingClientRect().top < panel.getBoundingClientRect().bottom - 1; });
  expect(Boolean(covered), 'decision actions must not cover player content').toBe(false);
}
for (const width of [360,390,760,761,1023,1024,1440]) {
  test(`UI-02C detail and comparison states ${width}`, async ({page}, info) => {
    test.setTimeout(120_000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({width,height:width === 360 ? 800 : width === 390 ? 844 : 900});
    for (const state of ['normal','long','zero','missing','denominator','injured']) {
      await page.goto(`/baseball-manager/e2e/fixtures/ui02c/index.html?state=${state}`);
      for (const index of [0,1,2]) {
        const opener = page.locator(`[data-player-index="${index}"]`); await opener.click();
        const dialog = page.locator('.player-modal-card');
        await expect(dialog.getByRole('tab',{name:'概要',exact:true})).toBeVisible();
        await layout(page, dialog);
        if (state === 'normal' && index === 0 && [360,390,1440].includes(width)) {
          await page.screenshot({path:`docs/validation/ui02c/after-detail-${width}.png`});
        }
        if (state === 'injured') await expect(dialog).toContainText('負傷中');
        await dialog.getByRole('tab',{name:'今季成績',exact:true}).click();
        await expect(dialog).toContainText('一軍・2026年');
        if (state === 'zero') await expect(dialog).toContainText(index === 1 ? '0.00' : '0.000');
        if (state === 'missing') { await expect(dialog).toContainText('未記録'); await expect(dialog).not.toContainText('NaN'); }
        if (state === 'denominator') await expect(dialog).toContainText('算出不可');
        if (index === 2) await expect(dialog).toContainText('旧推定');
        await layout(page, dialog);
        if (index !== 1) {
          await dialog.getByRole('tab',{name:'打球分析',exact:true}).click();
          await expect(dialog.getByRole('heading',{name:'一軍・打球分析',exact:true})).toBeVisible();
          await layout(page, dialog);
        }
        await dialog.getByRole('tab',{name:'年度別・通算',exact:true}).click();
        await expect(dialog).toContainText('二軍実測・旧推定は合算しません');
        await expect(dialog).not.toContainText('成績を読み込み中');
        await layout(page, dialog);
        if (index < 2) {
          await dialog.getByRole('button',{name:'＋ 比較',exact:true}).click();
          await expect(dialog.getByRole('button',{name:'比較から外す',exact:true})).toBeFocused();
        }
        await dialog.getByRole('button',{name:'元の画面に戻る',exact:true}).click();
        await expect(opener).toBeFocused();
      }
      await page.getByRole('button',{name:'2人を比較',exact:true}).click();
      const comparison = page.getByRole('dialog',{name:'選手比較',exact:true});
      await expect(comparison).toContainText('一軍・2026年');
      await expect(comparison).toContainText('対象外');
      await layout(page, comparison);
      const frame = comparison.getByRole('region',{name:'選手比較表',exact:true});
      await frame.focus(); await expect(frame).toBeFocused();
      if (width < 500) { await frame.evaluate(n => { n.scrollLeft = 100; }); expect(await frame.evaluate(n => n.scrollLeft > 0)).toBe(true); }
      if (state === 'normal' && [360,390,1440].includes(width)) {
        await frame.evaluate(n => { n.scrollLeft = 0; });
        await comparison.evaluate(n => { n.scrollTop = 0; });
        await page.screenshot({path:`docs/validation/ui02c/after-compare-${width}.png`});
      }
      await comparison.getByRole('button',{name:'元の画面に戻る',exact:true}).click();
      await expect(page.getByRole('button',{name:'2人を比較',exact:true})).toBeFocused();
      await page.getByRole('button',{name:'クリア',exact:true}).click();
      await expect(page.locator('.player-compare-tray')).toHaveCount(0);
    }
    expect(errors).toEqual([]);
  });
}

for (const width of [360,390,1440]) {
  test(`UI-02C actual roster compare return and unchanged save ${width}`, async ({page}) => {
    test.setTimeout(90_000);
    await page.setViewportSize({width,height:width === 360 ? 800 : width === 390 ? 844 : 900});
    await loadFixture(page,'opening');
    const before = await saveHub(page), team = before.teams.find(t => t.id === before.myId);
    await mainNavigation(page,width < 1024).getByRole('button',{name:/^編成/}).click();
    await page.locator('.tabs-nav').getByRole('button',{name:'ロスター',exact:true}).click();
    const settings = page.locator('.roster-full-settings'); await settings.locator('summary').click();
    for (const player of team.players.filter(p => !p.isPitcher).slice(0,2)) {
      const opener = settings.locator('.settings-batters').getByRole('button',{name:player.name,exact:true});
      await opener.click();
      const dialog = page.getByRole('dialog',{name:player.name,exact:true});
      await dialog.getByRole('button',{name:'＋ 比較',exact:true}).click();
      await dialog.getByRole('button',{name:'元の画面に戻る',exact:true}).click();
      await expect(opener).toBeFocused();
    }
    await page.getByRole('button',{name:'2人を比較',exact:true}).click();
    const compare = page.getByRole('dialog',{name:'選手比較',exact:true});
    const first = compare.getByRole('button',{name:'選手比較を閉じる',exact:true});
    await first.focus(); await page.keyboard.press('Shift+Tab');
    await expect(compare.getByRole('button',{name:'元の画面に戻る',exact:true})).toBeFocused();
    await page.keyboard.press('Tab'); await expect(first).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button',{name:'2人を比較',exact:true})).toBeFocused();
    await page.getByRole('button',{name:'2人を比較',exact:true}).click();
    await compare.getByRole('button',{name:`${team.players.filter(p=>!p.isPitcher)[0].name}を比較から外す`,exact:true}).click();
    await expect(compare).toHaveCount(0);
    await expect(page.getByRole('button',{name:'2人を比較',exact:true})).toBeDisabled();
    expect(await page.locator('.player-compare-tray').evaluate(n => n.contains(document.activeElement))).toBe(true);
    await page.getByRole('button',{name:'クリア',exact:true}).click();
    // No compare/detail operation may update game data, even when saving and reopening.
    expect((await saveHub(page)).teams).toEqual(before.teams);
    await reloadAndLoad(page);
    expect((await saveHub(page)).teams).toEqual(before.teams);
  });
}

test('UI-02C keyboard tabs and scroll return', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/baseball-manager/e2e/fixtures/ui02c/index.html');
  await page.evaluate(() => { window.scrollTo(0,400); });
  const opener = page.locator('[data-player-index="0"]');
  await opener.click(); const y = await page.evaluate(() => window.scrollY);
  const dialog = page.locator('.player-modal-card');
  const tab = dialog.getByRole('tab',{name:'概要',exact:true});
  await tab.focus(); await page.keyboard.press('ArrowRight');
  await expect(dialog.getByRole('tab',{name:'今季成績',exact:true})).toBeFocused();
  await page.keyboard.press('End'); await expect(dialog.getByRole('tab',{name:'年度別・通算',exact:true})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
});

for (const width of [390,1440]) {
  test(`UI-02C shared planning FA and growth callers ${width}`, async ({page}) => {
    test.setTimeout(90_000);
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({width,height:900});
    for (const mode of ['planning','fa','review']) {
      await page.goto(`/baseball-manager/e2e/fixtures/ui02c/index.html?mode=${mode}`);
      if (mode === 'planning') await page.locator('.planning-roster').getByRole('button').first().click();
      if (mode === 'fa') {
        await page.getByRole('button',{name:'FA候補確認の条件を見る',exact:true}).click();
        await page.getByRole('button',{name:'選手詳細・年度別成績',exact:true}).click();
      }
      if (mode === 'review') {
        await page.locator('summary').filter({hasText:/^成長の選手/}).click();
        await page.getByRole('button',{name:'選手詳細・年度別成績',exact:true}).click();
      }
      const dialog = page.locator('.player-modal-card');
      await expect(dialog.getByRole('tab',{name:'概要',exact:true})).toBeVisible();
      await dialog.getByRole('tab',{name:'今季成績',exact:true}).click();
      await expect(dialog).toContainText('一軍・2026年');
      await dialog.getByRole('tab',{name:'年度別・通算',exact:true}).click();
      await expect(dialog).not.toContainText('成績を読み込み中');
      await layout(page, dialog);
      await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0);
      expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    }
    expect(errors).toEqual([]);
  });
}

test('UI-02C legacy disclosure is keyboard reachable and trapped without decision footer', async ({page}) => {
  await page.goto('/baseball-manager/e2e/fixtures/ui02c/index.html?mode=review&state=legacy');
  await page.locator('summary').filter({hasText:/^成長の選手/}).click();
  await page.getByRole('button',{name:'選手詳細・年度別成績',exact:true}).click();
  const dialog = page.locator('.player-modal-card');
  await dialog.getByRole('tab',{name:'今季成績',exact:true}).click();
  const summary = dialog.locator('summary').filter({hasText:'旧推定の保存値を見る'});
  await dialog.getByRole('tabpanel').focus(); await page.keyboard.press('Tab');
  await expect(summary).toBeFocused();
  await summary.press('Enter'); await expect(dialog).toContainText('PA 10');
  await summary.focus(); await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button',{name:'元の画面に戻る',exact:true})).toBeFocused();
});

for (const width of [390,1440]) {
  test(`UI-02C measured farm years and legacy remain separate ${width}`, async ({page}) => {
    await page.setViewportSize({width,height:900});
    await page.goto('/baseball-manager/e2e/fixtures/ui02c/index.html?state=measured');
    await page.locator('[data-player-index="2"]').click();
    const dialog = page.locator('.player-modal-card');
    await dialog.getByRole('tab',{name:'今季成績',exact:true}).click();
    const section = dialog.getByRole('heading',{name:'二軍実測・年度別記録',exact:true}).locator('..');
    await expect(section).toContainText('2026年 二軍実測');
    await expect(section).toContainText('球団間合計');
    await section.getByLabel('選手二軍年度',{exact:true}).selectOption('2025');
    await expect(section).toContainText('2025年 二軍実測');
    await expect(section).toContainText('60試合目からの途中記録');
    await expect(dialog).toContainText('一軍・2026年');
    const breakdown = section.locator('summary').filter({hasText:'球団別内訳'});
    await breakdown.focus(); await breakdown.press('Enter');
    await expect(section).toContainText('東A');
    const legacy = section.locator('summary').filter({hasText:'旧推定の保存値を見る'});
    await legacy.focus(); await legacy.press('Enter');
    await expect(section).toContainText('PA 10');
    await expect(section).toContainText('年度不明・実測と合算なし');
    await layout(page, dialog);
  });
}
