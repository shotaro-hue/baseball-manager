import {test,expect} from '@playwright/test';
export function registerGrowthDesignCases(){
 for(const width of [360,390,760,761,1023,1024,1440])test(`UI-03D growth states and navigation ${width}`,async({page},testInfo)=>{
  test.setTimeout(60_000);await page.setViewportSize({width,height:width===360?800:width===390?844:900});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const state of ['normal','long','empty','missing','partial','orphan','zero','missing-current','many']){
   await page.goto(`/baseball-manager/e2e/fixtures/ui03d/index.html?state=${state}`);const root=page.locator('.growth-report');await expect(root).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   expect(await root.locator('button,summary').evaluateAll(ns=>ns.filter(n=>n.getClientRects().length && n.getBoundingClientRect().height<44).map(n=>n.textContent))).toEqual([]);
   await expect(root.getByRole('region',{name:/の能力変化$/})).toHaveCount(0);
   const list=root.getByRole('region',{name:'成長記録一覧',exact:true});
   if(state==='empty')await expect(list).toContainText('大きな変化はありません');
   if(state==='missing'){await expect(root).toContainText('成長結果が未記録');await expect(root).not.toContainText('大きな変化はありません');}
   if(state==='partial'){await expect(root).toContainText('一部の成長区分は未記録');await expect(list).toContainText('佐藤 海斗');}
   if(state==='orphan'){await expect(list).toContainText('選手情報未記録');await expect(list).toContainText('+4pt');await expect(list.getByRole('button')).toHaveCount(0);}
   if(state==='many'){
    await expect(list.getByRole('row')).toHaveCount(29);const last=root.getByRole('button',{name:'記録選手27の能力変化を確認',exact:true});await last.scrollIntoViewIfNeeded();const before=await page.evaluate(()=>scrollY);await last.click();const back=root.getByRole('button',{name:'成長一覧に戻る',exact:true});await expect(back).toBeVisible();
    {const box=await back.boundingBox();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(width===360?800:width===390?844:900);}
    await back.click();await expect(last).toBeFocused();expect(Math.abs(await page.evaluate(()=>scrollY)-before)).toBeLessThan(4);
   }
   if(state==='normal'){
    await expect(list.getByRole('row')).toHaveCount(5);
    if(width===360||width===390)expect(await list.getByRole('row').nth(1).evaluate(n=>n.getBoundingClientRect().bottom)).toBeLessThanOrEqual(width===360?800:844);
    await root.getByRole('button',{name:'上昇の記録',exact:true}).click();await expect(list.getByRole('row')).toHaveCount(4);await expect(list).not.toContainText('山田 翔');
    const opener=root.getByRole('button',{name:'佐藤 海斗の能力変化を確認',exact:true});await opener.focus();await page.keyboard.press('Enter');const detail=root.getByRole('region',{name:'佐藤 海斗の能力変化',exact:true});await expect(detail).toBeVisible();await expect(root.getByRole('heading',{name:'佐藤 海斗の能力変化',exact:true})).toBeFocused();
    await root.getByRole('button',{name:'成長一覧に戻る',exact:true}).click();await expect(opener).toBeFocused();await expect(root.getByRole('button',{name:'上昇の記録',exact:true})).toHaveAttribute('aria-pressed','true');
    await root.getByRole('button',{name:'下降の記録',exact:true}).click();await expect(list.getByRole('row')).toHaveCount(2);await expect(list).toContainText('起用見直し候補');await root.getByRole('button',{name:'山田 翔の能力変化を確認',exact:true}).click();await expect(root.getByRole('region',{name:'選んだ選手の能力内訳',exact:true})).toContainText('放出の推奨ではありません');
    await root.getByRole('button',{name:'選手詳細・年度別成績',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(root.getByRole('button',{name:'選手詳細・年度別成績',exact:true})).toBeFocused();
    await root.getByRole('button',{name:'成長一覧に戻る',exact:true}).click();await root.getByRole('button',{name:'記録の全員',exact:true}).click();
    if([360,390,1440].includes(width))await page.screenshot({path:testInfo.outputPath(`growth-${width}.png`),fullPage:true});
    await root.getByRole('button',{name:'編成に戻る',exact:true}).click();await expect(root).toBeHidden();expect(await page.locator('body').getAttribute('data-action')).toBe('close');
   }
   if(state==='zero'||state==='missing-current'){
    await root.getByRole('button',{name:'佐藤 海斗の能力変化を確認',exact:true}).click();const table=root.getByRole('region',{name:'佐藤 海斗の能力変化',exact:true});
    const contact=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'ミート',exact:true})});await expect(contact).toBeVisible();
    expect(await contact.getByRole('cell').allTextContents()).toEqual(state==='zero'?['0','0','0']:['72','未記録','未記録']);
    if(state==='zero'){const arm=table.getByRole('row').filter({has:page.getByRole('rowheader',{name:'肩',exact:true})});expect(await arm.getByRole('cell').allTextContents()).toEqual(['未記録','50','未記録']);}
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   }
  }
  await page.goto('/baseball-manager/e2e/fixtures/ui03d/index.html?embedded=false&state=failure');await page.getByRole('button',{name:'戦力外・自由契約の整理へ',exact:true}).click();await expect(page.getByRole('alert')).toContainText('再試行');await expect(page.getByRole('button',{name:'戦力外・自由契約の整理へ',exact:true})).toBeEnabled();expect(errors).toEqual([]);
 });
 for(const width of [1024,1440])test(`UI-03D growth repeated desktop selection restores visible row ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.goto('/baseball-manager/e2e/fixtures/ui03d/index.html?state=many');
  await page.getByRole('button',{name:'記録選手0の能力変化を確認',exact:true}).click();
  const last=page.getByRole('button',{name:'記録選手27の能力変化を確認',exact:true});
  await last.scrollIntoViewIfNeeded();await last.click();
  await expect(page.getByRole('heading',{name:'記録選手27の能力変化',exact:true})).toBeFocused();
  await page.getByRole('button',{name:'成長一覧に戻る',exact:true}).click();
  await expect(last).toBeFocused();
  await expect.poll(async()=>{
   const box=await last.boundingBox();return box.y>=0&&box.y+box.height<=900;
  }).toBe(true);
 });
}
