import {loadFixture,runBatch,saveHub,reloadAndLoad,mainNavigation} from './progression';
import {test,expect} from '@playwright/test';
export function registerHistoryDesignCases(){
 for(const width of [360,390,760,761,1023,1024,1440])test(`UI-01E history states and dialog return ${width}`,async({page},testInfo)=>{
  test.setTimeout(60_000);await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const state of ['normal','long','empty','loading','missing','partial','club']){
   await page.goto(`/baseball-manager/e2e/fixtures/ui01e/index.html?state=${state}`);
   if(state==='club')await page.getByRole('button',{name:'日程・結果',exact:true}).click();
   const scope=page.locator(state==='club'?'.team-history':'.history-schedule');await expect(scope).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const small=await scope.locator('button').evaluateAll(ns=>ns.filter(n=>n.getBoundingClientRect().height<44).map(n=>n.textContent));expect(small).toEqual([]);
   if(['loading','empty'].includes(state))continue;
   if(state!=='club')await page.getByRole('button',{name:'2025年',exact:true}).click();
   const opener=scope.locator(state==='club'?'.team-history-score':'.schedule-score').first();await opener.focus();await page.keyboard.press('Enter');
   const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();await expect(dialog).toContainText(state==='club'?'2026年3月31日':'2025年3月31日');
   if(state==='partial')await expect(dialog).toContainText('相手 打者');
   if(state==='missing')await expect(dialog).toContainText('詳細成績データなし');
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const close=dialog.getByRole('button',{name: /閉じる/});await expect(close).toBeFocused();
   const controls=dialog.locator('button,[tabindex="0"]');await controls.last().focus();await page.keyboard.press('Tab');await expect(close).toBeFocused();await page.keyboard.press('Shift+Tab');await expect(controls.last()).toBeFocused();
   await page.keyboard.press('Escape');await expect(dialog).toBeHidden();await expect(opener).toBeFocused();expect(await page.locator('body').evaluate(n=>n.style.overflow)).not.toBe('hidden');
   if(state==='normal'){
    await expect(page.getByRole('button',{name:'2025年',exact:true})).toHaveAttribute('aria-pressed','true');
    await page.getByRole('button',{name:'カレンダー',exact:true}).click();await expect(page.locator('.calendar-day-button')).toHaveCount(1);
    if([360,390,1440].includes(width))await page.screenshot({path:testInfo.outputPath(`calendar-${width}.png`),fullPage:true});
    await page.getByRole('button',{name:'4月',exact:true}).click();await page.getByRole('button',{name:'一覧',exact:true}).click();await page.locator('.schedule-score').click();await expect(page.getByRole('dialog')).toContainText('引き分け');await expect(page.getByRole('dialog')).toContainText('ビジター');await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'4月',exact:true})).toHaveAttribute('aria-pressed','true');
   }
  }expect(errors).toEqual([]);
 });
 for(const width of [360,390,1440])test(`UI-01E actual App history return and saved records ${width}`,async({page},testInfo)=>{
  test.setTimeout(90_000);await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await loadFixture(page,'opening');await runBatch(page,width<=760,10);const before=await saveHub(page);
  const nav=()=>mainNavigation(page,width<1024);
  await nav().getByRole('button',{name:'日程',exact:true}).click();
  expect(await page.locator('.calm-shell').evaluate(n=>getComputedStyle(n).backgroundImage)).toBe('none');
  const month=before.schedule[1].date.month;await page.getByRole('button',{name:`${month}月`,exact:true}).click();await page.getByRole('button',{name:'カレンダー',exact:true}).click();
  const target=Object.keys(before.gameResultsMap).find(key=>{const date=before.schedule[key].date;return date.month===month && new Date(before.year,date.month-1,date.day).getDay()>=5;})||'1';
  const opener=page.locator(`[data-history-game="${target}"]`);await opener.scrollIntoViewIfNeeded();
  const calendar=page.locator('.schedule-calendar-scroll'),scrollLeft=await calendar.evaluate(n=>n.scrollLeft);
  await opener.click();await expect(page.getByRole('heading',{name:'試合結果',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'日程に戻る',exact:true}).click();await expect(page.getByRole('button',{name:'カレンダー',exact:true})).toHaveAttribute('aria-pressed','true');await expect(page.getByRole('button',{name:`${month}月`,exact:true})).toHaveAttribute('aria-pressed','true');await expect(opener).toBeFocused();
  expect(await calendar.evaluate(n=>n.scrollLeft)).toBe(scrollLeft);
  expect(await opener.evaluate(n=>{const a=n.getBoundingClientRect(),b=n.closest('.schedule-calendar-scroll').getBoundingClientRect();return a.left>=b.left&&a.right<=b.right;})).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`app-schedule-${width}.png`),fullPage:true});
  await page.getByRole('button',{name:'一覧',exact:true}).click();
  await nav().getByRole('button',{name:'成績',exact:true}).click();await nav().getByRole('button',{name:'日程',exact:true}).click();
  await expect(page.getByRole('button',{name:'一覧',exact:true})).toHaveAttribute('aria-pressed','true');
  await nav().getByRole('button',{name:'成績',exact:true}).click();await page.getByRole('button',{name:'順位表',exact:true}).click();
  const ownClub=before.teams.find(t=>t.id===before.myId);const club=before.teams.find(t=>t.league===ownClub.league && before.allTeamBoxScoresMap?.[t.id]?.[1]?.myBatting?.length);expect(club).toBeTruthy();await page.getByRole('button').filter({hasText:club.name}).click();await page.getByRole('button',{name:'日程・結果',exact:true}).click();
  const score=page.locator('.team-history-score').first();await score.click();const dialog=page.getByRole('dialog',{name:'試合詳細',exact:true});
  const date=before.schedule[1].date;await expect(dialog).toContainText(`${before.year}年${date.month}月${date.day}日`);await expect(dialog).toContainText(`${club.name}の視点`);
  const record={...before.allTeamResultsMap[club.id][1],...(before.allTeamBoxScoresMap?.[club.id]?.[1]||{})};
  await expect(dialog.locator('.history-score-clubs')).toContainText(String(record.myScore));
  expect(record.myBatting.length).toBeGreaterThan(0);const home=record.homeId===club.id;
  for(const rows of [record.myBatting??(home?record.homeBatting:record.awayBatting),record.oppBatting??(home?record.awayBatting:record.homeBatting),record.myPitching??(home?record.homePitching:record.awayPitching),record.oppPitching??(home?record.awayPitching:record.homePitching)])for(const row of rows||[])await expect(dialog).toContainText(row.name);
  await dialog.screenshot({path:testInfo.outputPath(`app-box-${width}.png`)});await page.keyboard.press('Escape');await expect(score).toBeFocused();await page.getByRole('button',{name:'← 戻る',exact:true}).click();
  const after=await saveHub(page);expect(after.teams).toEqual(before.teams);expect(after.gameResultsMap).toEqual(before.gameResultsMap);expect(after.allTeamBoxScoresMap).toEqual(before.allTeamBoxScoresMap);expect(JSON.stringify(after)).not.toContain('_scheduleView');
  await reloadAndLoad(page);await nav().getByRole('button',{name:'日程',exact:true}).click();await page.getByRole('button',{name:`${month}月`,exact:true}).click();await page.locator('.schedule-score').first().click();await expect(page.getByRole('heading',{name:'試合結果',exact:true})).toBeVisible();await page.getByRole('button',{name:'日程に戻る',exact:true}).click();expect(errors).toEqual([]);
 });

}
