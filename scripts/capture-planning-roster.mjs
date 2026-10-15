import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const phase = process.argv[2] || 'after';
const root = resolve(process.argv[3] || '.');
const dir = resolve('docs/validation/planning-roster');
await mkdir(dir, { recursive: true });
const server = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5193', '--strictPort'], { cwd: root });
await new Promise((ok, fail) => {
  server.stdout.on('data', data => { if (String(data).includes('Local:')) ok(); });
  server.on('error', fail); server.on('exit', code => { if (code) fail(Error(`Vite exited ${code}`)); });
});
const browser = await chromium.launch({ headless: true });
try {
  for (const width of [360, 390, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: width === 360 ? 800 : width === 390 ? 844 : 900 } });
    await page.goto('http://127.0.0.1:5193/baseball-manager/e2e/fixtures/ui03a/index.html');
    await page.locator(phase === 'before' ? '.planning-player' : '.renewal-row').first().waitFor();
    await page.screenshot({ path: `${dir}/${phase}-${width}.png`, fullPage: true });
    await page.screenshot({ path: `${dir}/${phase}-viewport-${width}.png` });
    if (phase === 'after') {
      await page.goto('http://127.0.0.1:5193/baseball-manager/e2e/fixtures/ui03a/index.html?state=open');
      await page.getByRole('button', { name: '選手0の契約更改', exact: true }).click();
      await page.screenshot({ path: `${dir}/negotiation-${width}.png`, fullPage: true });
    }
    await page.close();
  }
} finally { await browser.close(); server.kill(); }
