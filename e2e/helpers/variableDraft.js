import {readFileSync,mkdirSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {expect,test} from '@playwright/test';
import {readSave,reloadAndLoad,waitSaveIdle} from './progression.js';

export async function installVariableDraft(page,{screen='draft_lottery',nineNominations=false,legacy=false,allCpu=false,legacyPool=null,legacyProgress=false}={}) {
 const s=JSON.parse(gunzipSync(readFileSync(new URL('../fixtures/new-game.json.gz',import.meta.url))));
 s.gameDay=144;
 for(const t of s.teams){
  t.wins=0;t.losses=0;t.draws=143;
  const target=allCpu||t.id===s.myId?60:70,template=t.farm[0];
  t.farm=Array.from({length:target-t.players.length},(_,i)=>({...template,id:`variable-owned-${t.id}-${i}`,育成:false,isIkusei:false}));
 }
 await page.goto('/');
 const info=await page.evaluate(async({s,screen,nineNominations,legacy,legacyPool,legacyProgress})=>{
  const {initDraftPool}=await import('/baseball-manager/src/engine/draft.js');
  const rules=legacy?undefined:(await import('/baseball-manager/src/engine/draftConference.js')).newDraftRules();
  let random=20261016;const original=Math.random;
  let pool;
  try{Math.random=()=>{random=(Math.imul(random,1664525)+1013904223)>>>0;return random/4294967296;};pool=legacyPool || initDraftPool({scoutResults:[]});}finally{Math.random=original;}
  s.offseasonPlan={version:1,year:s.year,myId:s.myId,stage:'results',resumeScreen:screen,...(rules?{draftRules:rules}:{}),draftPool:pool};
  if(legacyProgress){
   pool[0]._drafted=true;pool[0]._r1winner=s.myId;
   s.offseasonPlan.draftViews={draft:{pickIdx:2*s.teams.length+s.teams.findIndex(t=>t.id===s.myId),drafted:Object.fromEntries(pool.slice(1,3).map(p=>[p.id,s.myId])),log:pool.slice(1,3).map((p,i)=>({team:s.myId,player:p.id,round:i+2})),scouted:[],scoutPt:0}};
  }
  if(nineNominations){
   pool[0]._drafted=true;pool[0]._r1winner=s.myId;
   s.offseasonPlan.draftViews={draft:{pickIdx:8*s.teams.length+s.teams.findIndex(t=>t.id===s.myId),drafted:Object.fromEntries(pool.slice(1,9).map(p=>[p.id,'refused'])),log:pool.slice(1,9).map((p,i)=>({team:s.myId,player:p.id,round:i+2,refused:true}))}};
   pool.slice(9).forEach(p=>{p.potential=100;});
  }
  if(!(await(await import('/baseball-manager/src/engine/saveload.js')).saveGame(s)).ok)throw Error('variable draft save failed');
  return {ids:pool.map(p=>p.id),names:pool.map(p=>p.name),myId:s.myId,owned:s.teams.map(t=>({id:t.id,ids:[...t.players,...t.farm].map(p=>p.id)}))};
 },{s,screen,nineNominations,legacy,legacyPool,legacyProgress});
 await reloadAndLoad(page);await page.locator('.draft-experience h1').waitFor();return info;
}
export async function saveVariableDraft(page){await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);return readSave(page);}
export async function captureVariableDraft(page,name){if(process.env.VARIABLE_DRAFT_CAPTURE){mkdirSync('docs/validation/variable-draft',{recursive:true});await page.screenshot({path:`docs/validation/variable-draft/${name}.png`,fullPage:true});}}

