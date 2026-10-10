// Same fixtures, browser and 10 samples; baseline module is generated from the base commit and removed on exit.
import { chromium, webkit } from '@playwright/test';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync, spawn } from 'node:child_process';
const base = '9efaf56a581d7fd2a79ae5f777516dc05ac21a62';
const baselinePath = 'src/engine/__f3_baseline.js';
writeFileSync(baselinePath, execFileSync('git',['show',`${base}:src/engine/saveload.js`]));
const fixture = JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz')));
const server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{stdio:'ignore'});
const results=[];
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5174')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
 for(const [browserName, launcher] of (process.env.F3_PERF_WEBKIT === '1' ? [['chromium',chromium],['mobile-webkit',webkit]] : [['chromium',chromium]])) {
  const browser=await launcher.launch();
  for(const scenario of ['initial','match','batch5','offseason','five-year','backup']) {
   for(const mode of ['baseline','current']) {
    const samples=[], loads=[], sizes=[], usages=[];
    const context=await browser.newContext(browserName==='mobile-webkit'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
    const page=await context.newPage();
    await page.route('http://127.0.0.1:5174/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage benchmark</title>'}));
    await page.goto('http://127.0.0.1:5174');
    await page.evaluate(fixture => { window.benchmarkFixture = fixture; }, fixture);
    for(let sample=0;sample<10;sample++) {
     const row=await page.evaluate(async({scenario,mode,sample})=>{
      localStorage.clear();
      await new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase('baseball_manager_storage');req.onsuccess=resolve;req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('benchmark reset blocked'));});
      const m=await import(`/baseball-manager/src/engine/${mode==='baseline'?'__f3_baseline':'saveload'}.js?sample=${sample}`);
      const s=structuredClone(window.benchmarkFixture);s.saveId='perf';
      const result={won:true,drew:false,myScore:2,oppScore:1,oppId:1,oppName:'相手',log:[],inningSummary:[]};
      s.gameResultsMap={};s.allTeamResultsMap={};s.allTeamBoxScoresMap={};s.news=[];s.mailbox=[];
      const games=scenario==='match'?1:scenario==='batch5'?5:scenario==='five-year'||scenario==='offseason'?143:0;
      for(let day=1;day<=games;day++)s.gameResultsMap[day]={...result,gameNo:day};
      s.gameDay=games+1;
      if(scenario==='offseason')s.offseasonPlan={version:1,year:s.year,myId:s.myId,stage:'contracts',resumeScreen:'contract_renewal'};
      if(scenario==='five-year'){
       s.year=2031;s.scheduleArchive=Array.from({length:5},(_,i)=>({year:2026+i,schedule:[],gameResultsMap:structuredClone(s.gameResultsMap)}));
       s.seasonHistory={...s.seasonHistory,standingsHistory:Array.from({length:5},(_,i)=>({year:2026+i,teams:s.teams.map(t=>({id:t.id,wins:70,losses:70,draws:3}))}))};
      }
      // Initial is a genuinely empty origin; all other scenarios have a prior committed generation.
      if(scenario!=='initial') {
       if(scenario==='five-year'||scenario==='backup'){await m.saveGame({...s,gameDay:Math.max(1,s.gameDay-2)});localStorage.setItem('baseball_manager_v1_last_rotate_at','0');}
       await m.saveGame({...s,gameDay:Math.max(1,s.gameDay-1)});localStorage.setItem('baseball_manager_v1_last_rotate_at','0');
      }
      const options=scenario==='match'||scenario==='batch5'?{dirtyScopes:['news','mailbox','matchHistory']}:{};
      const start=performance.now();const saved=await m.saveGame(s,options);const saveMs=performance.now()-start;
      if(!saved.ok)throw new Error(`benchmark save failed: ${JSON.stringify(saved)}`);
      if(scenario==='backup')localStorage.setItem('baseball_manager_v1','corrupt');
      const readStart=performance.now();const loaded=await m.loadGame();const loadMs=performance.now()-readStart;if(!loaded)throw new Error('benchmark load failed');
      const {openBaseballManagerDb}=await import('/baseball-manager/src/engine/baseballManagerDb.js');const db=await openBaseballManagerDb();
      const values=await new Promise((resolve,reject)=>{const tx=db.transaction('save_chunks','readonly'),req=tx.objectStore('save_chunks').getAll();tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);});db.close();
      const chunkBytes=new TextEncoder().encode(JSON.stringify(values)).length;
      const localBytes=['baseball_manager_v1','baseball_manager_v1_bk1','baseball_manager_v1_bk2'].reduce((n,k)=>n+2*(localStorage.getItem(k)?.length??0),0);
      const estimate=await navigator.storage?.estimate?.();return {saveMs,loadMs,chunkBytes,localBytes,usage:estimate?.usage??null};
     },{scenario,mode,sample});
     samples.push(row.saveMs);loads.push(row.loadMs);sizes.push({chunks:row.chunkBytes,local:row.localBytes});usages.push(row.usage);
    }
    await context.close();
    const stats=a=>{const sorted=[...a].sort((a,b)=>a-b);return{median:(sorted[4]+sorted[5])/2,max:Math.max(...a)};};
    results.push({browser:browserName,scenario,mode,n:10,save:stats(samples),load:stats(loads),bytes:sizes[9],originUsageBytes:usages[9]});
    process.stdout.write(`${browserName} ${scenario} ${mode}: ${JSON.stringify(results.at(-1))}\n`);
   }
  }await browser.close();
 }
 writeFileSync('/tmp/f3-performance.json',JSON.stringify({base,fixture:'new-game fixture with deterministic history expansion, not multi-year gameplay',results},null,2));
}finally{server.kill();try{unlinkSync(baselinePath);}catch{}}
