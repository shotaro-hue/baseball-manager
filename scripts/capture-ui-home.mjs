import {spawn} from 'node:child_process';
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import {gunzipSync} from 'node:zlib';
const phase=process.argv[2] ?? 'after';
if (!['before','after'].includes(phase)) throw Error('Use before or after');
const root=fileURLToPath(new URL('..',import.meta.url));
const folder=root+'/docs/validation/ui01b/'+phase;
mkdirSync(folder,{recursive:true});
const fixture=JSON.parse(gunzipSync(readFileSync(root+'/e2e/fixtures/new-game.json.gz')));
const server=spawn('node',[root+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{cwd:root,stdio:'ignore'});
await new Promise((resolve,reject)=>{let count=0;const timer=setInterval(async()=>{try{const r=await fetch('http://127.0.0.1:5174/baseball-manager/');if(r.ok){clearInterval(timer);resolve();}}catch{}if(++count>100){clearInterval(timer);reject(Error('server unavailable'));}},100);});
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
const base='http://127.0.0.1:5174/baseball-manager/';
await page.goto(base);
await page.evaluate(async state=>{const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');const r=await saveGame(state);if(!r.ok)throw Error('fixture save failed');},fixture);
await page.reload();await page.getByRole('button',{name:'続きから',exact:true}).click();
await page.locator('.calm-shell').waitFor();
const checks=[];
for(const width of [360,390,760,761,1023,1024,1440]){
 const height=width===360?800:width===390?844:900;
 await page.setViewportSize({width,height});
 await page.screenshot({path:folder+'/home-'+width+'.png',fullPage:false});
 if ([360,390,1440].includes(width)) await page.screenshot({path:folder+'/home-full-'+width+'.png',fullPage:true});
 checks.push(await page.evaluate(({width,height})=>({screen:'home',width,height,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button,select,summary,input')].filter(e=>e.getClientRects().length>0 && e.getBoundingClientRect().width>0).map(e=>({text:e.textContent,height:(e.type==='checkbox'?e.closest('label'):e).getBoundingClientRect().height,background:getComputedStyle(e).backgroundColor,font:getComputedStyle(e).fontSize}))}),{width,height}));
}
await page.setViewportSize({width:390,height:844});
await page.getByRole('navigation',{name:'メインメニュー'}).getByRole('button',{name:'編成',exact:true}).click();
const old=await page.locator('.mobile-roster').evaluate(e=>({color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,font:getComputedStyle(e).fontSize,button:[...e.querySelectorAll('button')].map(b=>({label:b.textContent,color:getComputedStyle(b).color,background:getComputedStyle(b).backgroundColor,height:b.getBoundingClientRect().height}))}));
writeFileSync(folder+'/old-roster-style.json',JSON.stringify(old,null,2));
await page.goto(base+'e2e/fixtures/ui01b/index.html');
for(const width of [360,390,1440]) {
 const height=width===360?800:width===390?844:900;
 await page.setViewportSize({width,height});
 for(const state of ['no-schedule','blocked','processing','complete']) {
  await page.getByLabel('表示状態').selectOption(state);
  await page.screenshot({path:folder+'/state-'+state+'-'+width+'.png',fullPage:true});
  checks.push(await page.evaluate(({width,height,state})=>({screen:'component-fixture-'+state,width,height,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('button,select,summary,input')].filter(e=>e.getClientRects().length>0&&e.getBoundingClientRect().width>0).map(e=>({text:e.textContent,height:(e.type==='checkbox'?e.closest('label'):e).getBoundingClientRect().height}))}),{width,height,state}));
 }
}
writeFileSync(folder+'/layout.json',JSON.stringify(checks,null,2));
await browser.close();server.kill();
console.log(phase,checks.length,'states',checks.filter(x=>x.overflow).length,'overflow');
