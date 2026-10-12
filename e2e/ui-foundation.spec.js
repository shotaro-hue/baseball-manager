import { test, expect } from '@playwright/test';
import { loadFixture, saveHub, reloadAndLoad, progressSignature, readSave } from './helpers/progression';

for (const [width,height] of [[360,800],[390,844],[1440,900]]) {
  test(`UI-01A home/result actions and save resume ${width}`, async ({page}) => {
    test.setTimeout(60_000);
    await page.setViewportSize({width,height});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await loadFixture(page,'opening');
    const mobile=width<=760;
    const home=page.locator(mobile ? '.mobile-home' : '.desktop-dashboard');
    await expect(home.locator('[data-ds="button"]').first()).toBeVisible();
    for (const size of [[360,800],[390,844],[760,900],[761,900],[1023,900],[1024,900],[1440,900]]) {
      await page.setViewportSize({width:size[0],height:size[1]});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const measures=await page.locator('[data-ds="button"]:visible').evaluateAll(buttons=>buttons.map(b=>({height:b.getBoundingClientRect().height,font:getComputedStyle(b).fontSize})));
      expect(measures.every(b=>b.height>=44 && b.font==='16px')).toBe(true);
    }
    await page.setViewportSize({width,height});
    if (mobile) {
      const toggle=home.getByRole('button',{name:'まとめて進める',exact:true});
      await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','true');
      await expect(home.getByLabel('まとめて進める試合数')).toBeVisible();
      await toggle.click();await expect(toggle).toHaveAttribute('aria-expanded','false');
    } else {
      const table=home.locator('[data-ds="table"]');
      await expect(table).toHaveAttribute('tabindex','0');
      const player=table.locator('tbody button').nth(1);
      await player.click();await expect(player).toHaveAttribute('aria-pressed','true');
      await home.getByRole('button',{name:'成績',exact:true}).click();
      await expect(home.locator('.calm-stats')).toBeVisible();
    }
    // Exercise an actual single game and the primitive on its result screen.
    await home.getByRole('button',{name:mobile?/1試合ずつ采配/:'試合へ進む',exact:!mobile}).click();
    await page.getByRole('button',{name:/オートシムモード/}).click();
    const result=page.locator('.detail-result');
    await expect(result).toBeVisible();
    const inning=result.getByRole('region',{name:'イニング別スコア'});
    const numeric=inning.locator('tbody [data-number]').first();
    expect(await numeric.evaluate(e=>getComputedStyle(e).textAlign)).toBe('right');
    expect(await numeric.evaluate(e=>getComputedStyle(e).fontFamily)).toContain('Noto Sans JP');
    await result.getByRole('button',{name:'ホームに戻る',exact:true}).click();
    const saved=await saveHub(page);
    const signature=progressSignature(saved);
    await reloadAndLoad(page);
    await expect(page.locator('.calm-shell')).toBeVisible();
    expect(progressSignature(await readSave(page))).toEqual(signature);
    expect(errors).toEqual([]);
  });
}

test('UI-01A state meanings, numeric alignment, sticky identity and keyboard focus', async ({page}) => {
  await page.goto('/baseball-manager/e2e/fixtures/ui01a/states.html');
  await expect(page.getByRole('alert')).toHaveText('保存失敗');
  await expect(page.getByText('実測0',{exact:true})).toBeVisible();
  await expect(page.locator('[data-ds="metrics"] dd').first()).toHaveText('0');
  await expect(page.getByText('算出不可 · 投球回0',{exact:true})).toBeVisible();
  for (const width of [360,390,760,761,1023,1024,1440]) {
    await page.setViewportSize({width,height:900});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const columns=await page.locator('[data-ds="metrics"]').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(width<1024?2:4);
    const table=page.getByRole('region',{name:'表示検証の表'});
    await table.focus();await expect(table).toBeFocused();
    expect(await table.evaluate(e=>getComputedStyle(e).outlineWidth)).toBe('3px');
    expect(await table.locator('[data-number]').last().evaluate(e=>getComputedStyle(e).textAlign)).toBe('right');
    const identity=table.locator('tbody td').first();
    expect(await identity.evaluate(e=>getComputedStyle(e).position)).toBe('sticky');
    await table.evaluate(e=>{e.scrollLeft=150;});
    expect(await identity.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(233, 241, 253)');
  }
  await page.getByRole('button',{name:'確認する',exact:true}).focus();
  await page.keyboard.press('Enter');
  expect(await page.locator('body').getAttribute('data-activated')).toBe('true');
  await expect(page.getByRole('button',{name:'処理中',exact:true})).toBeDisabled();
});
