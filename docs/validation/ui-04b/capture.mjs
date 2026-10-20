import { chromium, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
// Run from repo root: node docs/validation/ui-04b/capture.mjs <source-root> <before|after>
const output='docs/validation/ui-04b', source=process.argv[2]||process.cwd(), phase=process.argv[3]||'after';
const server=spawn(process.execPath,[source+'/node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5181'],{cwd:source,stdio:'ignore'});
const base='http://127.0.0.1:5181/baseball-manager/';
for(let i=0;i<100;i++){try{await fetch(base);break;}catch{await new Promise(r=>setTimeout(r,100));}}
const browser=await chromium.launch();const records=[];
try{
  let fixture=existsSync(output+'/fixture.json.gz')?JSON.parse(gunzipSync(readFileSync(output+'/fixture.json.gz'))):null;
  if(!fixture){
    const p=await browser.newPage();await p.goto(base);
    const original=JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz')));
    fixture=await p.evaluate(async fixture=>{
      const {startClubFinance}=await import('/baseball-manager/src/engine/clubFinance.js');
      const {simulateSeasonBatch}=await import('/baseball-manager/src/workers/seasonBatchCore.js');
      const {generateSeasonSchedule}=await import('/baseball-manager/src/engine/scheduleGen.js');
      let seed=20261020;const random=Math.random,now=Date.now;
      Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};Date.now=()=>1792449600000;
      try{
        fixture.teams=fixture.teams.map(t=>startClubFinance(t,fixture.year));
        fixture.schedule=generateSeasonSchedule(fixture.year,fixture.teams);
        Object.assign(fixture,simulateSeasonBatch({snapshot:fixture,count:2,isCancelled:()=>false}).nextState);
        return fixture;
      }finally{Math.random=random;Date.now=now;}
    },original);
    writeFileSync(output+'/fixture.json.gz',gzipSync(JSON.stringify(fixture)));await p.close();
  }
  const sourceFixtureHash=createHash('sha256').update(JSON.stringify(fixture.teams)).digest('hex');
  const widths=phase==='before'?[360,390,1440]:[360,390,760,761,1023,1024,1440];
  for(const width of widths){
    const page=await browser.newPage({viewport:{width,height:width===360?800:width===390?844:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base);await page.evaluate(async fixture=>{const {saveGame}=await import('/baseball-manager/src/engine/saveload.js');if(!(await saveGame(fixture)).ok)throw Error('save failed');},fixture);
    await page.reload();await page.getByRole('button',{name:'続きから',exact:true}).click();
    await page.getByRole('button',{name:'保存',exact:true}).click();
    await expect.poll(()=>page.evaluate(async()=>{const{getSaveQueueSnapshot}=await import('/baseball-manager/src/engine/saveload.js');const q=getSaveQueueSnapshot();return !q.isSaving&&!q.hasQueuedSave;})).toBe(true);
    const canonical=await page.evaluate(async()=>{const{loadGame}=await import('/baseball-manager/src/engine/saveload.js');return JSON.stringify((await loadGame()).teams);});
    const fixtureHash=createHash('sha256').update(canonical).digest('hex');
    await page.waitForTimeout(3600); // Let the explicit-save notification finish before comparing stable layouts.
    await page.locator(width<1024?'.primary-bottom-nav':'.primary-sidebar').getByRole('button',{name:/^経営/}).click();
    await page.getByRole('heading',{name:'球団経営',exact:true}).waitFor();
    for(const route of ['management','finance']){
      if(route==='finance')await page.getByRole('navigation',{name:'経営メニュー'}).getByRole('button',{name:'財務',exact:true}).click();
      if(phase==='before'&&route==='finance')await page.getByText('予算 / 年俸上位',{exact:true}).waitFor();else await page.getByRole('heading',{name:route==='finance'?'財務':'球団経営',exact:true}).waitFor();await page.evaluate(()=>scrollTo(0,0));
      const data=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,smallControls:[...document.querySelectorAll('.club-management button,.club-management input,.club-management summary')].filter(n=>n.getClientRects().length&&n.getBoundingClientRect().height<44).map(n=>({text:n.textContent,height:n.getBoundingClientRect().height}))}));
      if(data.scrollWidth>width)throw Error(`${route} overflow ${width}`);if(phase==='after'&&data.smallControls.length)throw Error(JSON.stringify(data));
      if([360,390,1440].includes(width)){
        await page.screenshot({path:`${output}/${phase}-${route}-${width}.png`,fullPage:true});
        await page.screenshot({path:`${output}/${phase}-${route}-${width}-viewport.png`});
      }
      records.push({route,...data,errors:[...errors],fixtureHash,sourceFixtureHash});
    }
    const saved=await page.evaluate(async()=>{const {loadGame}=await import('/baseball-manager/src/engine/saveload.js');return JSON.stringify((await loadGame()).teams);});
    if(createHash('sha256').update(saved).digest('hex')!==fixtureHash)throw Error('view mutated clubs');
    if(errors.length)throw Error(JSON.stringify(errors));await page.close();
  }
  writeFileSync(`${output}/${phase}-layout.json`,JSON.stringify(records,null,2));console.log(`${phase}: ${records.length} route/width checks; fixture ${sourceFixtureHash}; no page overflow/errors, all club data unchanged`);
}finally{await browser.close();server.kill();}
