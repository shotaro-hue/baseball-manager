import {test,expect} from '@playwright/test';
import {loadFixture,mainNavigation,saveHub,reloadAndLoad} from './helpers/progression';

async function layout(page,root) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await root.locator('button,input,select,summary').evaluateAll(ns => ns.filter(n => n.getClientRects().length && (n.getBoundingClientRect().height < 44 || n.getBoundingClientRect().width < 44)).map(n => n.textContent))).toEqual([]);
}
for (const width of [360,390,760,761,1023,1024,1440]) {
  test(`UI-02D first-team states and local scroll ${width}`, async ({page}) => {
    test.setTimeout(90_000);
    await page.setViewportSize({width,height:width===360?800:width===390?844:900});
    const errors=[]; page.on('pageerror',e=>errors.push(e.message));
    for (const state of ['normal','zero','missing','denominator','legacy','long','injured']) {
      await page.goto(`/baseball-manager/e2e/fixtures/ui02d/index.html?state=${state}`);
      const root=page.locator('.first-team-stats');
      await expect(root).toContainText('一軍・2026年');
      await expect(root).toContainText('二軍所属の一軍記録');
      await expect(root).not.toContainText('二軍だけの旧推定');
      await root.getByRole('button',{name:'詳細指標',exact:true}).click();
      for (const kind of ['打者','投手']) {
        await root.getByRole('tab',{name:kind,exact:true}).click();
        await layout(page,root);
        await expect(root).not.toContainText('NaN');
        if (state==='zero') await expect(root).toContainText(kind==='打者'?'0.000':'0.00');
        if (['missing','legacy'].includes(state)) await expect(root).toContainText('未記録');
        if (state==='denominator') await expect(root).toContainText('算出不可');
        if (state==='injured') await expect(root).toContainText('負傷中');
        const frame=root.getByRole('region',{name:`${kind}成績。横にスクロールできます`,exact:true});
        await frame.focus(); await expect(frame).toBeFocused();
        if (width<1024) {
          expect(await frame.evaluate(n=>n.scrollWidth>n.clientWidth)).toBe(true);
          await frame.evaluate(n=>{n.scrollLeft=300;});
          await expect(frame.locator('.stats-player-button').first()).toBeInViewport();
          expect(await frame.evaluate(n=>{const r=n.getBoundingClientRect(),c=n.querySelector('tbody td').getBoundingClientRect();return Math.abs(r.left-c.left)<2;})).toBe(true);
          await frame.evaluate(n=>{n.scrollLeft=0;});
        }
        if (state==='normal'&&[360,390,1440].includes(width)) {
          await root.getByRole('button',{name:'主要指標',exact:true}).click();
          await page.evaluate(()=>window.scrollTo(0,0));
          await page.screenshot({path:`docs/validation/ui02d/after-${kind==='打者'?'batter':'pitcher'}-${width}.png`});
          await root.getByRole('button',{name:'詳細指標',exact:true}).click();
        }
      }
    }
    expect(errors).toEqual([]);
  });
}

