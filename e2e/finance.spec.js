import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { waitSaveIdle, reloadAndLoad } from './helpers/progression';
export function financeFixture() {
  const fixture=JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/new-game.json.gz',import.meta.url))));
  const t=fixture.teams.find(t=>t.id===fixture.myId);
  for(const p of [...t.players,...t.farm]) {p.salary=0;p.育成=false;}
  Object.assign(t.players[0],{salary:100,name:'財務一軍100'});
  Object.assign(t.players[1],{salary:500,name:'財務一軍500'});
  Object.assign(t.farm[0],{salary:900,name:'財務二軍900'});
  Object.assign(t.farm[1],{salary:300,name:'財務育成300',育成:true});
  return fixture;
}
async function openFinance(page,width) {
  const nav=width<760?page.getByRole('navigation',{name:'メインメニュー'}):page.getByRole('complementary',{name:'監督メニュー'});
  await nav.getByRole('button',{name:/その他/}).click();
  await page.getByRole('button',{name:'球団運営',exact:true}).click();
}
async function saveFinanceSignature(page) {
  await waitSaveIdle(page);
  await page.getByRole('button',{name:'保存',exact:true}).click();
  await waitSaveIdle(page);
  return page.evaluate(async()=>{
    const saved=await (await import('/baseball-manager/src/engine/saveload.js')).loadGame();
    const t=saved.teams.find(t=>t.id===saved.myId);
    const result=Object.fromEntries(['lineup','lineupDh','lineupNoDh','rotation','bullpen','closer','pitchingStaff','rotIdx','budget'].map(k=>[k,t[k]]));
    for(const key of ['players','farm'])result[key]=t[key].map(p=>Object.fromEntries(['id','name','salary','育成','pos','subtype','isPitcher','contractYears','contractYearsLeft','stats'].map(k=>[k,p[k]])));
    return result;
  });
}
for(const width of [360,390,1440]) test(`finance ${width}: owned totals and unchanged roster through display/save/reload`,async({page},testInfo)=>{
  test.setTimeout(60_000);
  await page.setViewportSize({width,height:width===1440?1000:844});
  const fixture=financeFixture();
  await page.goto('/');
  await page.evaluate(async fixture=>{const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');if(!(await saveGame(fixture)).ok)throw new Error('finance fixture save failed');},fixture);
  await page.reload();await page.getByRole('button',{name:'続きから',exact:true}).click();
  await expect(page.locator('.topbar')).toBeVisible();
  const before=await saveFinanceSignature(page);
  await openFinance(page,width);
  const payroll=page.getByTestId('contract-payroll');
  await expect(payroll).toContainText('選手契約年俸（年額）');
  for(const [key,value] of [['active','600万円'],['farm','900万円'],['development','300万円'],['total','1,800万円']]) await expect(page.getByTestId(`payroll-${key}`)).toContainText(value);
  const ranks=page.getByTestId('salary-ranking').locator('button');
  expect((await ranks.allTextContents()).slice(0,4)).toEqual(['財務二軍900','財務一軍500','財務育成300','財務一軍100']);
  const contrasts=await page.evaluate(()=>{
    const luminance=color=>{
      const values=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
      return values[0]*.2126+values[1]*.7152+values[2]*.0722;
    };
    return ['.finance-payroll .card-h','.finance-budget > .finance-budget-amount'].map(selector=>{
      const element=document.querySelector(selector)||document.querySelector('.finance-budget > div:nth-child(2)');
      const fg=luminance(getComputedStyle(element).color),bg=luminance(getComputedStyle(element.closest('.card')).backgroundColor);
      return (Math.max(fg,bg)+.05)/(Math.min(fg,bg)+.05);
    });
  });
  expect(contrasts[0]).toBeGreaterThanOrEqual(4.5);
  expect(contrasts[1]).toBeGreaterThanOrEqual(3);
  await payroll.scrollIntoViewIfNeeded();
  await testInfo.attach(`finance-${width}`,{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect(await saveFinanceSignature(page)).toEqual(before);
  await page.getByRole(width<760?'navigation':'complementary',{name:width<760?'メインメニュー':'監督メニュー'}).getByRole('button',{name:'ホーム',exact:true}).click();
  await openFinance(page,width);expect(await saveFinanceSignature(page)).toEqual(before);
  await reloadAndLoad(page);await expect(page.locator('.topbar')).toBeVisible();
  await openFinance(page,width);
  for(const [key,value] of [['active','600万円'],['farm','900万円'],['development','300万円'],['total','1,800万円']]) await expect(page.getByTestId(`payroll-${key}`)).toContainText(value);
  expect((await ranks.allTextContents()).slice(0,4)).toEqual(['財務二軍900','財務一軍500','財務育成300','財務一軍100']);
  expect(await saveFinanceSignature(page)).toEqual(before);
});

test('finance missing and invalid amounts are visible while recorded zero remains valid',async({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  const fixture=financeFixture(),t=fixture.teams.find(t=>t.id===fixture.myId);
  t.players[0].salary=null;t.farm[0].salary=-1;
  await page.goto('/');
  await page.evaluate(async fixture=>{if(!(await (await import('/baseball-manager/src/engine/saveload.js')).saveGame(fixture)).ok)throw new Error('save failed');},fixture);
  await page.reload();await page.getByRole('button',{name:'続きから',exact:true}).click();await expect(page.locator('.topbar')).toBeVisible();
  await openFinance(page,390);
  await expect(page.getByTestId('contract-payroll').getByRole('status')).toContainText('年俸の未記録 1名・不正値 1名');
  await expect(page.getByTestId('payroll-total')).toContainText('合計（確認済み分）800万円');
  await expect(page.getByTestId('payroll-active')).toContainText('未記録 1名');
  await expect(page.getByTestId('payroll-farm')).toContainText('不正値 1名');
  await expect(page.getByTestId('salary-ranking')).toContainText('0万円');
  await page.getByTestId('contract-payroll').scrollIntoViewIfNeeded();
  await testInfo.attach('finance-missing-invalid',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
