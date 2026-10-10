// F3-B versus F3-A, same fixtures and browser, 10 samples; initial includes full career initialization, IDB bytes include legacy career rows; baseline module is generated from the base commit and removed on exit.
import { chromium, webkit } from '@playwright/test';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { execFileSync, spawn } from 'node:child_process';
const base = '6b59654c140780cac5ffcb03980cc27a624f6850';
const baselinePath = 'src/engine/__f3_baseline.js';
writeFileSync(baselinePath, execFileSync('git',['show',`${base}:src/engine/saveload.js`]).toString().replace("'./saveGenerations'", "'./__f3_baseline_generations'"));
const baselineGenerationPath='src/engine/__f3_baseline_generations.js';
writeFileSync(baselineGenerationPath,execFileSync('git',['show',`${base}:src/engine/saveGenerations.js`]));
let fixture = JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz')));
const server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{stdio:'ignore'});
const results=[];
try {
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5174')).ok)break;}catch{} await new Promise(r=>setTimeout(r,100));}
 for(const [browserName, launcher] of (process.env.F3_PERF_WEBKIT === '1' ? [['chromium',chromium],['mobile-webkit',webkit]] : [['chromium',chromium]])) {
  const browser=await launcher.launch();
  const fixturePage=await browser.newPage();
  await fixturePage.route('http://127.0.0.1:5174/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture generation</title>'}));
  await fixturePage.goto('http://127.0.0.1:5174');
  const fullTeams=await fixturePage.evaluate(async()=>{
    const original=Math.random;let seed=20261009;
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    try{return (await import('/baseball-manager/src/engine/bootstrapTeams.js')).createInitialTeams();}finally{Math.random=original;}
  });
  fixture={...fixture,teams:fullTeams};await fixturePage.close();
  process.stdout.write(`Full career fixture: ${fullTeams.flatMap(t=>[...t.players,...t.farm]).reduce((n,p)=>n+(p.careerLog?.length??0),0)} entries; seed 20261009\n`);
  for(const scenario of ['initial','match','batch5','offseason','five-year','five-year-partial','backup']) {
   for(const mode of ['baseline','current']) {
    const samples=[], loads=[], sizes=[], usages=[];
    for(let sample=0;sample<10;sample++) {
     // Fresh origin per sample prevents tombstones from deleted databases distorting usage estimates.
     const context=await browser.newContext(browserName==='mobile-webkit'?{viewport:{width:390,height:844},isMobile:true,hasTouch:true}:{});
     const page=await context.newPage();
     await page.route('http://127.0.0.1:5174/', route => route.fulfill({contentType:'text/html',body:'<!doctype html><title>Storage benchmark</title>'}));
     await page.goto('http://127.0.0.1:5174');
     await page.evaluate(fixture => { window.benchmarkFixture = fixture; }, fixture);
     const row=await page.evaluate(async({scenario,mode,sample})=>{
      localStorage.clear();
      await new Promise((resolve,reject)=>{const req=indexedDB.deleteDatabase('baseball_manager_storage');req.onsuccess=resolve;req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error('benchmark reset blocked'));});
      const m=await import(`/baseball-manager/src/engine/${mode==='baseline'?'__f3_baseline':'saveload'}.js?sample=${sample}`);
      const s=structuredClone(window.benchmarkFixture);s.saveId='perf';
      const result={won:true,drew:false,myScore:2,oppScore:1,oppId:1,oppName:'相手',log:[],inningSummary:[]};
      s.gameResultsMap={};s.allTeamResultsMap={};s.allTeamBoxScoresMap={};s.news=[];s.mailbox=[];
      const games=scenario==='match'?1:scenario==='batch5'?5:scenario.startsWith('five-year')||scenario==='offseason'?143:0;
      for(let day=1;day<=games;day++)s.gameResultsMap[day]={...result,gameNo:day};
      s.gameDay=games+1;
      if(scenario==='offseason')s.offseasonPlan={version:1,year:s.year,myId:s.myId,stage:'contracts',resumeScreen:'contract_renewal'};
      if(scenario.startsWith('five-year')){
       s.year=2031;
       for(const t of s.teams)for(const p of [...t.players,...t.farm])p.careerLog=[...(p.careerLog||[]),...Array.from({length:5},(_,i)=>({year:2026+i,teamId:t.id,teamName:t.name,stats:structuredClone(p.stats),playoffStats:structuredClone(p.playoffStats)}))];
       s.scheduleArchive=Array.from({length:5},(_,i)=>({year:2026+i,schedule:[],gameResultsMap:structuredClone(s.gameResultsMap)}));
       s.seasonHistory={...s.seasonHistory,standingsHistory:Array.from({length:5},(_,i)=>({year:2026+i,teams:s.teams.map(t=>({id:t.id,wins:70,losses:70,draws:3}))}))};
      }
      const initialHistory=s.teams.flatMap(t=>[...t.players,...t.farm]).map(p=>({playerId:String(p.id),careerEntries:p.careerLog??[]}));
      if(mode==='baseline'&&scenario!=='initial')await m.initializeCareerLogsInIndexedDb(initialHistory);
      // Initial is a genuinely empty origin; all other scenarios have a prior committed generation.
      if(scenario!=='initial') {
       if(scenario.startsWith('five-year')||scenario==='backup'){await m.saveGame({...s,gameDay:Math.max(1,s.gameDay-2)});localStorage.setItem('baseball_manager_v1_last_rotate_at','0');}
       if(scenario==='five-year'&&mode==='baseline')await m.appendCareerEntriesToIndexedDb([{playerId:String(s.teams[0].players[0].id),careerEntry:{year:2030,teamId:s.teams[0].id,stats:{HR:1}}}]);
       await m.saveGame({...s,gameDay:Math.max(1,s.gameDay-1)},scenario==='five-year'&&mode==='current'?{careerEntries:[{playerId:String(s.teams[0].players[0].id),careerEntry:{year:2030,teamId:s.teams[0].id,stats:{HR:1}}}]}:{});localStorage.setItem('baseball_manager_v1_last_rotate_at','0');
      }
      const options=scenario==='match'||scenario==='batch5'||scenario==='five-year-partial'?{dirtyScopes:['news','mailbox','matchHistory']}:scenario==='five-year'?{careerEntries:[{playerId:String(s.teams[0].players[0].id),careerEntry:{year:2030,teamId:s.teams[0].id,stats:{HR:2}}}]}:{};
      const start=performance.now();if(mode==='baseline'&&options.careerEntries)await m.appendCareerEntriesToIndexedDb(options.careerEntries);if(mode==='baseline'&&scenario==='initial')await m.initializeCareerLogsInIndexedDb(initialHistory);const saved=await m.saveGame(s,options);const saveMs=performance.now()-start;
      if(!saved.ok)throw new Error(`benchmark save failed: ${JSON.stringify(saved)}`);
      if(scenario==='backup')localStorage.setItem('baseball_manager_v1','corrupt');
      const readStart=performance.now();const loaded=await m.loadGame();const loadMs=performance.now()-readStart;if(!loaded)throw new Error('benchmark load failed');
      const {openBaseballManagerDb}=await import('/baseball-manager/src/engine/baseballManagerDb.js');const db=await openBaseballManagerDb();
      const values=await new Promise((resolve,reject)=>{const tx=db.transaction('save_chunks','readonly'),req=tx.objectStore('save_chunks').getAll();tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);});db.close();
      const oldDb=await openBaseballManagerDb();const legacyValues=await new Promise((resolve,reject)=>{const tx=oldDb.transaction('career_logs','readonly'),req=tx.objectStore('career_logs').getAll();tx.oncomplete=()=>resolve(req.result);tx.onabort=()=>reject(tx.error);});oldDb.close();
      const chunkBytes=new TextEncoder().encode(JSON.stringify(values)).length+new TextEncoder().encode(JSON.stringify(legacyValues)).length;
      const localBytes=['baseball_manager_v1','baseball_manager_v1_bk1','baseball_manager_v1_bk2'].reduce((n,k)=>n+2*(localStorage.getItem(k)?.length??0),0);
      const estimate=await navigator.storage?.estimate?.();return {saveMs,loadMs,chunkBytes,localBytes,usage:estimate?.usage??null};
     },{scenario,mode,sample});
     samples.push(row.saveMs);loads.push(row.loadMs);sizes.push({chunks:row.chunkBytes,local:row.localBytes});usages.push(row.usage);await context.close();
    }
    const stats=a=>{const sorted=[...a].sort((a,b)=>a-b);return{median:(sorted[4]+sorted[5])/2,max:Math.max(...a)};};
    results.push({browser:browserName,scenario,mode,n:10,save:stats(samples),load:stats(loads),bytes:sizes[9],originUsageBytes:usages[9],saveSamplesMs:samples,loadSamplesMs:loads,sizeSamples:sizes,originUsageSamples:usages});
    process.stdout.write(`${browserName} ${scenario} ${mode}: ${JSON.stringify(results.at(-1))}\n`);
   }
  }await browser.close();
 }
 writeFileSync('/tmp/f3-b-performance.json',JSON.stringify({base,fixture:'actual createInitialTeams, deterministic seed 20261009, full initial career; five-year adds synthetic seasons to every roster player; not multi-year gameplay',results},null,2));
}finally{server.kill();try{unlinkSync(baselinePath);unlinkSync(baselineGenerationPath);}catch{}}
