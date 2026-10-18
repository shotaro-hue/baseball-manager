import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {resolve} from 'node:path';
const phase=process.argv[2]||'after',root=resolve(process.argv[3]||'.'),dir=resolve('docs/validation/roster-planning-65');
await mkdir(dir,{recursive:true});
const server=spawn(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port','5195','--strictPort'],{cwd:root});
await new Promise((ok,fail)=>{server.stdout.on('data',d=>{if(String(d).includes('Local:'))ok();});server.on('error',fail);server.on('exit',c=>{if(c)fail(Error(`Vite${c}`));});});
const browser=await chromium.launch({headless:true});
try{for(const width of [360,390,1440]){
 const page=await browser.newPage({viewport:{width,height:width===360?800:width===390?844:1000}});
 await page.goto('http://127.0.0.1:5195/baseball-manager/e2e/fixtures/ui03a/index.html?state=open');await page.locator('.planning-screen').waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`${dir}/${phase}-${width}.png`,fullPage:true});
 if(phase==='after'){
  await page.getByRole('button',{name:'補強予定を編集',exact:true}).click();const dialog=page.getByRole('dialog',{name:'補強予定',exact:true});
  await dialog.getByLabel('ドラフト予定人数',{exact:true}).fill('4');await dialog.getByLabel('FA予定人数',{exact:true}).fill('2');
  await dialog.getByLabel('選手5',{exact:true}).check();await page.screenshot({path:`${dir}/edit-${width}.png`,fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('horizontal overflow');
 }
 await page.close();
}}finally{await browser.close();server.kill();}
