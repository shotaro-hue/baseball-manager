import { test,expect } from '@playwright/test';
async function mount(page,reload=false){
 await page.evaluate(async reload=>{
  const { reviewRenewalWinter }=await import('/baseball-manager/src/engine/__tests__/fixtures/renewalGrowth.js');
  const { saveGame,loadGame }=await import('/baseball-manager/src/engine/saveload.js');
  const { mountTradeView }=await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
  if(!reload && !(await saveGame(reviewRenewalWinter(),{skipCompression:true})).ok)throw Error('fixture save');
  window.renewalGrowthHarness=mountTradeView(await loadGame(),{contract:true,retirement:true});
 },reload);
}
for(const width of [360,390,1440])test(`management decisions: growth before renewal survives failure and reload at ${width}px`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await page.goto('/');await mount(page);
 const select=()=>page.getByRole('button',{name:'Playerの契約を確認',exact:true}).click();
 await select();await expect(page.getByRole('button',{name:'提示条件を確認する',exact:true})).toBeDisabled();
 await expect(page.getByRole('region',{name:'更改前の年度末成長'})).toContainText('既存提示の取消・回答');
 const refused=await page.evaluate(async()=>{
  const root=localStorage.getItem('baseball_manager_v1'),h=window.renewalGrowthHarness,w=h.current();
  const r=await h.offseason().handleContractOffer(w.teams[0].players[0].id,2000,2);
  return {ok:r.ok,error:r.error,sameRoot:root===localStorage.getItem('baseball_manager_v1')};
 });expect(refused).toMatchObject({ok:false,sameRoot:true});expect(refused.error).toContain('年度末成長');
 await info.attach(`${width}-blocked`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await page.getByRole('button',{name:'年度末成長の保存へ'}).click();
 await page.getByRole('button',{name:'年度末成長・要求年俸を確認する'}).click();
 await page.evaluate(()=>{window.write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1')throw new DOMException('full','QuotaExceededError');return window.write.call(this,k,v);};});
 await page.getByRole('dialog').getByRole('button',{name:'成長・要求年俸を保存する'}).click();await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
 await page.evaluate(()=>{Storage.prototype.setItem=window.write;});await page.reload();await mount(page,true);await select();
 await expect(page.getByRole('button',{name:'提示条件を確認する',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'年度末成長の保存へ'}).click();await page.getByRole('button',{name:'年度末成長・要求年俸を確認する'}).click();
 await page.getByRole('dialog').getByRole('button',{name:'成長・要求年俸を保存する'}).click();
 await expect(page.getByRole('region',{name:'保存済みの成長・要求年俸'})).toBeVisible();
 await page.evaluate(()=>window.renewalGrowthHarness.current().setScreen('hub'));await select();
 await expect(page.getByRole('region',{name:'更改前の年度末成長'})).toHaveCount(0);
 await page.getByRole('spinbutton',{name:'提示年俸（万円）'}).fill('2000');await page.getByRole('button',{name:'提示条件を確認する',exact:true}).click();
 await page.getByRole('region',{name:'提示条件の最終確認'}).getByRole('button',{name:'この条件で提示する'}).click();
 await expect(page.getByText('提示を保存しました。回答待ちです。',{exact:true})).toBeVisible();
 const evidence=await page.evaluate(()=>{const w=window.renewalGrowthHarness.current(),e=w.contractEconomy,d=e.decisions.at(-1),row=e.engine.transactions.find(t=>t.yearEndGrowth).yearEndGrowth.rows.find(r=>r.playerId===d.playerId);return {demand:d.demand,row:row.salary,salary:w.teams[0].players[0].salary};});
 expect(evidence.demand).toMatchObject(evidence.row);expect(evidence.salary).toBe(1000);
 await page.reload();await mount(page,true);await select();await expect(page.getByRole('button',{name:'提示を取り消す'})).toBeVisible();
 await info.attach(`${width}-saved`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
