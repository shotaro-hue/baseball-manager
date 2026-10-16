// Reproducible before/after capture against a Vite server in this same runtime.
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {installVariableDraft} from '../e2e/helpers/variableDraft.js';
const url=process.env.CAPTURE_URL || 'http://127.0.0.1:5173',prefix=process.env.CAPTURE_PREFIX || 'after';
const browser=await chromium.launch();
try{
 for(const width of [360,390,1440]){
  const context=await browser.newContext({baseURL:url,viewport:{width,height:width===360?800:width===390?844:1000}});
  const page=await context.newPage();await installVariableDraft(page,{legacy:prefix==='before'});
  await page.locator('.draft-candidate-list').waitFor();
  mkdirSync('docs/validation/variable-draft',{recursive:true});
  await page.screenshot({path:`docs/validation/variable-draft/${prefix}-lottery-${width}.png`,fullPage:true});
  console.log(prefix,width,await page.locator('.draft-list-heading').innerText());await context.close();
 }
}finally{await browser.close();}
