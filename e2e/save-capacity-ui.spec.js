import {test,expect} from '@playwright/test';
import {loadFixture,waitSaveIdle} from './helpers/progression';
for(const width of [360,390,1440])test(`save capacity diagnostic copy and denied clipboard fallback ${width}`,async({page},testInfo)=>{
  test.setTimeout(90000);await page.setViewportSize({width,height:900});
  await loadFixture(page,'initial');await waitSaveIdle(page);
  await page.evaluate(()=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:()=>Promise.reject(new Error('denied'))}});
    const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='baseball_manager_v1')throw new DOMException('full','QuotaExceededError');return set.call(this,k,v);};
  });
  const panel=page.locator('.home-save');await panel.getByRole('button',{name:'保存',exact:true}).click();
  await expect(panel).toContainText('保存失敗');await panel.locator('summary').click();
  await panel.getByRole('button',{name:'保存診断をコピー',exact:true}).click();
  const area=panel.getByRole('textbox');await expect(area).toBeVisible();await expect(panel).toContainText('長押し');
  const report=JSON.parse(await area.inputValue());expect(report.reason).toBe('quota_exceeded');expect(report.localStorage.primaryBytes).toBeGreaterThan(0);
  expect(report.indexedDB.stores.save_chunks.rows).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:testInfo.outputPath(`diagnostic-${width}.png`),fullPage:true});
});
