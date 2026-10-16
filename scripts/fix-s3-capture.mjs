// Capture an unchanged base worktree with the same FIX-S3 fixture.
// node scripts/fix-s3-capture.mjs /absolute/base-worktree
import { chromium } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const cwd=process.argv[2];
if(!cwd)throw new Error('Provide an unchanged base worktree containing e2e/fixtures/fix-s3.');
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','5174'],{cwd,stdio:'ignore'});
let browser;
try{
  let ready=false;
  for(let i=0;i<100;i++){
    try{const res=await fetch('http://127.0.0.1:5174/baseball-manager/');if(res.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  if(!ready)throw new Error('Baseline Vite did not start.');
  browser=await chromium.launch();
  const measurements=[];
  for(const width of [360,390,1440]){
    const page=await browser.newPage({viewport:{width,height:width===360?800:width===390?844:900}});
    await page.goto('http://127.0.0.1:5174/baseball-manager/e2e/fixtures/fix-s3/index.html');
    const row=page.locator('.first-team-stats tbody tr').filter({hasText:'佐藤海斗'});
    await row.waitFor();
    await page.screenshot({path:`docs/validation/fix-s3/before-list-${width}.png`});
    const list=await row.innerText();
    await row.locator('.stats-player-button').click();
    const detail=page.locator('.player-modal-card');
    await detail.getByRole('tab',{name:'今季成績',exact:true}).click();
    await detail.getByRole('button',{name:'＋ 比較',exact:true}).click();
    await detail.getByRole('tab',{name:'年度別・通算',exact:true}).click();
    const career=detail.locator('.career-detail');
    await career.locator('tbody tr').first().waitFor();
    await career.locator('.detail-table-scroll').evaluate(n=>{n.scrollLeft=n.scrollWidth;});
    await page.screenshot({path:`docs/validation/fix-s3/before-career-${width}.png`});
    measurements.push({width,list,career:await career.locator('tbody tr').allTextContents()});
    await page.close();
  }
  writeFileSync('docs/validation/fix-s3/before.json',JSON.stringify({base:'5ec2e7672115bb2a4fac2f54a4c00b8818ff7fb1',measurements},null,2)+'\n');
}finally{await browser?.close();server.kill();}
