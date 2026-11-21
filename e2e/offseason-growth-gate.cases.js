import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const oldPending=JSON.parse(gunzipSync(readFileSync(new URL('../src/engine/__tests__/fixtures/renewalBeforeGrowthPending.json.gz',import.meta.url))));
async function mount(page,old=false,reload=false){
 await page.evaluate(async({old,world,reload})=>{
  const {reviewRenewalWinter}=await import('/baseball-manager/src/engine/__tests__/fixtures/renewalGrowth.js');
  const {saveGame,loadGame}=await import('/baseball-manager/src/engine/saveload.js');
  const {mountTradeView}=await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
  if(!reload && !(await saveGame(old?world:reviewRenewalWinter(),{skipCompression:true})).ok)throw Error('fixture save');
  window.growthTurnHarness=mountTradeView(await loadGame(),{contract:true,retirement:true});
 },{old,world:old?oldPending:null,reload});
}
for(const width of [360,390,1440])test(`management decisions: pre-growth turn gate survives reload at ${width}px`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await page.goto('/');await mount(page);
 const next=()=>page.getByRole('button',{name:'オフシーズンを1ターン進める',exact:true});
 await expect(next()).toBeDisabled();
 const refused=await page.evaluate(async()=>{
  const h=window.growthTurnHarness,root=localStorage.getItem('baseball_manager_v1'),before=JSON.stringify(h.current().contractEconomy);
  const r=await h.offseason().handleAdvanceOffseasonTurn();
  return {ok:r.ok,error:r.error,sameRoot:root===localStorage.getItem('baseball_manager_v1'),sameEconomy:before===JSON.stringify(h.current().contractEconomy)};
 });expect(refused).toMatchObject({ok:false,sameRoot:true,sameEconomy:true});expect(refused.error).toContain('年度末成長');
 await info.attach(`${width}-growth-blocked`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await page.reload();await mount(page,false,true);await expect(next()).toBeDisabled();
 await page.getByRole('button',{name:'年度末成長の保存へ'}).click();await page.getByRole('button',{name:'年度末成長・要求年俸を確認する'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'成長・要求年俸を保存する'}).click();
 await expect(page.getByRole('region',{name:'保存済みの成長・要求年俸'})).toBeVisible();
 await page.evaluate(()=>window.growthTurnHarness.current().setScreen('hub'));
 await expect(next()).toBeEnabled();await next().click();await expect(page.getByText('オフ第1ターン',{exact:true})).toBeVisible();
 await info.attach(`${width}-growth-saved`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
for(const width of [360,390,1440])test(`management decisions: old pending turn rescue stops after the saved answer at ${width}px`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await page.goto('/');await mount(page,true);
 const next=()=>page.getByRole('button',{name:'オフシーズンを1ターン進める',exact:true});
 await expect(next()).toBeEnabled();await expect(page.getByRole('region',{name:'オフシーズンのターン進行'})).toContainText('回答待ちがなくなったら');
 await page.reload();await mount(page,true,true);await expect(next()).toBeEnabled();
 for(const turn of [1,2]){await next().click();await expect(page.getByText(`オフ第${turn}ターン`,{exact:true})).toBeVisible();}
 await expect(next()).toBeDisabled();
 const result=await page.evaluate(async()=>{
  const h=window.growthTurnHarness,root=localStorage.getItem('baseball_manager_v1'),r=await h.offseason().handleAdvanceOffseasonTurn();
  return {ok:r.ok,status:h.current().contractEconomy.decisions[0].status,turn:h.current().contractEconomy.clock.offseasonTurn,sameRoot:root===localStorage.getItem('baseball_manager_v1')};
 });expect(result).toEqual({ok:false,status:'accepted',turn:2,sameRoot:true});
 await page.reload();await mount(page,true,true);await expect(next()).toBeDisabled();
 await expect(page.getByRole('button',{name:'年度末成長の保存へ'})).toBeEnabled();
 await info.attach(`${width}-old-rescued`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
