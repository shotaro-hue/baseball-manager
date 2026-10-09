import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
const phase=process.argv[2]||'after';
const output=process.env.FINANCE_EVIDENCE_DIR||'test-results/finance-comparison';mkdirSync(output,{recursive:true});
const fixture=JSON.parse(gunzipSync(readFileSync(new URL('../e2e/fixtures/new-game.json.gz',import.meta.url))));
const t=fixture.teams.find(t=>t.id===fixture.myId);
for(const p of [...t.players,...t.farm]){p.salary=0;p.育成=false;}
Object.assign(t.players[0],{salary:100,name:'財務一軍100'});Object.assign(t.players[1],{salary:500,name:'財務一軍500'});
Object.assign(t.farm[0],{salary:900,name:'財務二軍900'});Object.assign(t.farm[1],{salary:300,name:'財務育成300',育成:true});
const browser=await chromium.launch();
for(const width of [360,390,1440]){
 const page=await browser.newPage({viewport:{width,height:width===1440?1000:844}});
 await page.goto('http://127.0.0.1:5173/baseball-manager/');
 await page.evaluate(async fixture=>{await (await import('/baseball-manager/src/engine/saveload.js')).saveGame(fixture);},fixture);
 await page.reload();await page.getByRole('button',{name:'続きから',exact:true}).click();await page.locator('.topbar').waitFor();
 const nav=width<760?page.getByRole('navigation',{name:'メインメニュー'}):page.getByRole('complementary',{name:'監督メニュー'});
 await nav.getByRole('button',{name:/その他/}).click();await page.getByRole('button',{name:'球団運営',exact:true}).click();
 await page.getByText('予算 / 年俸上位',{exact:true}).waitFor();await page.screenshot({path:`${output}/${phase}-${width}.png`,fullPage:true});await (phase==='before'?page.getByText('支出',{exact:true}):page.getByTestId('contract-payroll')).scrollIntoViewIfNeeded();await page.screenshot({path:`${output}/${phase}-${width}-payroll.png`});await page.close();
}
await browser.close();
