import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { readSave, reloadAndLoad, waitSaveIdle } from './helpers/progression';

test('draft automatic picks respect 69/70 capacity and survive real save/reload without duplicate signings',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:390,height:844});
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz',import.meta.url))));
 const mine=fixture.teams.find(t=>t.id===fixture.myId),other=fixture.teams.find(t=>t.id!==fixture.myId);
 const fill=(team,total)=>{const template=team.farm[0]||team.players[0];team.farm=Array.from({length:total-team.players.length},(_,i)=>({...template,id:`draft-owned-${team.id}-${i}`,育成:false,isIkusei:false}));};
 fill(mine,69);fill(other,70);
 // Keep enough candidates for every eligible club; capacity assertions must not depend on losing a lottery after the pool runs out.
 const pool=Array.from({length:fixture.teams.length},(_,i)=>({...mine.players.find(p=>!p.isPitcher),id:`draft-candidate-${i}`,name:`ドラフト検証${i}`,potential:70,育成:false,isIkusei:false}));
 // The draft is a completed-season fixture; farm migration must not infer completion from its screen.
 fixture.gameDay=144;fixture.teams=fixture.teams.map(t=>({...t,wins:0,losses:0,draws:143}));
 fixture.offseasonPlan={version:1,year:fixture.year,myId:fixture.myId,stage:'results',resumeScreen:'draft_lottery',draftPool:pool};
 await page.goto('/');
 await page.evaluate(async s=>{const m=await import('/baseball-manager/src/engine/saveload.js');if(!(await m.saveGame(s)).ok)throw new Error('fixture save failed');},fixture);
 await reloadAndLoad(page);
 await page.getByRole('button',{name:/全ドラフト自動処理/}).click();
 await expect(page.getByText('ドラフト終了！',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);
 const draft=await readSave(page);expect(draft.offseasonPlan.draftAutoSkip).toBe(true);
 await reloadAndLoad(page);await expect(page.getByText('ドラフト終了！',{exact:true})).toBeVisible();
 const resumed=await readSave(page);expect(resumed.offseasonPlan.draftViews.draft).toEqual(draft.offseasonPlan.draftViews.draft);
 await page.getByRole('button',{name:/結果レビューへ/}).click();
 await page.getByRole('button',{name:/シーズン開幕！/}).click();
 await expect(page.getByRole('button',{name:/キャンプ終了・開幕へ/})).toBeVisible();
 await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);
 const signed=await readSave(page);
 const result=s=>s.teams.map(t=>({id:t.id,owned:[...t.players,...t.farm].map(p=>p.id)}));
 const all=signed.teams.flatMap(t=>[...t.players,...t.farm]);
 expect(new Set(all.map(p=>p.id)).size).toBe(all.length);
 const mySigned=signed.teams.find(t=>t.id===mine.id),otherSigned=signed.teams.find(t=>t.id===other.id);
 expect([...mySigned.players,...mySigned.farm].filter(p=>p.id.startsWith('draft-candidate-'))).toHaveLength(1);
 expect([...otherSigned.players,...otherSigned.farm].filter(p=>p.id.startsWith('draft-candidate-'))).toHaveLength(0);
 expect(signed.offseasonPlan).toMatchObject({draftApplied:true,seasonInfo:{draftCount:1}});
 await reloadAndLoad(page);await expect(page.getByRole('button',{name:/キャンプ終了・開幕へ/})).toBeVisible();
 expect(result(await readSave(page))).toEqual(result(signed));
});

