import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
const phase = process.argv[2] || 'after';
const dir = 'docs/validation/ui-03b';
await mkdir(dir, { recursive: true });
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5193', '--strictPort']);
await new Promise((resolve, reject) => { server.stdout.on('data', data => { if (String(data).includes('Local:')) resolve(); }); server.on('error', reject); server.on('exit', code => { if (code) reject(Error(`Vite exited ${code}`)); }); });
const browser = await chromium.launch({ headless: true });
try {
for (const width of [360, 390, 1440]) {
  const page = await browser.newPage({ viewport: { width, height: width === 360 ? 800 : width === 390 ? 844 : 900 } });
  await page.goto('http://127.0.0.1:5193/baseball-manager/e2e/fixtures/ui03b/index.html');
  await page.locator('.renewal-row').first().waitFor();
  await page.screenshot({ path: `${dir}/${phase}-list-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: '佐藤 海斗の契約更改', exact: true }).click();
  await page.getByRole('heading', { name: '佐藤 海斗', exact: true }).waitFor();
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: `${dir}/${phase}-detail-${width}.png`, fullPage: true });
  await page.screenshot({ path: `${dir}/${phase}-viewport-${width}.png` });
  await page.close();
}
} finally { await browser.close(); server.kill(); }
