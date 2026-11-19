import { test, expect } from '@playwright/test';
async function mount(page, reload=false) {
  await page.evaluate(async reload=>{
    const { growthSource } = await import('/baseball-manager/src/engine/__tests__/fixtures/yearEndGrowth.js');
    const { saveGame,loadGame } = await import('/baseball-manager/src/engine/saveload.js');
    const { mountTradeView } = await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
    if(!reload && !(await saveGame(growthSource(),{skipCompression:true})).ok)throw Error('save failed');
    window.growthHarness=mountTradeView(await loadGame(),{retirement:true,mailbox:true});
  },reload);
}
for(const width of [360,390,1440])test(`save generations: growth failure retry cold result and posting at ${width}px`,async({page},info)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width,height:900});await page.goto('/');await mount(page);
  await page.getByRole('button',{name:'年度末成長・要求年俸を確認する'}).click();
  await page.evaluate(()=>{
    window.growthRoot=localStorage.getItem('baseball_manager_v1');window.growthWrite=Storage.prototype.setItem;
    Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1')throw new DOMException('full','QuotaExceededError');return window.growthWrite.call(this,k,v);};
  });
  const confirm=page.getByRole('dialog').getByRole('button',{name:'成長・要求年俸を保存する'});
  await confirm.click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('baseball_manager_v1')===window.growthRoot)).toBe(true);
  await info.attach(`growth-${width}-failure`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  await page.evaluate(()=>{Storage.prototype.setItem=window.growthWrite;});await confirm.click();
  await expect(page.getByRole('region',{name:'保存済みの成長・要求年俸'})).toBeVisible();
  const facts=await page.evaluate(()=>window.growthHarness.current().contractEconomy.engine.transactions.find(t=>t.yearEndGrowth).yearEndGrowth);
  await page.reload();await mount(page,true);
  expect(await page.evaluate(()=>window.growthHarness.current().contractEconomy.engine.transactions.find(t=>t.yearEndGrowth).yearEndGrowth)).toEqual(facts);
  const region=page.getByRole('region',{name:'保存済みの成長・要求年俸'});
  await region.locator('details:has(details)').first().locator(':scope > summary').click();await region.locator('details details > summary').first().click();
  await expect(region).toContainText('成績未記録');
  const path=process.env.GROWTH_CAPTURE && info.project.name==='chromium'?`${process.env.GROWTH_CAPTURE}/${width}-result.png`:undefined;
  await info.attach(`growth-${width}-result`,{body:await page.screenshot({fullPage:true,...(path?{path}:{})}),contentType:'image/png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'引退予約を確定して希望を確認する'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'予約と希望確認を保存する'}).click();
  await expect(page.getByRole('status')).toContainText('引退予約と希望確認を保存済み');expect(errors).toEqual([]);
});
