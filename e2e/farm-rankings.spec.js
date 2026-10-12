import {test,expect} from '@playwright/test';
import {loadFixture,mainNavigation,saveHub,reloadAndLoad} from './helpers/progression';

const fixture='/baseball-manager/e2e/fixtures/ui02d3/index.html';
async function layout(page,root){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page must not scroll horizontally').toBe(true);
 expect(await root.locator('button,select,summary,.farm-qualified').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length&&(n.getBoundingClientRect().height<44||n.getBoundingClientRect().width<44)).map(n=>n.textContent)),'visible controls have 44px targets').toEqual([]);
}
for(const width of [360,390,760,761,1023,1024,1440]){
 test(`UI-02D3 farm ranking annual states and responsive operations ${width}`,async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width,height:width===360?800:width===390?844:900});
  for(const state of ['normal','long','partial','empty','legacy','unplayed']){
   await page.goto(`${fixture}?state=${state}`);
   const root=page.getByRole('region',{name:'二軍ランキング',exact:true});
   await expect(root).toBeVisible();await layout(page,root);
   if(state==='legacy'){await expect(root).toContainText('未記録');await expect(root.locator('table')).toHaveCount(0);continue;}
   if(state==='partial')await expect(root).toContainText('6試合目からの途中記録');
   if(state==='empty')await expect(root).toContainText('対象の選手はいません');
   for(const [kind,file] of [['打撃','batter'],['投球','pitcher']]){
    await root.getByRole('tab',{name:kind,exact:true}).click();await layout(page,root);
    const frame=root.getByRole('region',{name:'二軍選手ランキング。横にスクロールできます',exact:true});
    await frame.focus();await expect(frame).toBeFocused();
    if(state==='normal'){
     const target=frame.getByRole('row').filter({hasText:kind==='打撃'?'分母なし':'0アウト投手'});
     await expect(target.locator(`[data-metric="${kind==='打撃'?'AVG':'ERA'}"]`)).toHaveText('— 算出不可');
     if(kind==='投球')await expect(frame.getByRole('row').filter({hasText:'短回投手'}).locator('[data-metric="ERA"]')).toHaveText('0.00');
     if(width<=760){
      // Rank + name + selected value all fit in the initial viewport.
      expect(await frame.evaluate(n=>{const r=n.getBoundingClientRect(),cells=n.querySelectorAll('tbody tr:first-child td');return [cells[1],cells[2]].every(c=>{const b=c.getBoundingClientRect();return b.left>=r.left&&b.right<=r.right;});})).toBe(true);
     }
     if([360,390,1440].includes(width)){
      await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`docs/validation/ui02d3/after-${file}-${width}.png`,fullPage:true});
     }
    }
    if(state!=='empty'&&await frame.evaluate(n=>n.scrollWidth>n.clientWidth)){
     await frame.evaluate(n=>{n.scrollLeft=240;});
     const cell=frame.locator('tbody tr:first-child td:nth-child(2)');await expect(cell).toBeInViewport();
     expect(await cell.evaluate(n=>Math.abs(n.getBoundingClientRect().left-n.closest('[role="region"]').getBoundingClientRect().left)<2)).toBe(true);
     await frame.evaluate(n=>{n.scrollLeft=0;});
    }
    await root.getByRole('button',{name:'詳細指標',exact:true}).click();await layout(page,root);
    await expect(frame.locator('thead')).toContainText(kind==='打撃'?'打点':'QS');
    expect(await frame.locator('th,td').evaluateAll(ns=>ns.filter(n=>n.scrollWidth>n.clientWidth+1).map(n=>n.textContent)),'detailed values and headings must fit within their own cells').toEqual([]);
    await root.getByRole('button',{name:'主要指標',exact:true}).click();
   }
   await root.locator('.farm-status > summary').click();await layout(page,root);
   if(state==='unplayed'){
    await root.getByText('未実施理由',{exact:true}).click();await expect(root).toContainText('捕手不足（0/1）・1カード');
   }
   await root.getByLabel('二軍年度',{exact:true}).selectOption('2026');await expect(root).toContainText('過年度');
   await expect(root).toContainText('過年度の未実施理由は未記録');
   await expect(root.locator('.farm-awards')).toContainText('短回投手（東A）／同率投手（東B）');
   await root.getByRole('tab',{name:'打撃',exact:true}).click();
   await root.getByRole('region',{name:'二軍選手ランキング。横にスクロールできます'}).getByRole('button',{name:'現役打者',exact:true}).click();
   const detail=root.getByRole('region',{name:'二軍記録詳細',exact:true});
   await expect(detail).toContainText('2026年（過年度）');await detail.getByText('球団別内訳',{exact:true}).click();
   const stints=detail.getByRole('region',{name:'二軍球団別内訳。横にスクロールできます',exact:true});
   await expect(stints).toContainText('西A');await expect(stints).toContainText('イースタン');await layout(page,detail);
   if(state==='normal'&&[360,390,1440].includes(width))await detail.screenshot({path:`docs/validation/ui02d3/after-record-${width}.png`});
   await page.getByRole('button',{name:'閲覧データ非変更を確認',exact:true}).click();
  }
  expect(errors).toEqual([]);
 });
}
test('UI-02D3 filters ties qualifications annual details and keyboard restore selection',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:390,height:844});await page.goto(fixture);
 const root=page.getByRole('region',{name:'二軍ランキング',exact:true});
 await root.getByRole('tab',{name:'打撃',exact:true}).focus();await page.keyboard.press('End');await expect(root.getByRole('tab',{name:'投球',exact:true})).toBeFocused();
 await page.keyboard.press('Home');await expect(root.getByRole('tab',{name:'打撃',exact:true})).toBeFocused();
 await root.getByLabel('二軍順位指標').selectOption('HR');await root.getByLabel('規定到達者のみ').check();
 const frame=root.getByRole('region',{name:'二軍選手ランキング。横にスクロールできます'});
 const rows=frame.locator('tbody tr');await expect(rows).toHaveCount(3);await expect(rows.nth(0).locator('td').first()).toHaveText('1');await expect(rows.nth(1).locator('td').first()).toHaveText('1');
 await expect(frame).not.toContainText('規定未達');await expect(frame.getByRole('row').filter({hasText:'分母なし'}).locator('[data-metric=HR]')).toHaveText('0');
 await root.getByLabel('二軍球団',{exact:true}).selectOption('1');await expect(rows).toHaveCount(1);
 const opener=frame.getByRole('button',{name:'同率打者',exact:true});await opener.focus();const scroll=await page.evaluate(()=>window.scrollY);await page.keyboard.press('Space');
 const detail=root.getByRole('region',{name:'二軍記録詳細',exact:true});await expect(detail.getByRole('button',{name:'記録詳細を閉じる',exact:true})).toBeFocused();await expect(detail).toContainText('読取専用');
 await expect(detail.getByRole('button',{name:'現在の選手詳細を開く',exact:true})).toHaveCount(0);
 await detail.getByLabel('選手二軍年度').selectOption('2026');await expect(detail).toContainText('2026年（過年度）');await page.keyboard.press('Escape');
 await expect(detail).toHaveCount(0);await expect(opener).toBeFocused();expect(await page.evaluate(()=>window.scrollY)).toBe(scroll);
 await expect(root.getByLabel('二軍球団',{exact:true})).toHaveValue('1');await expect(root.getByLabel('二軍順位指標')).toHaveValue('HR');await expect(root.getByLabel('規定到達者のみ')).toBeChecked();
 await root.getByLabel('二軍リーグ').selectOption('パ');await expect(root.getByLabel('二軍球団',{exact:true})).toHaveValue('all');await expect(frame).toContainText('西A');
 await root.getByLabel('二軍リーグ').selectOption('セ');await root.getByLabel('規定到達者のみ').uncheck();await root.getByLabel('二軍年度',{exact:true}).selectOption('2026');
 await frame.getByRole('button',{name:'現役打者',exact:true}).click();await detail.getByRole('button',{name:'現在の選手詳細を開く',exact:true}).click();
 const modal=page.locator('.player-modal-card');await expect(modal).toContainText('一軍・2027年');await expect(modal).toContainText('二軍実測');
 await modal.getByRole('button',{name:'選手詳細を閉じる',exact:true}).focus();await page.keyboard.press('Shift+Tab');await expect(modal.getByRole('button',{name:'元の画面に戻る',exact:true})).toBeFocused();
 await page.keyboard.press('Shift+Tab');await expect(modal.getByRole('button',{name:'トレードへ',exact:true})).toBeFocused();await page.keyboard.press('Escape');
 await expect(detail.getByRole('button',{name:'現在の選手詳細を開く',exact:true})).toBeFocused();await expect(root.getByLabel('二軍年度',{exact:true})).toHaveValue('2026');
 await detail.getByRole('button',{name:'現在の選手詳細を開く',exact:true}).click();await modal.getByRole('button',{name:'起用へ',exact:true}).click();await expect(page.getByRole('status')).toContainText('編成へ戻りました');
 await page.getByRole('button',{name:'閲覧データ非変更を確認',exact:true}).click();expect(errors).toEqual([]);
});
for(const width of [360,390,1440])test(`UI-02D3 actual app farm to player roster and saved data unchanged ${width}`,async({page})=>{
 test.setTimeout(90_000);await page.setViewportSize({width,height:width===360?800:width===390?844:900});await loadFixture(page,'opening');
 const expected=await page.evaluate(async()=>{
  const {loadGame,saveGame}=await import('/baseball-manager/src/engine/saveload.js');
  const {createFarmCompetition,applyFarmRound}=await import('/baseball-manager/src/engine/farmRecords.js');
  const {simulateFarmRound}=await import('/baseball-manager/src/engine/farmGame.js');
  const s=await loadGame();s.farmCompetition=applyFarmRound(createFarmCompetition({teams:s.teams,saveId:s.saveId,year:s.year}),simulateFarmRound({teams:s.teams,saveId:s.saveId,year:s.year,round:1}),s.teams);
  s.teams=s.teams.map(t=>({...t,draws:1}));s.gameDay=2;
  s.farmCompetitionVersion=1;if(!(await saveGame(s)).ok)throw new Error('farm fixture save failed');
  const own=s.farmCompetition.players.find(p=>!p.isPitcher&&p.teams.some(t=>t.teamId===s.myId));return {name:own.name};
 });
 await reloadAndLoad(page);const before=await saveHub(page);
 await mainNavigation(page,width<1024).getByRole('button',{name:'成績',exact:true}).click();await page.getByRole('tab',{name:'二軍',exact:true}).click();
 const root=page.getByRole('region',{name:'二軍ランキング',exact:true});await root.getByLabel('二軍順位指標').selectOption('PA');
 await root.getByRole('button',{name:expected.name,exact:true}).click();const detail=root.getByRole('region',{name:'二軍記録詳細',exact:true});
 await detail.getByRole('button',{name:'現在の選手詳細を開く',exact:true}).click();const modal=page.locator('.player-modal-card');await expect(modal).toContainText(expected.name);
 await modal.getByRole('button',{name:'元の画面に戻る',exact:true}).click();await expect(detail.getByRole('button',{name:'現在の選手詳細を開く',exact:true})).toBeFocused();
 await expect(root.getByLabel('二軍順位指標')).toHaveValue('PA');await detail.getByRole('button',{name:'現在の選手詳細を開く',exact:true}).click();
 await modal.getByRole('button',{name:'起用へ',exact:true}).click();await expect(page.locator('.roster-overview')).toBeVisible();
 const after=await saveHub(page);expect(after.teams).toEqual(before.teams);expect(after.farmCompetition).toEqual(before.farmCompetition);expect(after.seasonHistory).toEqual(before.seasonHistory);
 await reloadAndLoad(page);const restored=await saveHub(page);expect(restored.teams).toEqual(before.teams);expect(restored.farmCompetition).toEqual(before.farmCompetition);
});
