import {test,expect} from '@playwright/test';
import {loadFixture,mainNavigation,saveHub,reloadAndLoad} from './helpers/progression';
const fixture='/baseball-manager/e2e/fixtures/ui02e/index.html';
const farm=page=>page.getByRole('region',{name:'二軍育成・起用',exact:true});
const talk=page=>page.getByRole('region',{name:'選手コミュニケーション',exact:true});
async function open(page,label){await page.locator('.detail-roster-toolbar').getByRole('button',{name:new RegExp(label)}).click();}
async function layout(page,root){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await root.locator('button,select,summary').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length&&(n.getBoundingClientRect().width<44||n.getBoundingClientRect().height<44)).map(n=>n.getAttribute('aria-label')||n.textContent)),'44px controls').toEqual([]);
 expect(await root.locator('th,td').evaluateAll(ns=>ns.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)),'cell contents do not overlap').toEqual([]);
}
for(const width of [360,390,760,761,1023,1024,1440])test(`UI-02E farm talk states and controls ${width}`,async({page})=>{
 test.setTimeout(90_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width,height:width===360?800:width===390?844:900});
 for(const state of ['normal','long','missing','zero','empty','injured','cooldown','foreign','register','budget','limit','talk-wait','partial','measured','legacy']){
  await page.goto(`${fixture}?state=${state}`);await page.locator('.roster-full-settings > summary').click();await open(page,'二軍');
  await expect(farm(page)).toBeVisible();await layout(page,farm(page));
  expect(await farm(page).locator('header').evaluate(n=>getComputedStyle(n).backgroundColor)).toBe('rgb(14, 38, 59)');
  if(state==='empty')await expect(farm(page)).toContainText('二軍選手なし');
  if(state==='normal')await expect(farm(page)).toContainText('一軍枠満杯');
  if(state==='injured')await expect(farm(page)).toContainText('負傷中');
  if(state==='cooldown')await expect(farm(page)).toContainText('再登録まで5日');
  if(state==='foreign')await expect(farm(page)).toContainText('投手のみ・野手のみ');
  if(state==='budget')await expect(farm(page)).toContainText('予算不足');
  if(state==='limit')await expect(farm(page)).toContainText('支配下上限');
  if(state==='partial')await expect(farm(page)).toContainText('6試合目からの途中記録');
  if(state==='legacy')await expect(farm(page)).toContainText('旧推定');
  if(state==='measured'){await expect(farm(page)).toContainText('0本塁打');await expect(farm(page)).toContainText('防御率 0.00');}
  if(state==='register'){
   const opener=farm(page).getByRole('button',{name:/を支配下登録する/}).first();await opener.click();
   const dialog=page.getByRole('dialog',{name:'支配下登録の確認',exact:true});await layout(page,dialog);
   await expect(dialog).toContainText('180万円');await expect(dialog).toContainText('820万円');await expect(dialog.getByRole('button',{name:'戻る',exact:true})).toBeFocused();
   await page.keyboard.press('Shift+Tab');await expect(dialog.getByRole('button',{name:'登録を確定',exact:true})).toBeFocused();
   await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(opener).toBeFocused();
   expect(await page.locator('body').getAttribute('data-actions')).toBeNull();
   await opener.click();await dialog.getByRole('button',{name:'登録を確定',exact:true}).click();
   expect(JSON.parse(await page.locator('body').getAttribute('data-actions'))).toHaveLength(1);
   await expect(opener).toBeVisible(); // Fake callback does not change canonical state; no optimistic success.
  }
  const frame=farm(page).getByRole('region',{name:'二軍育成・起用一覧。横にスクロールできます',exact:true});await frame.focus();await expect(frame).toBeFocused();
  if(state!=='empty'&&await frame.evaluate(n=>n.scrollWidth>n.clientWidth)){
   await frame.evaluate(n=>{n.scrollLeft=n.scrollWidth;});expect(await frame.evaluate(n=>Math.abs(n.querySelector('tbody td').getBoundingClientRect().left-n.getBoundingClientRect().left)<3)).toBe(true);
  }
  await open(page,'会話');await layout(page,talk(page));await expect(talk(page)).toContainText('対象：一軍選手');
  if(state==='zero')await expect(talk(page).locator('tbody tr').first()).toContainText('モラル 0');
  if(state==='missing')await expect(talk(page)).toContainText('モラル — 未記録');
  if(state==='talk-wait')await expect(talk(page)).toContainText('あと17試合');
  if(state==='empty')await expect(talk(page)).toContainText('一軍選手なし');
  else if(state==='normal'){
   const opener=talk(page).getByRole('button',{name:/と話す$/}).first();await opener.click();await layout(page,talk(page));
   const options=talk(page).locator('.talk-options');await options.getByRole('button',{name:'会話を閉じる',exact:true}).focus();await page.keyboard.press('Escape');await expect(opener).toBeFocused();
   expect(await page.locator('body').getAttribute('data-actions')).toBeNull();
  }
 }
 expect(errors).toEqual([]);
});

