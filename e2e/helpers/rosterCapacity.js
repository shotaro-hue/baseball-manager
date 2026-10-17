import { test, expect } from '@playwright/test';
import { readSave, reloadAndLoad, waitSaveIdle } from './progression.js';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
export function capacityFixture({controlled=69,reserved=false,screen='offseason_planning'}={}) {
 const s=JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/new-game.json.gz',import.meta.url))));
 const t=s.teams.find(t=>t.id===s.myId), template=t.farm.find(p=>!p.isPitcher&&!p.isForeign);
 t.players=t.players.slice(0,27);t.farm=Array.from({length:controlled-t.players.length},(_,i)=>({...template,id:`capacity-owned-${i}`,name:`枠確認${i}`,育成:false,isIkusei:false,contractYearsLeft:1,contractSignedYear:s.year-1}));
 const devs=[{...template,id:'capacity-dev-a',name:'旧形式育成',育成:false,isIkusei:true,salary:240,injuryDaysLeft:0,registrationCooldownDays:0},
 {...template,id:'capacity-dev-b',name:'育成契約選手',育成:true,isIkusei:false,salary:240,injuryDaysLeft:0,registrationCooldownDays:0}];
 t.farm.push(...devs);t.budget=100000;t.history=t.history||[];
 const candidate={...template,id:'capacity-pick',name:'確定指名候補',育成:false,isIkusei:false};
 if(screen!=='hub'){s.gameDay=144;s.teams=s.teams.map(t=>({...t,wins:0,losses:0,draws:143}));}
 s.offseasonPlan={version:1,year:s.year,myId:s.myId,stage:'open',resumeScreen:screen,tab:'roster',intents:[],releasedIds:[],demands:{},draftPool:[candidate],...(reserved?{draftViews:{lottery:{confirmedPicks:{[s.myId]:candidate.id}}}}:{})};
 if(screen==='hub')s.offseasonPlan=null;
 s.faPool=[{...template,id:'capacity-fa',name:'枠確認FA',salary:500,isForeign:false,育成:false,isIkusei:false}];
 return s;
}
export async function installCapacityFixture(page,options={}) {
 const s=capacityFixture(options);await page.goto('/');
 await page.evaluate(async state=>{const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');if(!(await saveGame(state)).ok)throw Error('capacity save failed');},s);
 await page.reload();await page.getByRole('button',{name:'続きから',exact:true}).click();return s;
}

export function registerCapacityPlanningCases(widths) {
for(const width of widths)test(`roster capacity planned release cannot spend a reserved draft slot ${width}`,async({page})=>{
 test.setTimeout(90000);await page.setViewportSize({width,height:900});
 await installCapacityFixture(page,{reserved:true});const overview=page.locator('.planning-overview');
 await expect(overview).toContainText('支配下 69/70人 · 育成 2人 · 確定指名 1人 · 実際の残枠 0枠');
 await page.getByRole('button',{name:'枠確認0の契約更改',exact:true}).click();await page.getByRole('button',{name:'放出候補にする',exact:true}).click();
 await expect(overview).toContainText('予定反映後の支配下見込み 69人');await expect(overview).toContainText('実際の残枠 0枠');
 await page.getByRole('button',{name:'放出候補を取り消して交渉する',exact:true}).click();await expect(overview).toContainText('予定反映後の支配下見込み 70人');
 await page.getByRole('button',{name:'補強市場',exact:true}).click();await page.getByRole('button',{name:'枠確認FAの条件を見る',exact:true}).click();
 await expect(page.getByRole('button',{name:'契約条件を確認する',exact:true})).toBeDisabled();await expect(page.locator('.fa-detail')).toContainText('支配下登録枠（70人）が満員です');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'編成内容を保存する',exact:true}).click();await waitSaveIdle(page);const saved=await readSave(page);
 await reloadAndLoad(page);await expect(page.locator('.planning-overview')).toContainText('確定指名 1人 · 実際の残枠 0枠');
 const restored=await readSave(page);expect(restored.teams).toEqual(saved.teams);expect(restored.offseasonPlan.draftPool).toEqual(saved.offseasonPlan.draftPool);expect(restored.offseasonPlan.draftViews).toEqual(saved.offseasonPlan.draftViews);
 await page.evaluate(async()=>{
  const {loadGame,saveGame}=await import('/baseball-manager/src/engine/saveload.js');const s=await loadGame();
  s.offseasonPlan.draftResult={pool:s.offseasonPlan.draftPool,drafted:{'capacity-pick':'refused'}};
  if(!(await saveGame(s)).ok)throw Error('refusal fixture save failed');
 });
 await reloadAndLoad(page);await page.getByRole('button',{name:'補強市場',exact:true}).click();await expect(page.locator('.fa-detail')).toContainText('枠確認FA');
 await page.getByRole('button',{name:'契約条件を確認する',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'契約を確定する',exact:true}).click();
 await expect(page.locator('.planning-overview')).toContainText('支配下 70/70人 · 育成 2人 · 確定指名 0人 · 実際の残枠 0枠');
 await page.getByRole('button',{name:'編成内容を保存する',exact:true}).click();await waitSaveIdle(page);const signed=await readSave(page),signedClub=signed.teams.find(t=>t.id===signed.myId);
 expect(signedClub.budget).toBe(99500);expect([...signedClub.players,...signedClub.farm].filter(p=>p.id==='capacity-fa')).toHaveLength(1);
 await reloadAndLoad(page);await expect(page.locator('.planning-overview')).toContainText('支配下 70/70人');expect((await readSave(page)).teams).toEqual(signed.teams);
});
}