test('CPU next-round needs include a saved first-round catcher without acquiring the pick early', async ({ page }) => {
 test.setTimeout(60000);
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz',import.meta.url))));
 await page.goto('/');
 await page.evaluate(async state => {
  const { createInitialTeams }=await import('/baseball-manager/src/engine/bootstrapTeams.js');
  const { saveGame }=await import('/baseball-manager/src/engine/saveload.js');
  const original=Math.random;let seed=4;
  try {Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};state.teams=createInitialTeams();}
  finally {Math.random=original;}
  const cpu=state.teams.find(t=>t.id===0);
  const keep=new Set(cpu.players.filter(p=>p.pos==='捕手').slice(0,2).map(p=>p.id));
  cpu.players=cpu.players.filter(p=>p.pos!=='捕手'||keep.has(p.id));
  cpu.farm=cpu.farm.filter(p=>p.pos!=='捕手');
  state.teams.forEach(t=>{t.wins=t.id===0?0:t.id===1?10:20;t.losses=0;t.draws=143-t.wins;});
  state.myId=1;state.gameDay=144;
  const template=cpu.players.find(p=>p.pos==='捕手');
  const p=(id,pos,extra={})=>({...template,id,name:id,pos,potential:70,readinessScore:50,age:22,
    batting:{contact:60,power:60,eye:60,speed:60},...extra});
  const pool=[p('confirmed-C','捕手',{_drafted:true,_r1winner:0}),p('best-DH','DH'),p('another-C','捕手')];
  state.offseasonPlan={version:1,year:state.year,myId:1,stage:'results',resumeScreen:'draft',draftPool:pool,
    draftViews:{draft:{pickIdx:0,drafted:{},log:[],scouted:[],scoutPt:0}}};
  if(!(await saveGame(state)).ok)throw new Error('draft needs fixture save failed');
 },fixture);
 // Only suppress the existing optional random departure from the scored choice.
 await page.addInitScript(()=>{Math.random=()=>.5;});
 await reloadAndLoad(page);
 await expect(page.getByRole('button',{name:'another-Cを指名',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);
 const saved=await readSave(page);
 expect(saved.offseasonPlan.draftViews.draft.drafted['best-DH']).toBe(0);
 expect(saved.offseasonPlan.draftViews.draft.drafted['another-C']).toBeUndefined();
 expect(saved.teams.flatMap(t=>[...t.players,...t.farm]).some(p=>['confirmed-C','best-DH'].includes(p.id))).toBe(false);
 await reloadAndLoad(page);
 const reopened=await readSave(page);
 expect(reopened.offseasonPlan.draftViews.draft).toEqual(saved.offseasonPlan.draftViews.draft);
 expect(reopened.teams).toEqual(saved.teams);
});

for (const role of ['先発', '中継ぎ', '抑え']) test(`CPU draft includes saved ${role} picks in organizational needs`, async ({ page }) => {
 test.setTimeout(60000);
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz',import.meta.url))));
 await page.goto('/');
 await page.evaluate(async ({state,role}) => {
  const cpu=state.teams.find(t=>t.id===0);
  const pit=cpu.players.find(p=>p.isPitcher),bat=cpu.players.find(p=>!p.isPitcher);
  const pitcher=(id,subtype)=>({...pit,id,name:id,pos:subtype,subtype,isPitcher:true,age:22,
    potential:70,readinessScore:50,pitching:{...pit.pitching,velocity:70},育成:false,isIkusei:false});
  const batter=(id,pos)=>({...bat,id,name:id,pos,isPitcher:false,age:22,potential:70,
    readinessScore:50,batting:{...bat.batting,contact:70},育成:false,isIkusei:false});
  const staff=[...Array.from({length:4},(_,i)=>pitcher(`draft-sp-${i}`,'先発')),
    ...Array.from({length:3},(_,i)=>pitcher(`draft-rp-${i}`,'中継ぎ')),pitcher('draft-cl','抑え')];
  const accepted=staff.find(p=>p.subtype===role);
  cpu.players=[...staff.filter(p=>p.id!==accepted.id),...Array.from({length:3},(_,i)=>batter(`draft-c-${i}`,'捕手')),
    ...['遊撃手','二塁手','三塁手'].flatMap(pos=>[batter(`draft-${pos}-1`,pos),batter(`draft-${pos}-2`,pos)])];
  cpu.farm=[];
  state.teams.forEach(t=>{t.wins=t.id===0?0:t.id===1?10:20;t.losses=0;t.draws=143-t.wins;});
  state.myId=1;state.gameDay=144;
  state.offseasonPlan={version:1,year:state.year,myId:1,stage:'results',resumeScreen:'draft',
    draftPool:[{...accepted,_drafted:true,_r1winner:0},batter('draft-best-batter','DH'),pitcher('draft-another-pitcher',role)],
    draftViews:{draft:{pickIdx:0,drafted:{},log:[],scouted:[],scoutPt:0}}};
  const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');
  if(!(await saveGame(state)).ok)throw new Error('pitcher draft fixture save failed');
 },{state:fixture,role});
 await page.addInitScript(()=>{Math.random=()=>.5;});
 await reloadAndLoad(page);
 await expect(page.getByRole('button',{name:'draft-another-pitcherを指名',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'途中保存',exact:true}).click();await waitSaveIdle(page);
 const saved=await readSave(page);
 expect(saved.offseasonPlan.draftViews.draft.drafted['draft-best-batter']).toBe(0);
 expect(saved.offseasonPlan.draftViews.draft.drafted['draft-another-pitcher']).toBeUndefined();
 expect(saved.teams.find(t=>t.id===0).farm).toEqual([]);
 await reloadAndLoad(page);
 const reopened=await readSave(page);
 expect(reopened.offseasonPlan.draftViews.draft).toEqual(saved.offseasonPlan.draftViews.draft);
 expect(reopened.teams).toEqual(saved.teams);
});

// Fixed candidate order/ability makes the old wantsPitcher bonus select the
// covered closer. After save/reload, the next CPU turn must use its accepted SP.
test('role-specific CPU picks fill SP then relief across actual save/load and next round', async ({ page }) => {
 test.setTimeout(60000); await page.setViewportSize({width:390,height:844});
 const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz',import.meta.url))));
 await page.goto('/');
 await page.evaluate(async state => {
  const cpu=state.teams.find(t=>t.id===0);
  const pit=cpu.players.find(p=>p.isPitcher),bat=cpu.players.find(p=>!p.isPitcher);
  const pitcher=(id,subtype)=>({...pit,id,name:id,pos:subtype,subtype,isPitcher:true,age:22,
    potential:70,readinessScore:50,pitching:{...pit.pitching,velocity:70},育成:false,isIkusei:false});
  const batter=(id,pos)=>({...bat,id,name:id,pos,isPitcher:false,age:22,potential:70,
    readinessScore:50,batting:{...bat.batting,contact:70},育成:false,isIkusei:false});
  cpu.players=[...Array.from({length:3},(_,i)=>pitcher(`role-sp-${i}`,'先発')),
    ...Array.from({length:2},(_,i)=>pitcher(`role-rp-${i}`,'中継ぎ')),pitcher('role-cl','抑え'),
    ...Array.from({length:3},(_,i)=>batter(`role-c-${i}`,'捕手')),
    ...['遊撃手','二塁手','三塁手'].flatMap(pos=>[batter(`role-${pos}-1`,pos),batter(`role-${pos}-2`,pos)])];
  cpu.farm=[];
  state.teams.forEach(t=>{
    t.wins=t.id===0?0:t.id===1?10:20;t.losses=0;t.draws=143-t.wins;
    if(t.id!==0&&t.id!==1) t.farm=Array.from({length:70-t.players.length},(_,i)=>batter(`full-${t.id}-${i}`,'DH'));
  });
  state.myId=1;state.gameDay=144;
  state.offseasonPlan={version:1,year:state.year,myId:1,stage:'results',resumeScreen:'draft',
    draftPool:[pitcher('role-covered-closer','抑え'),pitcher('role-needed-SP','先発'),
      pitcher('role-needed-relief','中継ぎ'),pitcher('role-spare-SP','先発')],
    draftViews:{draft:{pickIdx:0,drafted:{},log:[],scouted:[],scoutPt:0}}};
  const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');
  if(!(await saveGame(state)).ok)throw new Error('role draft fixture save failed');
 },fixture);
 await page.addInitScript(()=>{Math.random=()=>.5;});
 await reloadAndLoad(page);
 await expect(page.getByRole('button',{name:'role-covered-closerを指名',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'途中保存',exact:true}).click(); await waitSaveIdle(page);
 const second=await readSave(page);
 expect(second.offseasonPlan.draftViews.draft.drafted['role-needed-SP']).toBe(0);
 expect(second.offseasonPlan.draftViews.draft.drafted['role-covered-closer']).toBeUndefined();
 expect(second.teams.find(t=>t.id===0).farm).toEqual([]);
 await reloadAndLoad(page);
 await expect(page.getByRole('button',{name:'role-covered-closerを指名',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'role-covered-closerを指名',exact:true}).click();
 await expect(page.getByRole('button',{name:'role-spare-SPを指名',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'途中保存',exact:true}).click(); await waitSaveIdle(page);
 const third=await readSave(page);
 expect(third.offseasonPlan.draftViews.draft.drafted['role-needed-SP']).toBe(0);
 expect(third.offseasonPlan.draftViews.draft.drafted['role-needed-relief']).toBe(0);
 expect(third.offseasonPlan.draftViews.draft.drafted['role-spare-SP']).toBeUndefined();
 expect(third.teams.find(t=>t.id===0).farm).toEqual([]);
 await reloadAndLoad(page);
 await expect(page.getByRole('button',{name:'role-spare-SPを指名',exact:true})).toBeVisible();
 const reopened=await readSave(page);
 expect(reopened.offseasonPlan.draftViews.draft).toEqual(third.offseasonPlan.draftViews.draft);
 expect(reopened.teams).toEqual(third.teams);
});
