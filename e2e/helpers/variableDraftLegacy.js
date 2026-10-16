import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {installVariableDraft,saveVariableDraft} from './variableDraft.js';
import {readSave,reloadAndLoad} from './progression.js';

export function registerLegacyDraftCase(){
 test('legacy 80-candidate six-round save retains cursor, records and scouting through completion',async({page})=>{
  test.setTimeout(180000);await page.setViewportSize({width:390,height:844});
  const legacyPool=JSON.parse(gunzipSync(readFileSync(new URL('../../docs/validation/variable-draft/legacy80-pool.json.gz',import.meta.url))));
  const info=await installVariableDraft(page,{screen:'draft',legacy:true,legacyPool,legacyProgress:true});
  await expect(page.getByRole('heading',{name:'4巡目',exact:true})).toBeVisible();
  await expect(page.getByText('当年指名 3/6人',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'選択を終了する',exact:true})).toHaveCount(0);
  const before=await saveVariableDraft(page),view=before.offseasonPlan.draftViews.draft;
  expect(before.offseasonPlan.draftRules).toBeUndefined();expect(before.offseasonPlan.draftPool).toHaveLength(80);expect(view.scoutPt).toBe(0);
  const records=s=>s.teams.map(t=>({id:t.id,history:t.history,players:[...t.players,...t.farm].filter(p=>info.owned.find(x=>x.id===t.id).ids.includes(p.id)).map(p=>({id:p.id,stats:p.stats,playoffStats:p.playoffStats,career:p.career,recentCareerLog:p.recentCareerLog}))}));
  const original=records(before);
  await reloadAndLoad(page);await expect(page.getByRole('heading',{name:'4巡目',exact:true})).toBeVisible({timeout:30000});
  const reloaded=await readSave(page);
  expect(reloaded.offseasonPlan.draftViews.draft).toEqual(view);expect(reloaded.offseasonPlan.draftPool).toEqual(before.offseasonPlan.draftPool);expect(records(reloaded)).toEqual(original);
  await page.evaluate(()=>{Math.random=()=>.5;});await page.getByRole('button',{name:'残りを自動処理',exact:true}).click();
  await expect(page.getByRole('heading',{name:'ドラフト終了',exact:true})).toBeVisible({timeout:30000});
  const done=await saveVariableDraft(page);expect(done.offseasonPlan.draftPool.map(p=>p.id)).toEqual(info.ids);
  await expect(page.getByText('当年指名 6/6人',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'結果レビューへ →',exact:true}).click();await page.getByRole('button',{name:/シーズン開幕！/}).click();
  await expect(page.getByRole('button',{name:/キャンプ終了・開幕へ/})).toBeVisible();
  const signed=await saveVariableDraft(page);expect(signed.offseasonPlan.seasonInfo.draftCount).toBe(6);expect(records(signed)).toEqual(original);
  const mine=signed.teams.find(t=>t.id===info.myId);expect([...mine.players,...mine.farm]).toHaveLength(66);
 });
}
