// Reproducible browser phase benchmark. Generated baseline modules are removed in finally.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import {farmCalculationWithinBudget} from './farmPerformanceGates.js';
const base='f24b5a313474fb0fc6c34a3369d06aea8268fc9d';
const files=['src/workers/__f04_baseline.js','src/__f04_harness.jsx'];
writeFileSync(files[0],execFileSync('git',['show',`${base}:src/workers/seasonBatchCore.js`]));
writeFileSync(files[1],`import React from 'react';import {createRoot} from 'react-dom/client';import {flushSync} from 'react-dom';import {useGameState} from './hooks/useGameState';
let gs;function Harness(){gs=useGameState();return null;}const node=document.createElement('div');document.body.append(node);const root=createRoot(node);flushSync(()=>root.render(React.createElement(Harness)));
export function adopt(s){let ok;flushSync(()=>{ok=gs.applyProgressCandidate(s);gs.setSchedule(s.schedule);gs.hydrateLargeSaveData(s);gs.hydrateMatchHistory(s);});if(!ok)throw Error('candidate rejected');}
export function close(){root.unmount();node.remove();}`);
const fixture=JSON.parse(gunzipSync(readFileSync('e2e/fixtures/new-game.json.gz')));
const server=spawn('node',['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5174'],{stdio:'ignore'});
const output={base,seed:20261011,samples:3,browser:'chromium',phases:[],capacity:[],memory:'exact RAM not measured; JSON bytes are payload proxies'};
let browser;
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:5174')).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch();const page=await browser.newPage();
 await page.route('http://127.0.0.1:5174/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>F04 measurement</title><script type="module">import RefreshRuntime from "/baseball-manager/@react-refresh";RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>'}));await page.goto('http://127.0.0.1:5174');
 await page.waitForFunction(()=>window.__vite_plugin_react_preamble_installed__===true);
 for(const count of [5,143])for(let sample=0;sample<3;sample++)for(const mode of sample%2?['current','baseline']:['baseline','current']){
  const row=await page.evaluate(async({fixture,count,sample,mode})=>{
   const {migrateFarmCompetition}=await import('/baseball-manager/src/engine/farmMigration.js');
   const {generateSeasonSchedule}=await import('/baseball-manager/src/engine/scheduleGen.js');
   const {simulateSeasonBatch}=await import(`/baseball-manager/src/workers/${mode==='baseline'?'__f04_baseline':'seasonBatchCore'}.js`);
   const {saveGame,loadGame}=await import('/baseball-manager/src/engine/saveload.js');
   const {selectFarmRanking,calcMeasuredFarmAwards}=await import('/baseball-manager/src/engine/farmRankings.js');
   const harness=await import('/baseball-manager/src/__f04_harness.jsx');
   const s=migrateFarmCompetition({...structuredClone(fixture),schedule:generateSeasonSchedule(fixture.year,fixture.teams)});
   const original=Math.random;let seed=20261011;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
   let result,t=performance.now();try{result=simulateSeasonBatch({snapshot:s,count,autoManageMyTeam:true});}finally{Math.random=original;}
   const calculateMs=performance.now()-t;t=performance.now();const cloned=structuredClone(result);const cloneMs=performance.now()-t;
   const next={...s,...cloned.nextState,gameResultsMap:cloned.gameResultsMapPatch,allTeamResultsMap:cloned.allTeamResultsPatch,allTeamBoxScoresMap:cloned.allTeamBoxScoresPatch};
   t=performance.now();harness.adopt(next);const reactAdoptMs=performance.now()-t;
   t=performance.now();if(!(await saveGame(next)).ok)throw Error('save failed');const saveMs=performance.now()-t;
   t=performance.now();const loaded=await loadGame();const loadMs=performance.now()-t;if(loaded.farmCompetition.nextRound!==count+1)throw Error('load position');
   t=performance.now();const ranking=selectFarmRanking(loaded,{league:'セ'});const rankingMs=performance.now()-t;
   if(count===143){window.farmFull=loaded;window.farmFull.seasonHistory.awards=[{year:loaded.year,farmAwards:calcMeasuredFarmAwards(loaded.farmCompetition,loaded.year)}];}
   const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
   return {count,sample,mode,autoManageMyTeam:true,calculateMs,cloneMs,reactAdoptMs,saveMs,loadMs,rankingMs,payloadBytes:bytes(result),farmBytes:bytes(loaded.farmCompetition),players:ranking.rows.length,qualifiedBatters:ranking.rows.filter(p=>p.qualified).length,unplayed:loaded.farmCompetition.cards.filter(c=>c.status==='unplayed').length,
    rescueAppearances:loaded.farmCompetition.usage.reduce((n,p)=>n+p.rescueAppearances,0),overloadAppearances:loaded.farmCompetition.usage.reduce((n,p)=>n+p.overloadAppearances,0),farmConditions:loaded.teams.flatMap(t=>t.farm).reduce((a,p)=>({...a,[p.isPitcher?'pitcher':'batter']:[...(a[p.isPitcher?'pitcher':'batter']||[]),p.condition]}),{})};
  },{fixture,count,sample,mode});output.phases.push(row);process.stdout.write(JSON.stringify(row)+'\n');
 }
 for(const years of [5,20]){
  const row=await page.evaluate(async years=>{
   const {advanceFarmYear}=await import('/baseball-manager/src/engine/farmMigration.js');const {generateSeasonSchedule}=await import('/baseball-manager/src/engine/scheduleGen.js');
   const {farmChecksum}=await import('/baseball-manager/src/engine/farmRecordStats.js');const {saveGame,loadGame}=await import('/baseball-manager/src/engine/saveload.js');
   const s=structuredClone(window.farmFull),year=s.year+years,teams=s.teams.map(t=>({...t,wins:0,losses:0,draws:0}));
   const next=advanceFarmYear(s,{year:s.year+1,teams,nextSchedule:generateSeasonSchedule(s.year+1,teams)}),a=next.seasonHistory.farmArchives[0];
   next.year=year;next.farmCompetition.year=year;next.schedule=generateSeasonSchedule(year,teams);
   next.seasonHistory.farmArchives=Array.from({length:years},(_,i)=>({...structuredClone(a),year:s.year+i}));
   next.seasonHistory.awards=Array.from({length:years},(_,i)=>({...structuredClone(s.seasonHistory.awards[0]),year:s.year+i,farmAwards:{...structuredClone(s.seasonHistory.awards[0].farmAwards),year:s.year+i}}));
   next.farmCompetition.archiveSignature=farmChecksum(next.seasonHistory.farmArchives);
   const {sealFarmCompetition}=await import('/baseball-manager/src/engine/farmRecordStats.js');sealFarmCompetition(next.farmCompetition);
   let t=performance.now();if(!(await saveGame(next)).ok)throw Error('long save failed');const saveMs=performance.now()-t;
   t=performance.now();const restored=await loadGame();const loadMs=performance.now()-t;
   if(restored.seasonHistory.farmArchives.length!==years||restored.seasonHistory.awards.length!==years)throw Error('history lost');
   const bytes=v=>new TextEncoder().encode(JSON.stringify(v)).length;
   const estimate=await navigator.storage.estimate();
   return {years,synthetic:true,archiveBytes:bytes(next.seasonHistory.farmArchives),stateBytes:bytes(next),saveMs,loadMs,originUsageBytes:estimate.usage,localStorageChars:Object.keys(localStorage).reduce((n,k)=>n+(localStorage.getItem(k)?.length||0),0)};
  },years);output.capacity.push(row);process.stdout.write(JSON.stringify(row)+'\n');
 }
 const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
 output.summary=[5,143].map(count=>{const rows=output.phases.filter(r=>r.count===count),m=mode=>Object.fromEntries(['calculateMs','cloneMs','reactAdoptMs','saveMs','loadMs','rankingMs'].map(k=>[k,median(rows.filter(r=>r.mode===mode).map(r=>r[k]))]));return {count,baseline:m('baseline'),current:m('current')};});
 output.gates={calculation:output.summary.every(r=>farmCalculationWithinBudget(r.baseline.calculateMs,r.current.calculateMs)),ranking:output.phases.every(r=>r.rankingMs<100),archives:output.capacity.every(r=>r.archiveBytes<20*1024*1024)};
 writeFileSync('.superpowers/sdd/farm-f04/benchmark.json',JSON.stringify(output,null,2));process.stdout.write(JSON.stringify({summary:output.summary,gates:output.gates})+'\n');
}finally{await browser?.close();server.kill();for(const file of files)try{unlinkSync(file);}catch{}}
