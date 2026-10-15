import {defineConfig} from '@playwright/test';
import {fileURLToPath} from 'node:url';
const projectRoot=fileURLToPath(new URL('..',import.meta.url));

// Separate port/output keep the generated-pool audit independent of other runs.
export default defineConfig({
  testDir:'../e2e',testMatch:'qa-d1-draft.spec.js',timeout:120_000,
  expect:{timeout:10_000},fullyParallel:false,workers:1,retries:0,
  reporter:[['list']],outputDir:process.env.QA_D1_OUTPUT || (process.env.CI?'../test-results/qa-d1':'/tmp/qa-d1-browser-results'),
  use:{baseURL:'http://127.0.0.1:5181',trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 5181 --strictPort',cwd:projectRoot,url:'http://127.0.0.1:5181/baseball-manager/',reuseExistingServer:!process.env.CI,timeout:120_000},
  projects:['chromium','webkit'].flatMap(browserName=>[360,390,1440].map(width=>({
    name:`${browserName}-${width}`,grepInvert:width<760?/desktop split view/:undefined,use:{browserName,viewport:{width,height:width===360?800:width===390?844:900},
      ...(browserName==='webkit'&&width<760?{isMobile:true,hasTouch:true}:{}),
    },
  }))),
});