export function registerVariableDraftCase(width,mode){
 test(`variable draft ${mode} at ${width}px preserves selections and save/load`,async({page})=>{
  // Generated 160-candidate reports plus repeated real saves took >90s locally.
  // Match the existing generated-draft journey budget; assertions/retries stay unchanged.
  test.setTimeout(180000);await page.setViewportSize({width,height:width===360?800:width===390?844:1000});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const info=await installVariableDraft(page,mode==='ten'?{screen:'draft',nineNominations:true}:mode==='auto'?{allCpu:true}:{});
  await expect(page.getByText(`当年指名 ${mode==='ten'?9:0}/10人`,{exact:true})).toBeVisible();
  await captureVariableDraft(page,`after-${mode}-${width}`);
  if(mode==='auto'){
   await page.evaluate(()=>{Math.random=()=>.5;});
   await page.getByRole('button',{name:/全ドラフト自動処理/}).click();
  }else if(mode==='six'){
   const candidateList=page.locator('.draft-candidate-scroll');
   await candidateList.evaluate(el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll',{bubbles:true}));});
   await page.locator(`#draft-candidate-${info.ids.at(-1)}`).click();
   await expect(page.getByRole('heading',{name:info.names.at(-1),exact:true})).toBeVisible();
   await page.getByRole('button',{name:'比較に追加',exact:true}).click();
   await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();
   await page.locator(`#draft-candidate-${info.ids.at(-2)}`).click();
   await expect(page.getByRole('heading',{name:/との比較/})).toBeVisible();
   await page.getByRole('button',{name:/を追加調査（1ポイント）/}).click();
   await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();
   await expect(page.locator('.draft-list-heading')).toContainText('4');
   // Manual player choices may take any eligible candidate, independent of CPU stop policy.
   await page.evaluate(()=>{Math.random=()=>.5;});
   for(let i=0;i<6;i++){
    const button=page.locator('.draft-row-select').first();await button.click();
    await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();
    await page.getByRole('button',{name:'指名を確定',exact:true}).click();
    if(i===0){await page.getByText('1巡目結果',{exact:false}).waitFor();await page.getByRole('button',{name:'2巡目以降へ →',exact:true}).click();}
    await expect(page.getByText(`当年指名 ${i+1}/10人`,{exact:true})).toBeVisible();
   }
  }else if(mode==='ten'){
   await page.evaluate(()=>{Math.random=()=>0;});
   await page.locator('.draft-row-select').first().click();
   await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();
   await page.getByRole('button',{name:'指名を確定',exact:true}).click();
  }
  if(mode!=='ten'&&mode!=='auto'){
   const opener=page.getByRole('button',{name:'選択を終了する',exact:true});await opener.click();
   await page.keyboard.press('Escape');await expect(opener).toBeFocused();await opener.click();
   const dialog=page.getByRole('dialog',{name:'選択終了の確認'});await expect(dialog).toContainText('再参加できません');
   await dialog.getByRole('button',{name:'選択終了を確定',exact:true}).click();
  }
  if(mode==='zero'){await page.getByRole('button',{name:'2巡目以降へ →',exact:true}).click();}
  // Twelve clubs can process108 later turns; a5s single-action budget stops mid-conference.
  await expect(page.getByRole('heading',{name:'ドラフト終了',exact:true})).toBeVisible({timeout:mode==='auto'?60000:5000});
  const saved=await saveVariableDraft(page);const before=saved.offseasonPlan;
  await reloadAndLoad(page);await expect(page.getByRole('heading',{name:'ドラフト終了',exact:true})).toBeVisible();
  const loaded=await readSave(page);expect(loaded.offseasonPlan.draftPool).toEqual(before.draftPool);expect(loaded.offseasonPlan.draftViews.draft).toEqual(before.draftViews.draft);
  expect(loaded.teams.map(t=>({id:t.id,ids:[...t.players,...t.farm].map(p=>p.id)}))).toEqual(info.owned);
  await captureVariableDraft(page,`after-${mode}-ended-${width}`);
  await page.getByRole('button',{name:'結果レビューへ →',exact:true}).click();
  await page.getByRole('button',{name:/シーズン開幕！/}).click();
  await expect(page.getByRole('button',{name:/キャンプ終了・開幕へ/})).toBeVisible();
  const signed=await saveVariableDraft(page),mine=signed.teams.find(t=>t.id===info.myId);
  const expected=mode==='auto'?before.draftPool.filter(p=>before.draftViews.draft.drafted[p.id]!=='refused'&&((p._drafted&&String(p._r1winner)===String(info.myId))||String(before.draftViews.draft.drafted[p.id])===String(info.myId))).length:mode==='six'?6:mode==='ten'?1:0;
  expect(expected).toBeLessThanOrEqual(10);
  expect([...mine.players,...mine.farm]).toHaveLength(60+expected);
  expect(signed.offseasonPlan.seasonInfo.draftCount).toBe(expected);
  expect(signed.teams.every(t=>[...t.players,...t.farm].filter(p=>!(p.育成||p.isIkusei)).length<=70)).toBe(true);
  expect(errors).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 });
}
