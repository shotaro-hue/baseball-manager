import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { mainNavigation, reloadAndLoad, saveHub } from './helpers/progression';

async function setup(page, cpu = false) {
  const fixture = JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz', import.meta.url))));
  const mine=fixture.teams.find(t=>t.id===fixture.myId), other=fixture.teams.find(t=>t.id!==fixture.myId);
  const incoming=other.players.find(p=>!p.isPitcher);
  incoming.name='取引対象野手'; incoming.age=35; incoming.potential=30;
  incoming.batting={...incoming.batting,contact:10,power:10,eye:10,speed:10,clutch:10};
  const used=new Set([...(mine.lineupDh||[]),...(mine.lineupNoDh||[]),...(mine.rotation||[])]);
  const outgoing=mine.players.find(p=>!used.has(p.id));
  if(!outgoing) throw new Error('fixture has no bench player');
  fixture.mailbox=cpu?[{id:'trade-test',type:'trade',title:'取引検証',read:false,resolved:false,
    offer:{from:other,want:[outgoing],offer:[incoming],cash:5000000}}]:[];
  await page.goto('/');
  await page.evaluate(async fixture=>{
    const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');
    if(!(await saveGame(fixture)).ok) throw new Error('fixture save failed');
  },fixture);
  await reloadAndLoad(page);
  await mainNavigation(page,true).getByRole('button',{name:/^その他/}).click();
  if (!cpu) await page.getByRole('button',{name:/^トレード\d*$/}).click();
  return {mine,other,incoming,outgoing};
}
function summary(saved, f) {
  const mine=saved.teams.find(t=>t.id===f.mine.id), other=saved.teams.find(t=>t.id===f.other.id);
  const all=saved.teams.flatMap(t=>[...(t.players||[]),...(t.farm||[])]);
  return {budgets:[mine.budget,other.budget],myActive:mine.players.map(p=>p.id),myFarm:mine.farm.map(p=>p.id),
    otherOwned:[...other.players,...other.farm].map(p=>p.id),unique:new Set(all.map(p=>p.id)).size===all.length,
    history:mine.history, transfers:saved.seasonHistory?.transfers,mailbox:saved.mailbox};
}
for(const cpu of [false,true]) {
  test(`trade ${cpu?'legacy CPU mail':'manual 500万円'} survives real save and reload`,async({page})=>{
    test.setTimeout(60000);await page.setViewportSize({width:390,height:844});
    const f=await setup(page,cpu);
    if(cpu) {
      await page.getByText('取引検証',{exact:true}).click();
      await page.getByRole('button',{name:'✅ 承諾する',exact:true}).click();
    }
    else {
      await page.getByText(f.other.name,{exact:false}).click();
      await page.getByText('取引対象野手',{exact:true}).first().locator('..').locator('..').locator('..').click();
      await page.locator('input[type="number"]').fill('500');
      await page.getByRole('button',{name:'📨 トレードを提案する',exact:true}).click();
      await expect(page.getByText('トレード成立！',{exact:true})).toBeVisible();
    }
    const first=summary(await saveHub(page),f);
    expect(first.budgets).toEqual(cpu?[f.mine.budget+500,f.other.budget-500]:[f.mine.budget-500,f.other.budget+500]);
    expect(first.transfers.filter(t=>t.type==='trade')).toHaveLength(1);
    expect(first.transfers.at(-1).cash).toBe(cpu?-500:500);
    expect(first.unique).toBe(true);expect([...first.myActive,...first.myFarm]).toContain(f.incoming.id);
    expect(first.otherOwned).not.toContain(f.incoming.id);
    if(cpu){expect(first.otherOwned).toContain(f.outgoing.id);expect(first.mailbox.find(m=>m.id==='trade-test').resolved).toBe(true);
      expect(first.history.filter(p=>p.id===f.outgoing.id && p.exitReason==='トレード')).toHaveLength(1);
    }
    else {expect(first.myActive).toHaveLength(28);expect(first.myFarm).toContain(f.incoming.id);}
    await reloadAndLoad(page);const loaded=summary(await saveHub(page),f);
    expect(loaded).toEqual(first);
  });
}
