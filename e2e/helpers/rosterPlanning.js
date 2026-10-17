import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {seedPlanning,savePlanning} from './planning-app-cases';
import {reloadAndLoad,waitSaveIdle} from './progression';
export function registerRosterPlanningCases(){
 test('roster reinforcement plan edits actualFA and save resume',async({page},testInfo)=>{
  const width=testInfo.project.use.viewport.width;
  test.setTimeout(180000);await page.setViewportSize({width,height:width===360?800:width===390?844:1000});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await seedPlanning(page);await waitSaveIdle(page);await page.goto('/');
  const info=await page.evaluate(async()=>{
   const {loadGame,saveGame}=await import('/baseball-manager/src/engine/saveload.js');const s=await loadGame(),t=s.teams.find(t=>t.id===s.myId);
   const dev=t.farm.find(p=>!p.isPitcher&&!p.isForeign);Object.assign(dev,{育成:true,isIkusei:true,salary:240});
   s.offseasonPlan.stage='open';s.offseasonPlan.tab='market';delete s.offseasonPlan.reinforcements;
   if(!(await saveGame(s)).ok)throw Error('roster planning fixture failed');
   return {controlled:[...t.players,...t.farm].filter(p=>!(p.育成||p.isIkusei)).length,budget:t.budget,devName:dev.name,devId:dev.id,ids:[...t.players,...t.farm].map(p=>p.id)};
  });await reloadAndLoad(page);await expect(page.locator('.planning-screen')).toBeVisible();
  const projection=page.locator('.planning-overview > p').filter({hasText:'予定反映後の支配下見込み'}),summary=page.locator('[data-reinforcement-plan]');
  await expect(summary).toContainText('未設定');const opener=page.getByRole('button',{name:'補強予定を編集',exact:true});
  await opener.click();let dialog=page.getByRole('dialog',{name:'補強予定',exact:true});await expect(dialog.locator('h2')).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'予定を保存',exact:true})).toBeFocused();await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(opener).toBeFocused();
  await opener.click();dialog=page.getByRole('dialog',{name:'補強予定',exact:true});
  await dialog.getByLabel('ドラフト予定人数',{exact:true}).fill('4');await dialog.getByLabel('FA予定人数',{exact:true}).fill('2');await dialog.getByLabel(info.devName,{exact:true}).check();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await dialog.getByRole('button',{name:'予定を保存',exact:true}).click();await expect(opener).toBeFocused();
  await expect(summary).toContainText('ドラフト4人 · FA2人 · 育成昇格1人');await expect(projection).toContainText(`${info.controlled+7}人`);
  const before=await savePlanning(page);expect(before.offseasonPlan.reinforcements).toMatchObject({draftGoal:4,faGoal:2,conversionIds:[info.devId]});
  const club=before.teams.find(t=>t.id===before.myId);expect([...club.players,...club.farm].map(p=>p.id)).toEqual(info.ids);expect(club.budget).toBe(info.budget);
  await reloadAndLoad(page);await expect(summary).toContainText('ドラフト4人 · FA2人 · 育成昇格1人');
  await page.getByRole('button',{name:'編成確認FA候補の条件を見る',exact:true}).click();await page.getByRole('button',{name:'契約条件を確認する',exact:true}).click();await page.getByRole('button',{name:'契約を確定する',exact:true}).click();
  await expect(summary).toContainText('ドラフト4人 · FA1人 · 育成昇格1人');await expect(projection).toContainText(`${info.controlled+7}人`);
  const signed=await savePlanning(page),now=signed.teams.find(t=>t.id===signed.myId),addition=[...now.players,...now.farm].find(p=>p.id==='ui03a-market');
  expect(addition).toBeTruthy();expect(now.budget).toBe(info.budget-addition.salary*addition.contractYears);expect([...now.players,...now.farm]).toHaveLength(info.ids.length+1);
  if(process.env.ROSTER_PLAN_CAPTURE){mkdirSync('docs/validation/roster-planning-65',{recursive:true});await page.screenshot({path:`docs/validation/roster-planning-65/actual-fa-${width}.png`,fullPage:true});}
  await reloadAndLoad(page);await expect(summary).toContainText('ドラフト4人 · FA1人 · 育成昇格1人');expect(errors).toEqual([]);
 });
}
