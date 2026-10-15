import {test,expect} from '@playwright/test';
import {loadFixture,reloadAndLoad,readSave,waitSaveIdle} from './progression';
export function registerPlanningDesignCases(){
 test('unified roster keyboard start candidate cancellation and draft return',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/baseball-manager/e2e/fixtures/ui03a/index.html');
  await page.getByRole('button',{name:'選手0の契約更改',exact:true}).click();
  const start=page.getByRole('button',{name:'交渉を始める',exact:true});await start.focus();await page.keyboard.press('Enter');
  const amount=page.getByLabel('提示年俸（万円）',{exact:true});await expect(amount).toBeFocused();await amount.fill('1320');
  await page.getByRole('button',{name:'放出候補にする',exact:true}).click();const cancel=page.getByRole('button',{name:'放出候補を取り消して交渉する',exact:true});await expect(cancel).toBeFocused();
  await page.keyboard.press('Enter');await expect(amount).toBeFocused();await expect(amount).toHaveValue('1320');
  for(const status of ['cooldown','free_requested']) {
   await page.goto(`/baseball-manager/e2e/fixtures/ui03a/index.html?state=open&status=${status}`);
   await page.getByRole('button',{name:'選手0の契約更改',exact:true}).click();await page.getByRole('button',{name:'放出候補にする',exact:true}).click();
   await page.getByRole('button',{name:'放出候補を取り消して交渉する',exact:true}).click();
   await expect(page.locator('.renewal-detail h2')).toBeFocused();
   await expect(page.getByRole('button',{name:status==='cooldown'?'再交渉する':'減額制限内で再提示する',exact:true})).toBeVisible();
  }
  await page.goto('/baseball-manager/e2e/fixtures/ui03a/index.html');await page.getByRole('button',{name:'交渉・補強を始める',exact:true}).click();
  await expect(page.getByRole('button',{name:'補強市場',exact:true})).toBeFocused();
 });
 for(const width of [360,390,760,761,1023,1024,1440])test(`UI-03A planning states and actions ${width}`,async({page},testInfo)=>{
  test.setTimeout(60_000);await page.setViewportSize({width,height:width===360?800:width===390?844:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const state of ['normal','long','empty','missing','zero','saving','save-error','saved','partial','dirty','stale','open','review','error','throw']){
   await page.goto(`/baseball-manager/e2e/fixtures/ui03a/index.html?state=${state}`);await expect(page.locator('.planning-screen')).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const small=await page.locator('.planning-screen button,.planning-screen select,.planning-screen summary').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length&&n.getBoundingClientRect().height<44).map(n=>n.textContent));expect(small).toEqual([]);
   if(state==='stale'){await expect(page.getByRole('alert')).toContainText('編成データが見つかりません');continue;}
   const save=page.getByRole('button',{name:'編成内容を保存する',exact:true});
   if(state==='saving'){await expect(save).toBeDisabled();await expect(page.locator('.planning-save')).toContainText('保存中');}
   if(state==='save-error')await expect(page.locator('.planning-save')).toContainText('保存失敗');
   if(state==='saved')await expect(page.locator('.planning-save')).toContainText('保存済み');
   if(state==='partial')await expect(page.locator('.planning-save')).toContainText('保存済み・一部履歴は要確認');
   if(state==='missing')await expect(page.locator('.planning-metrics')).toContainText('未記録');
   if(state==='zero')await expect(page.locator('.planning-metrics')).toContainText('0万円');
   if(state==='empty')await expect(page.locator('.renewal-list')).toContainText('所属選手はいません');
   if(state==='normal'){
    const table=page.locator('.renewal-list');await expect(table.locator('.renewal-row')).toHaveCount(6);
    if(width===360||width===390)expect(await table.locator('.renewal-row').first().evaluate(n=>n.getBoundingClientRect().bottom)).toBeLessThanOrEqual(width===360?800:844);
    await page.getByRole('button',{name:'未合意',exact:true}).click();await expect(table.locator('.renewal-row')).toHaveCount(5);
    for(const id of [0,3]) {
     await page.getByRole('button',{name:`選手${id}の契約更改`,exact:true}).click();
     await page.getByRole('button',{name:'放出候補にする',exact:true}).click();
     await expect(page.getByRole('button',{name:'放出候補を取り消して交渉する',exact:true})).toBeFocused();
     await page.getByRole('button',{name:'← 選手一覧に戻る',exact:true}).click();
     await expect(page.locator('.renewal-row:focus')).toBeInViewport();
    }
    await expect(table.locator('.renewal-row')).toHaveCount(3);
    await page.getByRole('button',{name:'放出候補',exact:true}).click();await expect(table.locator('.renewal-row')).toHaveCount(3);await expect(table).toContainText('選手2');
    await page.getByRole('button',{name:'全員',exact:true}).click();
    await page.getByRole('button',{name:'選手0の契約更改',exact:true}).click();
    await page.locator('.renewal-career>summary').click();
    const open=page.getByRole('button',{name:'選手0の選手詳細・年度別成績',exact:true});await open.focus();await page.keyboard.press('Enter');await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(open).toBeFocused();
    await expect(page.getByRole('button',{name:'放出候補を取り消して交渉する',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'← 選手一覧に戻る',exact:true}).click();
    await save.click();expect(await page.locator('body').getAttribute('data-action')).toBe('save');
    if([360,390,1440].includes(width))await page.screenshot({path:testInfo.outputPath(`planning-${width}.png`),fullPage:true});
   }
   if(['open','error','throw'].includes(state)){
    await page.locator('.renewal-candidates>summary').click();
    const opener=page.getByRole('button',{name:'放出の影響を確認する',exact:true});await opener.click();const dialog=page.getByRole('dialog',{name:'放出の最終確認',exact:true});await expect(dialog).toContainText('確定後は取り消せません');
    await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'確認して確定する',exact:true})).toBeFocused();await page.keyboard.press('Tab');await expect(dialog.getByRole('heading')).toBeFocused();
    if(state==='error'||state==='throw'){
     await dialog.getByRole('button',{name:'確認して確定する',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText(state==='error'?'対象や交渉状態が変わっています':'確定に失敗しました');
     await dialog.getByRole('button',{name:'確認して確定する',exact:true}).click();await expect(dialog).toBeHidden();await expect(opener).toBeFocused();continue;
    }
    await page.keyboard.press('Escape');await expect(opener).toBeFocused();await page.getByRole('button',{name:'結果確認',exact:true}).click();await expect(page.getByRole('button',{name:'編成終了の最終確認',exact:true})).toBeDisabled();await page.getByRole('button',{name:'自球団',exact:true}).click();
   }
  }expect(errors).toEqual([]);
 });
}
