import { test, expect } from '@playwright/test';
import { loadFixture, openBatch, saveHub, reloadAndLoad, mainNavigation, startNewGame, readSave, waitSaveIdle } from './helpers/progression';

for (const width of [360, 390, 760, 761, 1023, 1024, 1440]) {
  test(`UI-01D batch states and keyboard ${width}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    for (const state of ['normal','long','empty','missing','loading','error','no-detail','saving','save-error','saved']) {
      await page.goto(`/baseball-manager/e2e/fixtures/ui01d/index.html?state=${state}`);
      await expect(page.getByRole('heading', { name: /試合の結果/ })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(await page.locator('.batch-summary').evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(14, 38, 59)');
      const bad = await page.locator('button,summary').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height < 44).map(node => node.textContent));
      expect(bad).toEqual([]);
      if (state === 'normal') {
        await expect(page.locator('.batch-game')).toHaveCount(8);
        await page.getByRole('button', { name: '続きを表示' }).focus(); await page.keyboard.press('Enter');
        await expect(page.locator('.batch-game')).toHaveCount(12);
        await page.locator('.batch-game').last().getByRole('button').click();
        expect(await page.locator('body').getAttribute('data-game')).toBe('12');
        await page.getByText('負傷・リーグの詳細', { exact: true }).click();
        await expect(page.getByText('高橋 玲 · 肩の負傷 · 3日')).toBeVisible();
        if ([360,390,1440].includes(width)) await page.screenshot({ path: testInfo.outputPath(`batch-${width}.png`), fullPage: true });
      }
      if (state === 'no-detail') { await expect(page.locator('.batch-game').first().getByRole('button')).toBeDisabled(); await expect(page.locator('.batch-game').first()).toContainText('詳細記録なし'); }
      if (state === 'missing') await expect(page.locator('.batch-game').first()).toContainText('勝敗未確認');
      if (state === 'error') await expect(page.getByRole('alert')).toContainText('ハイライトの集計に失敗');
      const home = page.getByRole('button', { name: 'ホームへ戻る', exact: true });
      await home.focus(); await page.keyboard.press('Enter');
      expect(await page.locator('body').getAttribute('data-action')).toBe('home');
    }
    expect(errors).toEqual([]);
  });
}

test('FIX-R1 new game batch saving and recorded highlights agree with persisted history',async({page},testInfo)=>{
  test.setTimeout(90_000);
  await page.setViewportSize({width:390,height:844});await startNewGame(page);
  // Pause the existing save lock, after initialization. The real queue and
  // persistence implementation remain active; only completion is controlled.
  await page.evaluate(()=>{
    const original=navigator.locks.request.bind(navigator.locks);
    const gate=new Promise(resolve=>{window.releaseBatchSave=resolve;});
    navigator.locks.request=async(name,...args)=>{if(name==='baseball-manager-save')await gate;return original(name,...args);};
  });
  const panel=await openBatch(page,true);
  await panel.getByLabel('まとめて進める試合数').selectOption('10');
  await panel.getByRole('button',{name:'まとめてシム',exact:true}).click();
  await expect(page.getByRole('heading',{name:'10試合の結果',exact:true})).toBeVisible({timeout:30_000});
  await expect(page.locator('.batch-state')).toContainText('保存中');
  expect((await readSave(page)).gameDay).toBe(1);
  await page.evaluate(()=>window.releaseBatchSave());
  await expect(page.locator('.batch-state')).toContainText('保存済み');await waitSaveIdle(page);
  const saved=await readSave(page);expect(saved.gameDay).toBe(11);expect(Object.keys(saved.gameResultsMap)).toHaveLength(10);
  // Independent reduction over actual saved logs; do not invoke the UI helper.
  const counts=new Map();
  for(const record of Object.values(saved.gameResultsMap))for(const event of record.log||[]){
    if(event.result!=='hr'||event.scorer!==true)continue;
    const key=event.batId!=null?`${typeof event.batId}:${event.batId}`:event.batter;
    const row=counts.get(key)||{name:event.batter,count:0};row.count++;counts.set(key,row);
  }
  const expected=[...counts.values()].sort((a,b)=>b.count-a.count).slice(0,3).map(row=>`${row.name}${row.count}本塁打`);
  await expect(page.locator('.batch-highlights')).toContainText('ログ記録あり 10/10試合');
  expect(await page.locator('.batch-highlight-row').allTextContents()).toEqual(expected);
  if(!expected.length)await expect(page.locator('.batch-highlights')).toContainText('本塁打なし');
  await page.getByRole('button',{name:'続きを表示'}).click();
  const last=page.locator('.batch-game').last().getByRole('button'),label=await last.getAttribute('aria-label');
  await last.click();await expect(page.getByRole('heading',{name:'試合結果',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'バッチ結果に戻る',exact:true}).click();
  await expect(page.getByRole('button',{name:label,exact:true})).toBeFocused();
  await expect(page.locator('.batch-state')).toContainText('保存済み');
  await page.screenshot({path:testInfo.outputPath('actual-390.png'),fullPage:true});
  await page.getByRole('button',{name:'ホームへ戻る',exact:true}).click();
  const before=await saveHub(page);await reloadAndLoad(page);const after=await saveHub(page);
  expect(after.gameResultsMap).toEqual(saved.gameResultsMap);expect(after.teams).toEqual(before.teams);expect(after.gameDay).toBe(11);
});

for(const failure of ['main','archive'])test(`FIX-R1 ${failure} save failure retains batch results and home retry`,async({page})=>{
  test.setTimeout(90_000);await page.setViewportSize({width:390,height:844});await loadFixture(page,'opening');
  await page.evaluate(failure=>{
    if(failure==='main'){
      const original=Storage.prototype.setItem;window.restoreBatchStorage=()=>{Storage.prototype.setItem=original;};
      Storage.prototype.setItem=function(key,value){if(key==='baseball_manager_v1')throw new DOMException('batch test quota','QuotaExceededError');return original.call(this,key,value);};
    }else{
      const original=IDBObjectStore.prototype.put;window.restoreBatchStorage=()=>{IDBObjectStore.prototype.put=original;};
      IDBObjectStore.prototype.put=function(...args){if(this.name==='batted_ball_batches')throw new DOMException('batch archive quota','QuotaExceededError');return original.apply(this,args);};
    }
  },failure);
  const panel=await openBatch(page,true);await panel.getByLabel('まとめて進める試合数').selectOption('10');
  await panel.getByRole('button',{name:'まとめてシム',exact:true}).click();
  await expect(page.getByRole('heading',{name:'10試合の結果',exact:true})).toBeVisible({timeout:30_000});
  await expect(page.locator('.batch-state')).toContainText(failure==='main'?'保存失敗':'保存済み・一部履歴は要確認');
  await expect(page.locator('.batch-game')).toHaveCount(8);
  const failedSave=await readSave(page);expect(failedSave.gameDay).toBe(failure==='main'?1:11);
  await page.evaluate(()=>window.restoreBatchStorage());
  await page.getByRole('button',{name:'ホームへ戻る',exact:true}).click();
  const saved=await saveHub(page);expect(saved.gameDay).toBe(11);expect(Object.keys(saved.gameResultsMap)).toHaveLength(10);
  await reloadAndLoad(page);const loaded=await saveHub(page);expect(loaded.gameResultsMap).toEqual(saved.gameResultsMap);expect(loaded.teams).toEqual(saved.teams);
});
for (const width of [360,390,1440]) {
  test(`UI-01D actual batch detail focus roster and save ${width}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 }); await loadFixture(page, 'opening');
    const panel = await openBatch(page, width <= 760);
    await panel.getByLabel('まとめて進める試合数').selectOption('10');
    await panel.getByRole('button', { name: 'まとめてシム', exact: true }).click();
    await expect(page.getByRole('heading', { name: '10試合の結果', exact: true })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: '続きを表示' }).click();
    const selected = page.locator('.batch-game').last().getByRole('button');
    const name = await selected.getAttribute('aria-label');
    await selected.click();
    await expect(page.getByRole('heading', { name: '試合結果', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'バッチ結果に戻る', exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toBeFocused();
    await expect(page.locator('.batch-game')).toHaveCount(10);
    await page.getByRole('button', { name: '編成を見直す', exact: true }).click();
    await expect(page.getByRole('region', { name: '編成一覧', exact: true })).toBeVisible();
    if (width === 390) {
      await mainNavigation(page, true).getByRole('button', { name: 'ホーム', exact: true }).click();
      const second = await openBatch(page, true);
      await second.getByLabel('まとめて進める試合数').selectOption('10');
      await second.getByRole('button', { name: 'まとめてシム', exact: true }).click();
      await expect(page.getByRole('heading', { name: '10試合の結果', exact: true })).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('.batch-game')).toHaveCount(8);
      await expect(page.locator('.batch-game').first()).toContainText('第11戦');
      await expect(page.getByRole('button', { name: '続きを表示' })).toBeVisible();
      await page.getByRole('button', { name: '編成を見直す', exact: true }).click();
      // Day 20 can trigger the real press event when returning to the hub.
      // Answer it through its normal UI instead of blocking the save button.
      const press = page.getByRole('dialog', { name: '記者会見', exact: true });
      if (await press.isVisible()) {
        await press.getByRole('button').filter({ hasNotText: '回答する' }).first().click();
        await press.getByRole('button', { name: '回答する', exact: true }).click();
        await expect(press).toBeHidden();
      }
    }
    const before = await saveHub(page); await reloadAndLoad(page);
    const after = await saveHub(page);
    expect(after.gameResultsMap).toEqual(before.gameResultsMap);
    expect(after.teams).toEqual(before.teams); expect(after.gameDay).toBe(width === 390 ? 21 : 11);
  });
}
