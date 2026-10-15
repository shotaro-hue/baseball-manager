import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {readSave,reloadAndLoad,waitSaveIdle} from './helpers/progression';

export async function seedDraft(page,screen='draft_preview',options={}) {
 const state=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz',import.meta.url))));
 state.gameDay=144;
 for(const t of state.teams){t.wins=60;t.losses=83;t.draws=0;
  if(t.id!==state.myId){const template=t.farm[0];t.farm=Array.from({length:70-t.players.length},(_,i)=>({...template,id:`full-${t.id}-${i}`,育成:false,isIkusei:false}));}}
 const mine=state.teams.find(t=>t.id===state.myId),template=mine.players.find(p=>!p.isPitcher);
 const pool=Array.from({length:30},(_,i)=>({...template,id:`decision-${i}`,name:`候補検証${i}`,isPitcher:false,pos:'捕手',age:22,prospectType:'大卒',potential:60+i/2,
  batting:{contact:40+i,power:40+i,eye:40+i,speed:40+i,defense:40+i,catching:40+i,arm:40+i},育成:false,isIkusei:false}));
 state.offseasonPlan={version:1,year:state.year,myId:state.myId,stage:'results',resumeScreen:screen,draftPool:pool};
 if(options.duel){
  const rival=state.teams.find(t=>t.id!==state.myId);rival.farm=rival.farm.slice(0,-1);rival.wins=0;rival.losses=143;mine.wins=100;mine.losses=43;
  state.offseasonPlan.draftPool=pool.slice(0,1);
 }
 if(options.completed)state.offseasonPlan.draftViews={lottery:{phase:'done',activeTeams:[],confirmedPicks:{[state.myId]:pool[0].id}}};
 await page.goto('/');await page.evaluate(async state=>{const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');if(!(await saveGame(state)).ok)throw new Error('draft decision seed failed');},state);
 await reloadAndLoad(page);
}

test('first-round investigation and pick-time report survive later rounds and real reload',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:390,height:844});
 await seedDraft(page);
 await page.getByRole('button',{name:'ドラフト会議を開始する',exact:true}).click();
 await page.getByRole('button',{name:'候補検証0のレポート',exact:true}).click();
 await page.getByRole('button',{name:'候補検証0を追加調査（1ポイント）',exact:true}).click();
 await expect(page.getByRole('button',{name:'候補検証0を追加調査（1ポイント）',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);
 const first=await readSave(page);expect(first.offseasonPlan.draftEvaluation.points).toBe(4);
 await reloadAndLoad(page);
 await expect(page.getByRole('heading',{name:'候補検証0',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();
 await page.getByRole('button',{name:'指名を確定',exact:true}).click();
 await page.getByRole('button',{name:/2巡目以降へ/}).click();
 await expect(page.getByText('追加調査 残り', {exact:false})).toContainText('4');
 await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);
 const second=await readSave(page);
 expect(second.offseasonPlan.draftEvaluation.points).toBe(4);
 expect(second.offseasonPlan.draftEvaluation.snapshots['decision-0']).toBeDefined();
 const reports=second.offseasonPlan.draftEvaluation;
 await reloadAndLoad(page);
 expect((await readSave(page)).offseasonPlan.draftEvaluation).toEqual(reports);
});

test('losing the last candidate lottery can finish without discarding the winner',async({page})=>{
 test.setTimeout(60000);await page.addInitScript(()=>{Math.random=()=>.1;});
 await seedDraft(page,'draft_lottery',{duel:true});
 await page.getByRole('button',{name:'候補検証0のレポート',exact:true}).click();
 await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();
 await page.getByRole('button',{name:'指名を確定',exact:true}).click();
 await page.getByRole('button',{name:'くじを引く！',exact:true}).click();
 await page.getByRole('button',{name:'候補が尽きたため結果へ',exact:true}).click();
 await expect(page.getByRole('heading',{name:'ドラフト終了',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);
 const saved=await readSave(page),p=saved.offseasonPlan.draftPool[0];
 expect(p._drafted).toBe(true);expect(p._r1winner).not.toBe(saved.myId);
 expect(saved.offseasonPlan.draftViews.draft.drafted).toEqual({});
});

test('an old completed round retains missing historical evidence after advancing and reloading',async({page})=>{
 test.setTimeout(60000);await seedDraft(page,'draft_lottery',{completed:true});
 await page.getByRole('button',{name:/2巡目以降へ/}).click();
 await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);
 expect((await readSave(page)).offseasonPlan.draftEvaluation.snapshots['decision-0']).toBeUndefined();
 await reloadAndLoad(page);
 expect((await readSave(page)).offseasonPlan.draftEvaluation.snapshots['decision-0']).toBeUndefined();
});

for(const width of [360,390,1440])test(`draft comparison, selection return and layout at ${width}px`,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width,height:width>760?900:844});
 await seedDraft(page,'draft_lottery');
 await expect(page.getByRole('heading',{name:'1位指名',exact:true})).toBeVisible();
 await page.getByLabel('並び順',{exact:true}).selectOption('public');
 if(process.env.CAPTURE_DRAFT)await page.screenshot({path:`docs/validation/draft-decision/after_${width}_list.png`,fullPage:true});
 await page.getByRole('button',{name:'候補検証0のレポート',exact:true}).click();
 await page.getByRole('button',{name:'比較に追加',exact:true}).click();
 await page.getByRole('button',{name:'候補一覧に戻る',exact:true}).click();
 await expect(page.getByRole('button',{name:'候補検証0のレポート',exact:true})).toBeFocused();
 await expect(page.getByLabel('並び順',{exact:true})).toHaveValue('public');
 await page.getByRole('button',{name:'候補検証1のレポート',exact:true}).click();
 await expect(page.getByRole('region',{name:'候補比較'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'候補検証1',exact:true})).toBeFocused();
 if(process.env.CAPTURE_DRAFT){await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`docs/validation/draft-decision/after_${width}_detail.png`,fullPage:true});}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'指名内容を確認',exact:true}).click();
 await expect(page.getByRole('region',{name:'指名内容の確認'})).toBeVisible();
 await page.getByRole('button',{name:'選び直す',exact:true}).click();
 await expect(page.getByRole('button',{name:'指名内容を確認',exact:true})).toBeVisible();
});
