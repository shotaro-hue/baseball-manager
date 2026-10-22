import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

// Serve the untouched baseline at 5175 and the proposed tree at 5174.
// CAPTURE_FONT may name a local Japanese font when the host lacks one.
const output = fileURLToPath(new URL('./', import.meta.url));
const fresh = () => JSON.parse(gunzipSync(readFileSync(new URL('../../../e2e/fixtures/new-game.json.gz', import.meta.url))));
const roots = ['baseball_manager_v1', 'baseball_manager_v1_bk1', 'baseball_manager_v1_bk2'];
const browser = await chromium.launch();
const summary = [];
mkdirSync(output, { recursive: true });
for (const port of [5174, 5175]) {
  const deadline = Date.now() + 20_000;
  while (true) {
    try { if ((await fetch(`http://127.0.0.1:${port}/baseball-manager/`)).ok) break; } catch {}
    if (Date.now() >= deadline) throw new Error(`capture server ${port} unavailable`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function font(page) {
  if (!process.env.CAPTURE_FONT) return;
  await page.route('**/capture-font.ttf', route => route.fulfill({ body: readFileSync(process.env.CAPTURE_FONT), contentType: 'font/ttf' }));
  await page.addStyleTag({ content: "@font-face{font-family:CaptureJapanese;src:url('/capture-font.ttf')}*,*::before,*::after{font-family:CaptureJapanese,sans-serif!important}" });
  await page.evaluate(() => document.fonts.load('14px CaptureJapanese'));
}
try {
  for (const [stage, port] of [['before', 5175], ['after', 5174]]) {
    for (const width of [360, 390, 1440]) {
      console.log(`Capturing ${stage} ${width}px`);
      const context = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await context.newPage();
      page.on('pageerror', error => console.error(stage, width, error.message));
      await page.goto(`http://127.0.0.1:${port}/baseball-manager/`);
      const fixture = fresh(); fixture.news = [];
      fixture.seasonHistory.transfers = [
        { id: 'cpu', year: fixture.year, headline: 'CPU間トレード（金額なし）', playersIn: ['加入選手A'], playersOut: ['放出選手B'] },
        { id: 'zero', year: fixture.year, headline: '選手交換（金銭移動なし）', cash: 0 },
        { id: 'null', year: fixture.year, headline: '過去の金額未記録', cash: null },
        { id: 'bad', year: fixture.year, headline: '過去の金額不正', cash: 'invalid' },
        { id: 'pay', year: fixture.year, headline: '金銭を支払ったトレード', cash: 1250 },
        { id: 'receive', year: fixture.year, headline: '金銭を受け取ったトレード', cash: -500 },
      ];
      await page.evaluate(async fixture => {
        const save = await import('/baseball-manager/src/engine/saveload.js');
        if (!(await save.saveGame(fixture)).ok) throw new Error('capture save failed');
      }, fixture);
      await page.reload();
      await page.getByRole('button', { name: '続きから', exact: true }).waitFor();
      await page.getByRole('button', { name: '続きから', exact: true }).click();
      await page.locator('.topbar').waitFor();
      await page.getByRole('button', { name: /^通知（未読/ }).click();
      await page.getByRole('navigation', { name: '通知メニュー' }).getByRole('button', { name: 'ニュース', exact: true }).click();
      const active = page.locator('[data-hub-route]:not([hidden])');
      await active.getByText('CPU間トレード（金額なし）', { exact: true }).waitFor();
      await font(page);
      summary.push({ stage, width, screen: 'news', invalidCashLabels: (await active.innerText()).match(/NaN万円/g)?.length ?? 0,
        validPayment: await active.getByText('金銭支払い 1,250万円', { exact: true }).count(), validReceipt: await active.getByText('金銭受取 500万円', { exact: true }).count() });
      await page.screenshot({ path: `${output}/${stage}-news-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 85 });
      await page.evaluate(roots => roots.forEach(key => localStorage.setItem(key, 'broken')), roots);
      await page.reload(); await page.clock.install();
      await page.getByRole('button', { name: '続きから', exact: true }).click();
      await page.getByRole('alert').waitFor();
      await page.clock.runFor(5000);
      await font(page);
      summary.push({ stage, width, screen: 'title-after-5s', alerts: await page.getByRole('alert').count(), resume: await page.getByRole('button', { name: '続きから', exact: true }).count(), rootsIntact: await page.evaluate(roots => roots.every(key => localStorage.getItem(key) === 'broken'), roots) });
      await page.screenshot({ path: `${output}/${stage}-title-${width}.jpg`, fullPage: true, type: 'jpeg', quality: 85 });
      await context.close();
    }
  }
  writeFileSync(`${output}/capture-summary.json`, JSON.stringify(summary, null, 2) + '\n');
  console.log(JSON.stringify(summary));
} finally { await browser.close(); }