test('UI-02D keyboard filters details comparison and return preserve list position', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/baseball-manager/e2e/fixtures/ui02d/index.html');
  const root=page.locator('.first-team-stats');
  await root.getByRole('tab',{name:'打者',exact:true}).focus();
  await page.keyboard.press('ArrowRight'); await expect(root.getByRole('tab',{name:'投手',exact:true})).toBeFocused();
  await page.keyboard.press('Home'); await expect(root.getByRole('tab',{name:'打者',exact:true})).toBeFocused();
  await root.getByRole('button',{name:'OPSの説明',exact:true}).click();
  await expect(root.getByRole('status')).toContainText('OPS');
  await page.keyboard.press('Escape'); await expect(root.getByRole('status')).toHaveCount(0);
  await expect(root.getByRole('button',{name:'OPSの説明',exact:true})).toBeFocused();
  await root.locator('.stats-filter-disclosure > summary').click();
  await root.getByLabel('選手名で検索').fill('存在しない');
  await expect(root).toContainText('対象の選手はいません');
  await root.getByRole('button',{name:'絞り込みを戻す',exact:true}).click();
  await root.getByLabel('成績対象の球団').selectOption('999');
  await root.getByLabel('現在の所属で絞り込み').selectOption('active');
  await root.getByRole('button',{name:'本塁打でソート',exact:true}).click();
  const frame=root.getByRole('region',{name:'打者成績。横にスクロールできます',exact:true});
  await frame.evaluate(n=>{n.scrollTop=180;});
  const opener=frame.locator('.stats-player-button').nth(3); await opener.focus();
  const position=await frame.evaluate(n=>({top:n.scrollTop,left:n.scrollLeft,page:window.scrollY}));
  await page.keyboard.press('Enter');
  const detail=page.locator('.player-modal-card');
  await expect(detail).toBeVisible();
  await detail.getByRole('button',{name:'＋ 比較',exact:true}).click();
  await page.keyboard.press('Escape'); await expect(opener).toBeFocused();
  expect(await frame.evaluate(n=>({top:n.scrollTop,left:n.scrollLeft,page:window.scrollY}))).toEqual(position);
  const compareButton=frame.locator('.compare-add-button').nth(4);
  await compareButton.focus(); await page.keyboard.press('Space');
  await expect(detail).toHaveCount(0);
  await expect(page.getByRole('button',{name:'2人を比較',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'2人を比較',exact:true}).click();
  const comparison=page.getByRole('dialog',{name:'選手比較',exact:true});
  await comparison.getByRole('button',{name:'選手比較を閉じる',exact:true}).focus();
  await page.keyboard.press('Shift+Tab'); await expect(comparison.getByRole('button',{name:'元の画面に戻る',exact:true})).toBeFocused();
  await page.keyboard.press('Tab'); await expect(comparison.getByRole('button',{name:'選手比較を閉じる',exact:true})).toBeFocused();
  await page.keyboard.press('Escape'); await expect(page.getByRole('button',{name:'2人を比較',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'2人を比較',exact:true}).click();
  await comparison.getByRole('button',{name:/を比較から外す/}).first().click();
  await expect(comparison).toHaveCount(0);
  await page.getByRole('button',{name:'クリア',exact:true}).click();
  await expect(root.getByLabel('成績対象の球団')).toHaveValue('999');
  await expect(root.getByLabel('現在の所属で絞り込み')).toHaveValue('active');
  await expect(root).toContainText('本塁打 降順');
});

for (const width of [360,390,1440]) {
  test(`UI-02D actual app list compare roster and save unchanged ${width}`, async ({page}) => {
    test.setTimeout(90_000);
    await page.setViewportSize({width,height:width===360?800:width===390?844:900});
    await loadFixture(page,'opening');
    const before=await saveHub(page), team=before.teams.find(t=>t.id===before.myId);
    await mainNavigation(page,width<1024).getByRole('button',{name:'成績',exact:true}).click();
    const root=page.locator('.first-team-stats'); await expect(root).toContainText(`一軍・${before.year}年`);
    for (const p of team.players.filter(p=>!p.isPitcher).slice(0,2)) {
      const opener=root.locator('.stats-player-button').filter({hasText:p.name}); await opener.click();
      const detail=page.getByRole('dialog',{name:p.name,exact:true});
      await detail.getByRole('button',{name:'＋ 比較',exact:true}).click();
      await detail.getByRole('button',{name:'元の画面に戻る',exact:true}).click();
      await expect(opener).toBeFocused();
    }
    await page.getByRole('button',{name:'2人を比較',exact:true}).click();
    await page.getByRole('dialog',{name:'選手比較',exact:true}).getByRole('button',{name:'元の画面に戻る',exact:true}).click();
    await page.getByRole('button',{name:'クリア',exact:true}).click();
    await mainNavigation(page,width<1024).getByRole('button',{name:/^編成/}).click();
    await expect(page.locator('.roster-overview')).toBeVisible();
    expect((await saveHub(page)).teams).toEqual(before.teams);
    await reloadAndLoad(page); expect((await saveHub(page)).teams).toEqual(before.teams);
  });
}
