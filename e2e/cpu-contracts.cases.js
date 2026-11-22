import { test,expect } from '@playwright/test';
async function mount(page,reload=false) {
 await page.evaluate(async reload=>{
  const {renewalFixture}=await import('/baseball-manager/src/engine/__tests__/fixtures/renewalWorld.js');
  const {saveGame,loadGame}=await import('/baseball-manager/src/engine/saveload.js');
  const {mountTradeView}=await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
  if(!reload&&!(await saveGame(renewalFixture({phase:'offseason',date:'2026-12-01'}),{skipCompression:true})).ok)throw Error('fixture save');
  window.cpuHarness=mountTradeView(await loadGame(),{contract:true});
 },reload);
}
for(const width of [360,390,1440])test(`management decisions: CPU contracts survive failure retry and cold reload at ${width}px`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await page.goto('/');await mount(page);
 const button=()=>page.getByRole('button',{name:'CPU球団の契約を整理する',exact:true});
 await info.attach(`${width}-before`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 const root=await page.evaluate(()=>localStorage.getItem('baseball_manager_v1'));
 await page.evaluate(()=>{window.write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1')throw Error('full');return window.write.call(this,k,v);};});
 await button().click();await expect(page.getByRole('alert')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('baseball_manager_v1'))).toBe(root);
 await info.attach(`${width}-failure`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await page.evaluate(()=>{Storage.prototype.setItem=window.write;});await page.reload();await mount(page,true);await button().click();
 await expect(page.getByText(/CPU球団の整理を保存済み/)).toBeVisible();
 await page.reload();await mount(page,true);await expect(page.getByText(/CPU球団の整理を保存済み/)).toBeVisible();
 await page.getByText('球団別の結果と理由',{exact:true}).click();
 await expect(page.getByRole('region',{name:'CPU球団の契約整理'})).toContainText('全契約年度の予算審査');
 await info.attach(`${width}-saved`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