for(const width of [360,390,1440])test(`UI-02E actual goals registration promotion talk and save resume ${width}`,async({page},info)=>{
 test.setTimeout(120_000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewportSize({width,height:width===360?800:width===390?844:900});
 await loadFixture(page,'opening');
 const setup=await page.evaluate(async()=>{
  const {loadGame,saveGame}=await import('/baseball-manager/src/engine/saveload.js');const s=await loadGame(),t=s.teams.find(t=>t.id===s.myId);
  const p=t.farm.find(p=>!p.isForeign&&!p.isPitcher);Object.assign(p,{育成:true,salary:240,devGoal:null,injuryDaysLeft:0,registrationCooldownDays:0});
  const talking=t.players.slice(0,4);talking.forEach((p,i)=>{p.morale=i===0?0:70;p.lastTalkGameDay=0;});
  const bench=t.players.find(p=>!p.isPitcher&&!talking.some(x=>x.id===p.id)&&![...t.lineup,...(t.lineupDh||[]),...(t.lineupNoDh||[])].includes(p.id));
  if(!bench)throw new Error('fixture needs bench player');if(!(await saveGame(s)).ok)throw new Error('fixture save failed');
  return {player:{id:p.id,name:p.name},bench:{id:bench.id,name:bench.name},talking:talking.map(p=>({id:p.id,name:p.name})),myId:s.myId};
 });
 await reloadAndLoad(page);const initial=await saveHub(page),getTeam=s=>s.teams.find(t=>t.id===setup.myId);
 await mainNavigation(page,width<1024).getByRole('button',{name:/^編成/}).click();await page.locator('.tabs-nav').getByRole('button',{name:'ロスター',exact:true}).click();
 const overview=page.locator('.roster-overview');await overview.getByRole('button',{name:'二軍',exact:true}).click();await overview.getByRole('button',{name:'二軍の育成・起用設定へ',exact:true}).click();
 await expect(farm(page)).toBeVisible();
 const opener=farm(page).getByRole('button',{name:`${setup.player.name}の選手詳細を開く`,exact:true});await opener.click();await page.keyboard.press('Escape');await expect(opener).toBeFocused();
 expect((await saveHub(page)).teams).toEqual(initial.teams);
 await farm(page).getByLabel(`${setup.player.name}の育成目標`,{exact:true}).selectOption('promotion');
 await expect(farm(page).getByLabel(`${setup.player.name}の育成目標`,{exact:true})).toHaveValue('promotion');
 const goal=await saveHub(page),goalPlayer=getTeam(goal).farm.find(p=>p.id===setup.player.id);expect(goalPlayer.devGoal).toBe('promotion');expect(goalPlayer.trainingFocus).toBeTruthy();
 await expect(farm(page).getByRole('button',{name:`${setup.player.name}を支配下登録する`,exact:true})).toBeDisabled();
 await open(page,'野手');await page.getByRole('button',{name:`${setup.bench.name}を二軍へ`,exact:true}).click();await open(page,'二軍');
 const before=await saveHub(page),registration=farm(page).getByRole('button',{name:`${setup.player.name}を支配下登録する`,exact:true});await registration.click();
 const dialog=page.getByRole('dialog',{name:'支配下登録の確認',exact:true});await dialog.getByRole('button',{name:'戻る',exact:true}).click();await expect(registration).toBeFocused();expect((await saveHub(page)).teams).toEqual(before.teams);
 await registration.click();await dialog.getByRole('button',{name:'登録を確定',exact:true}).click();
 const promote=farm(page).getByRole('button',{name:`${setup.player.name}を一軍へ`,exact:true});await expect(promote).toBeEnabled();
 const converted=await saveHub(page),convertedPlayer=getTeam(converted).farm.find(p=>p.id===setup.player.id);
 expect(convertedPlayer.育成).toBe(false);expect(convertedPlayer.salary).toBe(420);expect(convertedPlayer.contractYearsLeft).toBe(1);expect(getTeam(converted).budget).toBe(getTeam(before).budget-180);
 await expect(farm(page).getByRole('button',{name:`${setup.bench.name}を一軍へ`,exact:true})).toBeDisabled();await expect(farm(page)).toContainText('再登録まで10日');
 await promote.click();const promoted=await saveHub(page);expect(getTeam(promoted).players.some(p=>p.id===setup.player.id)).toBe(true);expect(getTeam(promoted).farm.some(p=>p.id===setup.player.id)).toBe(false);
 expect(promoted.farmCompetition).toEqual(before.farmCompetition);expect(promoted.seasonHistory).toEqual(before.seasonHistory);
 await open(page,'会話');let prior=promoted;
 for(const [i,kind] of ['激励する','出場について','契約について','噂を否定する'].entries()){
  const p=setup.talking[i],row=talk(page).locator(`tr[data-player-id="${p.id}"]`);
  await row.getByRole('button',{name:`${p.name}と話す`,exact:true}).click();await row.locator('.talk-options').getByRole('button',{name:kind==='激励する'?`${p.name}を激励する`:kind==='噂を否定する'?`${p.name}の噂を否定する`:`${p.name}と${kind}話す`,exact:true}).click();
  await expect(row).toContainText('あと18試合');await expect(row.getByRole('button',{name:`${p.name}の選手詳細を開く`,exact:true})).toBeFocused();const current=await saveHub(page),old=getTeam(prior).players.find(x=>x.id===p.id),updated=getTeam(current).players.find(x=>x.id===p.id);
  const delta=updated.morale-old.morale;
  const range=i===0?[5,15]:i===1?[8,15]:i===2?[5,12]:(old.personality?.overseas??50)>=60?[-5,3]:[2,8];
  expect(delta).toBeGreaterThanOrEqual(range[0]);expect(delta).toBeLessThanOrEqual(range[1]);expect(updated.lastTalkGameDay).toBe(current.gameDay);
  const normalize=s=>s.teams.map(t=>({...t,players:t.players.map(x=>x.id===p.id?{...x,morale:old.morale,lastTalkGameDay:old.lastTalkGameDay}:x)}));
  expect(normalize(current)).toEqual(normalize(prior));prior=current;
 }
 await page.screenshot({path:info.outputPath(`actual-talk-${width}.png`),fullPage:true});
 const saved=await saveHub(page);await reloadAndLoad(page);const restored=await saveHub(page);expect(restored.teams).toEqual(saved.teams);expect(restored.farmCompetition).toEqual(saved.farmCompetition);expect(restored.seasonHistory).toEqual(saved.seasonHistory);expect(errors).toEqual([]);
});

for(const width of [360,390,1440])test(`roster capacity conversion respects both flags and 69/70 after save resume ${width}`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:900});
 const {installCapacityFixture}=await import('./helpers/rosterCapacity');
 const initial=await installCapacityFixture(page,{screen:'hub'});
 await mainNavigation(page,width<1024).getByRole('button',{name:/^編成/}).click();
 await page.locator('.tabs-nav').getByRole('button',{name:'ロスター',exact:true}).click();
 await page.locator('.roster-overview').getByRole('button',{name:'二軍',exact:true}).click();
 await page.getByRole('button',{name:'二軍の育成・起用設定へ',exact:true}).click();
 await expect(farm(page).locator('[data-roster-capacity]')).toContainText('支配下 69/70人 · 育成 2人');
 const opener=farm(page).getByRole('button',{name:'旧形式育成の選手詳細を開く',exact:true});
 await opener.click();await page.keyboard.press('Escape');await expect(opener).toBeFocused();
 const registration=farm(page).getByRole('button',{name:'旧形式育成を支配下登録する',exact:true});await registration.click();
 const dialog=page.getByRole('dialog',{name:'支配下登録の確認',exact:true});await expect(dialog).toContainText('69 → 70');await dialog.getByRole('button',{name:'登録を確定',exact:true}).click();
 await expect(farm(page).locator('[data-roster-capacity]')).toContainText('支配下 70/70人 · 育成 1人');
 await expect(farm(page).getByRole('button',{name:'育成契約選手を支配下登録する',exact:true})).toBeDisabled();
 await layout(page,farm(page));const saved=await saveHub(page),t=saved.teams.find(t=>t.id===saved.myId),original=initial.teams.find(t=>t.id===saved.myId);
 expect(t.budget).toBe(original.budget-180);expect(t.farm.find(p=>p.id==='capacity-dev-a')).toMatchObject({育成:false,isIkusei:false,salary:420});
 expect(t.history).toEqual(original.history);expect(t.players.map(p=>p.id)).toEqual(original.players.map(p=>p.id));
 await reloadAndLoad(page);expect((await saveHub(page)).teams).toEqual(saved.teams);
});
