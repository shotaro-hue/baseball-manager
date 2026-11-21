import { test, expect } from '@playwright/test';

async function mount(page, reload = false) {
 await page.evaluate(async reload => {
  const { growRenewalWinter } = await import('/baseball-manager/src/engine/__tests__/fixtures/renewalGrowth.js');
  const { saveGame, loadGame } = await import('/baseball-manager/src/engine/saveload.js');
  const { mountTradeView } = await import('/baseball-manager/tests/helpers/trade-hook-harness.jsx');
  if (!reload && !(await saveGame(growRenewalWinter(), { skipCompression: true })).ok) throw Error('fixture save');
  window.turnHarness = mountTradeView(await loadGame(), { contract: true });
 }, reload);
}
for (const width of [360, 390, 1440]) test(`management decisions: offseason turn saves replies and resumes at ${width}px`, async ({ page }, info) => {
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await page.goto('/');await mount(page);
 const next=()=>page.getByRole('button',{name:'オフシーズンを1ターン進める',exact:true});
 const select=()=>page.getByRole('button',{name:'Playerの契約を確認',exact:true}).click();
 await info.attach(`${width}-before`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await select();await page.getByRole('spinbutton',{name:'提示年俸（万円）'}).fill('420');
 await page.getByRole('button',{name:'提示条件を確認する',exact:true}).click();
 await page.getByRole('region',{name:'提示条件の最終確認'}).getByRole('button',{name:'この条件で提示する'}).click();
 await expect(page.getByText('提示を保存しました。回答待ちです。',{exact:true})).toBeVisible();
 await page.reload();await mount(page,true);
 await page.getByText('回答予定の選手と条件を確認する',{exact:true}).click();
 await expect(page.getByRole('region',{name:'オフシーズンのターン進行'})).toContainText('更改・獲得の回答待ち：1件');
 const due=await page.evaluate(()=>window.turnHarness.current().contractEconomy.decisions[0].dueTurn);
 for(let turn=1;turn<due;turn++){await next().click();await expect(page.getByText(`オフ第${turn}ターン`,{exact:true})).toBeVisible();}
 const root=await page.evaluate(()=>localStorage.getItem('baseball_manager_v1'));
 await page.evaluate(()=>{window.write=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1')throw new DOMException('full','QuotaExceededError');return window.write.call(this,k,v);};});
 await next().click();await expect(page.getByRole('alert')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('baseball_manager_v1'))).toBe(root);
 await expect(page.getByText(`オフ第${due-1}ターン`,{exact:true})).toBeVisible();
 await info.attach(`${width}-failed`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 await page.evaluate(()=>{Storage.prototype.setItem=window.write;});await next().click();
 await expect(page.getByText(`オフ第${due}ターン`,{exact:true})).toBeVisible();
 await select();await expect(page.getByRole('region',{name:'選んだ選手の契約条件'})).toContainText('辞退');
 await page.reload();await mount(page,true);await select();
 await expect(page.getByRole('region',{name:'選んだ選手の契約条件'})).toContainText('辞退');
 await info.attach(`${width}-saved`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 expect(await page.evaluate(()=>window.turnHarness.current().contractEconomy.decisions.map(d=>d.status))).toEqual(['rejected']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});

for (const width of [360,390,1440]) test(`management decisions: offseason turn accepts replacement after cancellation at ${width}px`,async({page},info)=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:900});await page.goto('/');await mount(page);
 const select=()=>page.getByRole('button',{name:'Playerの契約を確認',exact:true}).click();
 await select();
 const offer=async()=>{
  await page.getByRole('spinbutton',{name:'提示年俸（万円）'}).fill('2000');
  await page.getByRole('button',{name:'提示条件を確認する',exact:true}).click();
  await page.getByRole('region',{name:'提示条件の最終確認'}).getByRole('button',{name:'この条件で提示する'}).click();
  await expect(page.getByText('提示を保存しました。回答待ちです。',{exact:true})).toBeVisible();
 };
 await offer();await page.getByRole('button',{name:'提示を取り消す'}).click();
 await page.getByRole('region',{name:'提示取消の確認'}).getByRole('button',{name:'取消を確定する'}).click();
 await expect(page.getByText('提示を取り消しました。',{exact:true})).toBeVisible();
 await offer();
 const due=await page.evaluate(()=>window.turnHarness.current().contractEconomy.decisions.at(-1).dueTurn);
 for(let turn=1;turn<=due;turn++){
  await page.getByRole('button',{name:'オフシーズンを1ターン進める',exact:true}).click();
  await expect(page.getByText(`オフ第${turn}ターン`,{exact:true})).toBeVisible();
 }
 await page.reload();await mount(page,true);await select();
 await expect(page.getByRole('region',{name:'選んだ選手の契約条件'})).toContainText('来季契約済み');
 await info.attach(`${width}-saved`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
 const evidence=await page.evaluate(()=>{const w=window.turnHarness.current();return {salary:w.teams[0].players[0].salary,year:w.year,date:w.contractEconomy.clock.date,statuses:w.contractEconomy.decisions.map(d=>d.status),pool:w.faPool.length};});
 expect(evidence).toEqual({salary:1000,year:2026,date:'2026-12-01',statuses:['cancelled','accepted'],pool:0});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
