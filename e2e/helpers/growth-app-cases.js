import {test,expect} from '@playwright/test';
import {loadFixture,reloadAndLoad,readSave,waitSaveIdle} from './progression';
async function expectReadableCell(cell){
 await cell.scrollIntoViewIfNeeded();
 await expect.poll(()=>cell.evaluate(node=>{
  const box=node.getBoundingClientRect();
  const hit=document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
  return hit===node||node.contains(hit);
 })).toBe(true);
}
export function registerGrowthAppCases(){
 for(const width of [360,390,1024,1440])test(`UI-03D actual App growth close profile and saved reload ${width}`,async({page},testInfo)=>{
  test.setTimeout(120_000);await page.setViewportSize({width,height:width===360?800:width===390?844:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await loadFixture(page,'draw-complete');await waitSaveIdle(page);await page.goto('/');
  const info=await page.evaluate(async()=>{
   const {loadGame,saveGame}=await import('/baseball-manager/src/engine/saveload.js');const s=await loadGame(),club=s.teams.find(t=>t.id===s.myId);
   const b=club.players.find(p=>!p.isPitcher),pitcher=club.players.find(p=>p.isPitcher);const before=JSON.parse(JSON.stringify(b)),oldPitcher=JSON.parse(JSON.stringify(pitcher));
   b.batting={...b.batting,contact:b.batting.contact+3,power:b.batting.power+2};pitcher.pitching={...pitcher.pitching,control:pitcher.pitching.control-3,stamina:pitcher.pitching.stamina-3};
   s.offseasonPlan={version:1,year:s.year,myId:s.myId,stage:'planning',resumeScreen:'offseason_planning',tab:'roster',intents:[],releasedIds:[],demands:{},growth:{breakout:[],growth:[{p:before,diff:5}],decline:[{p:oldPitcher,diff:-6}]}};
   if(!(await saveGame(s)).ok)throw Error('growth fixture save failed');return{name:b.name,pitcher:pitcher.name,contactBefore:before.batting.contact,contactNow:b.batting.contact};
  });await reloadAndLoad(page);await expect(page.locator('.planning-screen')).toBeVisible();
  const save=async()=>{const b=page.getByRole('button',{name:'編成内容を保存する',exact:true});await expect(b).toBeEnabled();await b.click();await expect(page.locator('.planning-save')).toContainText('保存済み');await waitSaveIdle(page);return readSave(page);};
  const baseline=await save();const disclosure=page.locator('.planning-growth>summary');await disclosure.click();const root=page.locator('.growth-report');await expect(root).toBeVisible();
  await root.getByRole('button',{name:'上昇の記録',exact:true}).click();await root.getByRole('button',{name:`${info.name}の能力変化を確認`,exact:true}).click();const abilities=root.getByRole('region',{name:`${info.name}の能力変化`,exact:true});const contact=abilities.getByRole('row').filter({has:page.getByRole('rowheader',{name:'ミート',exact:true})});expect(await contact.getByRole('cell').allTextContents()).toEqual([String(info.contactBefore),String(info.contactNow),'+3']);
  if(width>=1024){
   // A displayed list must expose its saved total, even beside a detail in the support column.
   if(await root.locator('.growth-list').isVisible())await expectReadableCell(root.locator('.growth-records tbody td[data-number] strong').first());
   // Each comparison value must be reachable without being covered by the sticky ability column.
   for(const cell of await contact.getByRole('cell').all())await expectReadableCell(cell);
  }
  const back=root.getByRole('button',{name:'成長一覧に戻る',exact:true});if(width<1024){const b=await back.boundingBox();expect(b.y).toBeGreaterThanOrEqual(0);expect(b.y+b.height).toBeLessThanOrEqual(width===360?800:844);}
  await root.getByRole('button',{name:'選手詳細・年度別成績',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(root.getByRole('button',{name:'選手詳細・年度別成績',exact:true})).toBeFocused();
  await back.click();await expect(root.getByRole('button',{name:`${info.name}の能力変化を確認`,exact:true})).toBeFocused();await expect(root.getByRole('button',{name:'上昇の記録',exact:true})).toHaveAttribute('aria-pressed','true');
  await root.getByRole('button',{name:'下降の記録',exact:true}).click();await expect(root.getByRole('region',{name:'成長記録一覧',exact:true})).toContainText(info.pitcher);
  await page.screenshot({path:testInfo.outputPath(`actual-growth-${width}.png`),fullPage:true});await root.getByRole('button',{name:'編成に戻る',exact:true}).click();await expect(root).toBeHidden();await expect(disclosure).toBeFocused();
  const after=await save();expect(after.teams).toEqual(baseline.teams);expect(after.offseasonPlan.growth).toEqual(baseline.offseasonPlan.growth);expect(after.farmCompetition).toEqual(baseline.farmCompetition);
  await reloadAndLoad(page);await disclosure.click();await expect(root).toBeVisible();await expect(root.getByRole('region',{name:'成長記録一覧',exact:true})).toContainText('+5pt');
  const loaded=await readSave(page);expect(loaded.teams).toEqual(after.teams);expect(loaded.offseasonPlan.growth).toEqual(after.offseasonPlan.growth);expect(errors).toEqual([]);
 });
}
